import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { TranscriptProvider, useTranscript } from "../contexts/TranscriptContext";
import { Transcript } from "./Transcript";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { vocabularyTeacherAgent } from "../agentConfigs/vocabularyTeacher";
import { startReviewSession, DEFAULT_USER_ID } from "../utils/graphql";
import { fetchRolePlayPlan } from "../utils/rolePlayClient";
import { createSceneTools } from "../utils/sceneTools";
import { rateScene } from "../utils/sceneRatingClient";

import { createSubmitWordRatingTool } from "../utils/submitWordRatingTool";

import { loadPendingReviewUpdates, clearPendingReviewUpdates } from "../utils/reviewSessionStorage";
import { saveReviewSession } from "../utils/graphql";

// Import memory tool
import { loadMemoryBootstrap, searchSemanticMemory, updateMemoryBucket, addSemanticMemory } from
    "../utils/memoryClient";

function VoiceAgentContent({ onNavigateBack }) {
    const { addTranscriptBreadcrumb, setActiveWords } = useTranscript();
    const [isConnecting, setIsConnecting] = useState(false);
    const portRef = useRef(null);
    const permissionResolveRef = useRef(null);
    const memoryRef = useRef(null);
    const sceneRatingQueueRef = useRef([]);
    const sceneRatingWorkerRunningRef = useRef(false);
    const runContextRef = useRef({ context: {} });
    const sceneRatingStatusRef = useRef(new Map());
    // values: "pending" | "done" | "failed"

    // State for due vocabulary entries
    const [dueEntries, setDueEntries] = useState([]);
    const [loadingDue, setLoadingDue] = useState(false);
    const [dueError, setDueError] = useState("");

    const entriesByIdRef = useRef(new Map());

    const submitWordRatingTool = useMemo(() => {
        return createSubmitWordRatingTool({
            userId: DEFAULT_USER_ID,
            getEntryById: (id) => entriesByIdRef.current.get(id),
            onBreadcrumb: (msg) => addTranscriptBreadcrumb(msg),
        });
    }, [addTranscriptBreadcrumb]);

    // Tools for scene-based role-play
    const enqueueSceneRating = useCallback((payload) => {
        const sceneId = payload?.scene?.id || payload?.scene?.title;
        if (!sceneId) return;

        const status = sceneRatingStatusRef.current.get(sceneId);
        if (status === "pending" || status === "done") {
            // addTranscriptBreadcrumb(`Rating already queued for scene "${payload.scene.title}"`);
            return;
        }
        sceneRatingStatusRef.current.set(sceneId, "pending");
        sceneRatingQueueRef.current.push(payload);
        runSceneRatingWorker(); // Call Rater Agent to rate words in scene in background
        addTranscriptBreadcrumb(`Queued scene rating for ${payload?.scene?.targetWordIds?.length || 0}
  words`);
    }, [addTranscriptBreadcrumb]);

    const sceneTools = useMemo(() => createSceneTools({
        onBreadcrumb: (msg, data) => addTranscriptBreadcrumb(msg, data),
        onSceneRatingRequested: enqueueSceneRating,
        onSceneStart: (scene) => {
            // console.log("scene.start", scene);
            setActiveWords(scene?.targetWords ?? []);
        },
    }), [addTranscriptBreadcrumb, enqueueSceneRating, setActiveWords]);

    const runSceneRatingWorker = useCallback(async () => {
        if (sceneRatingWorkerRunningRef.current) return;
        sceneRatingWorkerRunningRef.current = true;

        try {
            while (sceneRatingQueueRef.current.length > 0) {
                const job = sceneRatingQueueRef.current.shift();
                if (!job?.scene?.targetWordIds?.length) continue;
                const { scene, evidence } = job;
                const sceneId = scene.sceneId || scene.title;

                addTranscriptBreadcrumb(`Rating scene "${scene.title}" (${scene.targetWordIds.length}
  words)`);

                const wordsInScene = scene.targetWordIds
                    .map((id) => entriesByIdRef.current.get(id))
                    .filter(Boolean)
                    .map((w) => ({
                        id: w.id,
                        text: w.text,
                        definition: w.definition,
                        realLifeDef: w.realLifeDef
                    }));

                try {
                    const { ratings } = await rateScene({ sceneEvidence: evidence, wordsInScene });
                    for (const r of ratings) {
                        // console.log("rating item:", r)
                        const result = await submitWordRatingTool.invoke(
                            runContextRef.current,
                            JSON.stringify({
                                vocabularyId: r.vocabularyId,
                                rating: r.rating,
                                evidence: r.evidence
                            })
                        );
                        // console.log("submit_word_rating result:", result);
                    }
                    sceneRatingStatusRef.current.set(sceneId, "done");
                    addTranscriptBreadcrumb(`Scene rated: ${scene.title}`);

                    if (runContextRef.current?.context?.reviewComplete) {
                        await handleStopPractice();
                    }
                } catch (err) {
                    sceneRatingStatusRef.current.set(sceneId, "failed");
                    addTranscriptBreadcrumb(`Scene rating failed: ${scene.title}`);
                    console.error("rateScene failed", err);
                }
            }
        } finally {
            sceneRatingWorkerRunningRef.current = false;
        }
    }, [addTranscriptBreadcrumb]);


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
            addTranscriptBreadcrumb('Trying to remember something from past');
            // Gathering context: due words + memory
            const { memory } = await loadMemoryBootstrap(DEFAULT_USER_ID);
            memoryRef.current = memory;
            const query = [
                ...(memory?.semantic?.interests || []),
                ...(dueEntries.map(e => e.text) || []),
            ].join(" ");

            const semanticResults = query
                ? await searchSemanticMemory({
                    userId: DEFAULT_USER_ID,
                    query,
                    k: 5
                })
                : { results: [] };

            // Start role-play plan
            addTranscriptBreadcrumb('Planning role-play scenes');
            const rolePlayPlan = await fetchRolePlayPlan({
                dueWords: dueEntries.map(e => ({
                    id: e.id,
                    text: e.text,
                    definition: e.definition,
                    realLifeDef: e.realLifeDef,
                    surroundingText: e.surroundingText,
                    videoTitle: e.videoTitle,
                })),
                memory,
                semanticHints: semanticResults.results ?? [],
            });

            // Tool assignment
            vocabularyTeacherAgent.tools = [
                sceneTools.getNextScene,
                sceneTools.startScene,
                sceneTools.markSceneDone,
                sceneTools.requestSceneRating
            ];

            const runtimeContext = {
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

                // loaded memory
                memory: {
                    semantic: memory?.semantic ?? null,
                    episodic: memory?.episodic ?? null,
                    procedural: memory?.procedural ?? null,
                    semanticHints: semanticResults.results ?? []
                },
                rolePlayPlan,

                // scene state
                currentSceneIndex: 0,
                reviewComplete: false,
                currentSceneStep: "NEED_SCENE",
            };

            runContextRef.current = { context: runtimeContext };


            await connect({
                getEphemeralKey: fetchEphemeralKey,
                initialAgents: [vocabularyTeacherAgent],
                audioElement: sdkAudioElement,
                extraContext: runtimeContext,
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

        addTranscriptBreadcrumb(`Syncing ${updates.length} review updates`);
        const result = await saveReviewSession(updates);

        if (!result?.success) {
            throw new Error(result?.message || "saveReviewSession failed");
        }

        await clearPendingReviewUpdates(DEFAULT_USER_ID);
        addTranscriptBreadcrumb(`Synced ${result.savedCount} updates`);

        // Update memory after syncing reviews
        const difficult = pending
            .filter(p => (p.rating ?? 4) <= 2)
            .map(p => p.vocabularyId);

        const prev = memoryRef.current?.episodic ?? {
            lastScenes: [],
            difficultWords: [],
            typicalMistakes: [],
            slangSuggestions: []
        };

        const nextEpisodic = {
            ...prev,
            lastScenes: [
                ...(prev.lastScenes || []).slice(-2),
                `role-play session ${new Date().toISOString()}`
            ],
            difficultWords: Array.from(new Set([...(prev.difficultWords || []), ...difficult])),
        };

        await updateMemoryBucket({
            userId: DEFAULT_USER_ID,
            bucket: "episodic",
            value: nextEpisodic
        });

        // Also add a semantic memory chunk for fuzzy retrieval
        const summaryText = `Reviewed words: ${pending.map(p => p.vocabularyId).join(", ")}. Difficult:
  ${difficult.join(", ") || "none"}.`;
        await addSemanticMemory({
            userId: DEFAULT_USER_ID,
            text: summaryText,
            metadata: { type: "episodic", when: new Date().toISOString() }
        });
    };

    // // TEST flush update
    // useEffect(() => {
    //     window.__flushReview = flushPendingReviewUpdates;
    //     return () => {
    //         delete window.__flushReview;
    //     };
    // }, [flushPendingReviewUpdates]);

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
