import React, { useEffect, useState, useMemo, useRef } from "react";
import { TranscriptProvider, useTranscript } from "../contexts/TranscriptContext";
import { Transcript } from "./Transcript";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { vocabularyTeacherAgent } from "../agentConfigs/vocabularyTeacher";
import { startReviewSession, DEFAULT_USER_ID } from "../utils/graphql";
import { fsrsReview } from "../utils/fsrsClient";

// Import tools to be used by the agent
import { z } from "zod";
import { handoff } from "@openai/agents-core";
import { createSubmitWordRatingTool } from "../utils/submitWordRatingTool";
import { createVocabularyRaterAgent } from "../utils/vocabularyRater";
import { createStartWordReviewTool } from "../utils/wordTrackingTool";
import { createGetActiveWordEvidenceTool } from "../utils/getActiveWordEvidenceTool";
import { createGetNextWordTool } from "../utils/getNextWordTool";

import { loadPendingReviewUpdates, clearPendingReviewUpdates } from "../utils/reviewSessionStorage";
import { saveReviewSession } from "../utils/graphql";

function VoiceAgentContent({ onNavigateBack }) {
    const { addTranscriptBreadcrumb } = useTranscript();
    const [isConnecting, setIsConnecting] = useState(false);
    const portRef = useRef(null);
    const permissionResolveRef = useRef(null);

    // State for due vocabulary entries
    const [dueEntries, setDueEntries] = useState([]);
    const [loadingDue, setLoadingDue] = useState(false);
    const [dueError, setDueError] = useState("");

    const entriesByIdRef = useRef(new Map());

    const getNextWordTool = useMemo(() => {
        return createGetNextWordTool({
            onBreadcrumb: (msg) => addTranscriptBreadcrumb(msg),
        });
    }, [addTranscriptBreadcrumb]);

    // The evidence tool that capture user-assistant converation for the active word
    // used by the rater agent
    const getActiveWordEvidenceTool = useMemo(() => {
        return createGetActiveWordEvidenceTool();
    }, []);

    const submitWordRatingTool = useMemo(() => {
        return createSubmitWordRatingTool({
            userId: DEFAULT_USER_ID,
            getEntryById: (id) => entriesByIdRef.current.get(id),
            onBreadcrumb: (msg) => addTranscriptBreadcrumb(msg),
        });
    }, [addTranscriptBreadcrumb]);

    const startWordReviewTool = useMemo(() => {
        return createStartWordReviewTool({
            onBreadcrumb: (msg) => addTranscriptBreadcrumb(msg),
        });
    }, [addTranscriptBreadcrumb]);

    const raterAgent = useMemo(() => {
        return createVocabularyRaterAgent({
            submitWordRatingTool,
            getActiveWordEvidenceTool,
        });
    }, [submitWordRatingTool, getActiveWordEvidenceTool]);

    useEffect(() => {
        // rater -> teacher
        const backToTeacher = handoff(vocabularyTeacherAgent, {
            toolNameOverride: "back_to_teacher",
            toolDescriptionOverride: "Return control to the tutor agent.",
        });

        // teacher -> rater (pass vocabularyId)
        const toRater = handoff(raterAgent, {
            toolNameOverride: "rate_word",
            toolDescriptionOverride: "Hand off to evaluator to rate a vocabulary word by id.",
            inputType: z.object({
                vocabularyId: z.string(),
                evidence: z.string().nullable(),
            }), onHandoff: (runContext, input) => {
                runContext.context.currentVocabularyId = input?.vocabularyId ?? null;
                runContext.context.currentRatingEvidence = input?.evidence ?? null;
            },
        });

        // Make the handoff tools available *before* any handoff happens
        vocabularyTeacherAgent.handoffs = [toRater];
        raterAgent.handoffs = [backToTeacher];
    }, [raterAgent]);

    useEffect(() => {
        const map = new Map();
        for (const e of dueEntries) map.set(e.id, e);
        entriesByIdRef.current = map;
    }, [dueEntries]);

    // Fetch due vocabulary entries
    useEffect(() => {
        let cancelled = false;
        async function loadDue() {
            try {
                setLoadingDue(true);
                setDueError("");
                addTranscriptBreadcrumb("Loading due words");
                const entries = await startReviewSession(DEFAULT_USER_ID);
                if (!cancelled) setDueEntries(entries);
                if (entries.length === 0) {
                    addTranscriptBreadcrumb("No due words yet");
                } else {
                    addTranscriptBreadcrumb(`Loaded ${entries.length} due words`);
                }
            } catch (e) {
                if (!cancelled) setDueError(e.message || "Failed to load due words");
            } finally {
                if (!cancelled) setLoadingDue(false);
            }
        }

        async function loadPending() {
            const pending = await loadPendingReviewUpdates(DEFAULT_USER_ID);
            if (cancelled) return;

            if (pending.length > 0) {
                addTranscriptBreadcrumb(`Found ${pending.length} pending review updates (sync on disconnect).`);
            }
        }
        loadPending().catch((e) => addTranscriptBreadcrumb(`Pending load failed: ${e.message || e}`));
        loadDue();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        portRef.current = chrome.runtime.connect({ name: "extension-popup" });
        portRef.current.onMessage.addListener((msg) => {
            if (msg.type === 'MIC_PERMISSION_RESULT') {
                // console.log('[VoiceAgent] Permission result:', msg);
                if (permissionResolveRef.current) {
                    if (msg.success) {
                        permissionResolveRef.current.resolve();
                    } else {
                        permissionResolveRef.current.reject(new Error(msg.error || 'Permission denied'));
                    }
                    permissionResolveRef.current = null;
                }
            }
        });

        return () => {
            portRef.current?.disconnect();
        };
    }, []);


    // Create audio element for playback
    const sdkAudioElement = useMemo(() => {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }, []);

    // Use the Realtime session hook
    const { status, connect, disconnect } = useRealtimeSession({
        onConnectionChange: (newStatus) => {
            // console.log('Connection status changed:', newStatus);
            setIsConnecting(newStatus === 'CONNECTING');
        },
    });

    // Fetch ephemeral key from voice server
    const fetchEphemeralKey = async () => {
        try {
            const response = await fetch('http://localhost:3002/api/session', {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.client_secret?.value) {
                throw new Error('No ephemeral key received');
            }

            // console.log('Ephemeral key received');
            return data.client_secret.value;

        } catch (error) {
            console.error('Failed to fetch ephemeral key:', error);
            throw error;
        }
    };

    // Request microphone permission helper
    const requestMicrophonePermission = () => {
        return new Promise((resolve, reject) => {
            permissionResolveRef.current = { resolve, reject };

            console.log('[VoiceAgent] Requesting microphone permission...');
            portRef.current?.postMessage({ type: 'REQUEST_MIC_PERMISSION' });

            setTimeout(() => {
                if (permissionResolveRef.current) {
                    permissionResolveRef.current.reject(new Error('Permission request timeout'));
                    permissionResolveRef.current = null;
                }
            }, 30000);
        });
    };

    // Connect to OpenAI Realtime API
    const handleStartPractice = async () => {
        try {
            // Request microphone permission first
            addTranscriptBreadcrumb('Requesting microphone permission');
            await requestMicrophonePermission();
            addTranscriptBreadcrumb('Microphone permission granted');
            addTranscriptBreadcrumb('Connecting to voice agent');
            vocabularyTeacherAgent.tools = [startWordReviewTool, getNextWordTool];
            await connect({
                getEphemeralKey: fetchEphemeralKey,
                initialAgents: [vocabularyTeacherAgent],
                audioElement: sdkAudioElement,
                extraContext: {
                    currentWordIndex: 0,
                    currentVocabularyId: null,
                    vocabularyWords: dueEntries.map(e => ({
                        id: e.id,
                        text: e.text,
                        definition: e.definition,
                        example: e.example,
                        exampleTrans: e.exampleTrans,
                        realLifeDef: e.realLifeDef,
                        surroundingText: e.surroundingText,
                        videoTitle: e.videoTitle,
                    })),
                    totalWords: dueEntries.length,
                },
            });
            addTranscriptBreadcrumb('Connected! Start speaking to practice');

        } catch (error) {
            console.error('Connection failed:', error);
            addTranscriptBreadcrumb('Connection failed');
        }
    };

    // Flush pending review updates when disconnecting
    const flushPendingReviewUpdates = async () => {
        const pending = await loadPendingReviewUpdates(DEFAULT_USER_ID);

        if (!pending.length) {
            addTranscriptBreadcrumb("No pending review updates to sync");
            return;
        }

        // Backend CardUpdateInput does NOT include rating/evidence; strip extras
        const updates = pending.map(({ rating, evidence, ...rest }) => rest);

        addTranscriptBreadcrumb(`Syncing ${updates.length} review updates…`);
        const result = await saveReviewSession(updates);

        if (!result?.success) {
            throw new Error(result?.message || "saveReviewSession failed");
        }

        await clearPendingReviewUpdates(DEFAULT_USER_ID);
        addTranscriptBreadcrumb(`Synced ${result.savedCount} updates`);
    };

    // Disconnect from API
    const handleStopPractice = async () => {
        disconnect();
        addTranscriptBreadcrumb('Disconnected from voice agent');

        try {
            await flushPendingReviewUpdates();
        } catch (e) {
            addTranscriptBreadcrumb(`Sync failed (will retry next time): ${e.message || e}`);
        }
    };

    // Cleanup audio element
    useEffect(() => {
        return () => {
            if (sdkAudioElement && document.body.contains(sdkAudioElement)) {
                document.body.removeChild(sdkAudioElement);
            }
        };
    }, [sdkAudioElement]);

    // // test
    // const handleFsrsTest = async () => {
    //     try {
    //         const first = dueEntries[0];
    //         if (!first) {
    //             addTranscriptBreadcrumb("No due entries to test FSRS.");
    //             return;
    //         }

    //         const updated = await fsrsReview({
    //             fsrsCard: first.fsrsCard,
    //             rating: 3, // Good
    //         });

    //         console.log("[FSRS TEST] updated:", updated);
    //         addTranscriptBreadcrumb(`FSRS ok → next due: ${updated.dueDate}`);
    //     } catch (e) {
    //         console.error("[FSRS TEST] error:", e);
    //         addTranscriptBreadcrumb(`FSRS failed: ${e.message || e}`);
    //     }
    // };

    return (
        <div className="voice-page">
            <div className="voice-transcript-wrapper">
                <Transcript
                    userText=""
                    setUserText={() => {
                    }}
                    onSendMessage={() => {
                    }}
                    canSend={false}
                    downloadRecording={() => console.log("Download clicked")}
                    isVoiceOnly={true}
                />
            </div>
            <div className="voice-footer">
                <button className="mutliline-button" onClick={onNavigateBack}>
                    <span>Back to</span>
                    <span>Captions</span>
                </button>

                {(status === 'DISCONNECTED' || status === 'CONNECTING') && (<button
                    onClick={handleStartPractice}
                    className={`voice-connect-button${isConnecting ? " is-connecting" : ""}`}
                    disabled={isConnecting}
                >
                    {isConnecting ? 'Connecting' : 'Connect'}
                </button>)}

                {status === 'CONNECTED' && (<button
                    onClick={handleStopPractice}
                    className="voice-disconnect-button"
                >
                    Disconnect
                </button>)}
                {/* <button className="voice-disconnect-button" onClick={handleFsrsTest}>
                    FSRS Test
                </button> */}
            </div>
        </div>);
}

function VoiceAgent({ onNavigateBack }) {
    return (<TranscriptProvider>
        <VoiceAgentContent onNavigateBack={onNavigateBack} />
    </TranscriptProvider>);
}

export default VoiceAgent;
