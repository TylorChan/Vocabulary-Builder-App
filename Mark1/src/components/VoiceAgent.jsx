import React, {useEffect, useState, useMemo, useRef} from "react";
import {TranscriptProvider, useTranscript} from "../contexts/TranscriptContext";
import {Transcript} from "./Transcript";
import {useRealtimeSession} from "../hooks/useRealtimeSession";
import {vocabularyTeacherAgent} from "../agentConfigs/vocabularyTeacher";

function VoiceAgentContent({onNavigateBack}) {
    const {addTranscriptBreadcrumb} = useTranscript();
    const [isConnecting, setIsConnecting] = useState(false);
    const portRef = useRef(null);
    const permissionResolveRef = useRef(null);

    useEffect(() => {
        portRef.current = chrome.runtime.connect({name: "extension-popup"});
        portRef.current.onMessage.addListener((msg) => {
            if (msg.type === 'MIC_PERMISSION_RESULT') {
                console.log('[VoiceAgent] Permission result:', msg);
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
    const {status, connect, disconnect} = useRealtimeSession({
        onConnectionChange: (newStatus) => {
            console.log('Connection status changed:', newStatus);
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

            console.log('Ephemeral key received');
            return data.client_secret.value;

        } catch (error) {
            console.error('Failed to fetch ephemeral key:', error);
            throw error;
        }
    };

    // Request microphone permission helper
    const requestMicrophonePermission = () => {
        return new Promise((resolve, reject) => {
            permissionResolveRef.current = {resolve, reject};

            console.log('[VoiceAgent] Requesting microphone permission...');
            portRef.current?.postMessage({type: 'REQUEST_MIC_PERMISSION'});

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
            addTranscriptBreadcrumb('◉ Requesting microphone permission..');
            await requestMicrophonePermission();
            addTranscriptBreadcrumb('✔ Microphone permission granted!');


            addTranscriptBreadcrumb('⇄ Connecting to voice agent..');

            await connect({
                getEphemeralKey: fetchEphemeralKey,
                initialAgents: [vocabularyTeacherAgent],
                audioElement: sdkAudioElement,
                extraContext: {
                    vocabularyWords: [{word: 'ubiquitous', definition: 'present everywhere'}, {
                        word: 'ephemeral', definition: 'lasting for a very short time'
                    },], totalWords: 2,
                },
            });

            addTranscriptBreadcrumb('✔ Connected! Start speaking to practice.');

        } catch (error) {
            console.error('Connection failed:', error);
            addTranscriptBreadcrumb('✗ Connection failed.');
        }
    };

    // Disconnect from API
    const handleStopPractice = () => {
        disconnect();
        addTranscriptBreadcrumb('⊗ Disconnected from voice agent.');
    };

    // Cleanup audio element
    useEffect(() => {
        return () => {
            if (sdkAudioElement && document.body.contains(sdkAudioElement)) {
                document.body.removeChild(sdkAudioElement);
            }
        };
    }, [sdkAudioElement]);

    return (<div style={{height: "500px", display: "flex", flexDirection: "column"}}>
        <div style={{flex: 1, overflow: "hidden"}}>
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
        <div style={{
            display: "flex", gap: "10px", marginBottom: "10px", padding: "10px", borderTop: "1px solid #1131F5",
        }}>
            <button className="mutliline-button" onClick={onNavigateBack}>
                <span>Back to</span>
                <span>Captions</span>
            </button>

            {(status === 'DISCONNECTED' || status === 'CONNECTING') && (<button
                onClick={handleStartPractice}
                style={{
                    backgroundColor: isConnecting ? "#1131F5" : "white",
                    color:  isConnecting ? "white" : "#1131F5",
                    cursor: isConnecting ? "not-allowed" : "pointer",
                }}
            >
                {isConnecting ? 'Connecting..' : 'Connect'}
            </button>)}

            {status === 'CONNECTED' && (<button
                onClick={handleStopPractice}
                style={{
                    backgroundColor: "#1131F5",
                    color: "white",
                    cursor: "pointer",
                }}
            >
                Disconnect
            </button>)}
        </div>
    </div>);
}

function VoiceAgent({onNavigateBack}) {
    return (<TranscriptProvider>
        <VoiceAgentContent onNavigateBack={onNavigateBack}/>
    </TranscriptProvider>);
}

export default VoiceAgent;
