import {useCallback, useRef, useState, useEffect} from 'react';
import {
    RealtimeSession, OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';
import {audioFormatForCodec, applyCodecPreferences} from '../utils/codecUtils';
import {useTranscript} from '../contexts/TranscriptContext';

export function useRealtimeSession(callbacks = {}) {
    const sessionRef = useRef(null);
    const [status, setStatus] = useState('DISCONNECTED');
    const {transcriptItems, addTranscriptMessage, updateTranscriptMessage, updateTranscriptItem} = useTranscript();

    const updateStatus = useCallback((newStatus) => {
        setStatus(newStatus);
        callbacks.onConnectionChange?.(newStatus);
    }, [callbacks]);

    // ---------------------------- Helpers -------------------------------------//
    const extractMessageText = (content = []) => {
        if (!Array.isArray(content)) return "";
        return content
            .map((c) => {
                if (!c || typeof c !== "object") return "";
                if (c.type === "input_text") return c.text ?? "";
                if (c.type === "audio") return c.transcript ?? "";
                return "";
            })
            .filter(Boolean)
            .join("\n");
    };

    function handleHistoryAdded(item) {
        // console.log("[handleHistoryAdded]", item);
        if (!item || item.type !== 'message') return;

        const {itemId, role, content = []} = item;
        if (itemId && role) {
            const isUser = role === "user";
            let text = extractMessageText(content);

            if (isUser && !text) {
                text = "[Transcribing..]";
            }
            addTranscriptMessage(itemId, role, text);
        }
    }

    function handleHistoryUpdated(items) {
        // console.log("[handleHistoryUpdated]", items);
        items.forEach((item) => {
            if (!item || item.type !== 'message') return;

            const {itemId, content = []} = item;

            const text = extractMessageText(content);
            if (text) {
                updateTranscriptMessage(itemId, text, false);
            }
        });
    }

    function handleTranscriptionCompleted(item) {
        // History updates don't reliably end in a completed item,
        // so we need to handle finishing up when the transcription is completed.
        const itemId = item.item_id;
        const finalTranscript = !item.transcript || item.transcript === "\n" ? "[inaudible]" : item.transcript;
        if (itemId) {
            updateTranscriptMessage(itemId, finalTranscript, false);
            // Use the ref to get the latest transcriptItems
            const transcriptItem = transcriptItems.find((i) => i.itemId === itemId);
            updateTranscriptItem(itemId, {status: 'DONE'});

            // If guardrailResult still pending, mark PASS.
            if (transcriptItem?.guardrailResult?.status === 'IN_PROGRESS') {
                updateTranscriptItem(itemId, {
                    guardrailResult: {
                        status: 'DONE', category: 'NONE', rationale: '',
                    },
                });
            }
        }
    }

    function handleTranscriptionDelta(item) {
        const itemId = item.item_id;
        const deltaText = item.delta || "";
        if (itemId) {
            updateTranscriptMessage(itemId, deltaText, true);
        }
    }


    // ---------------------------- Helpers END -------------------------------------//

    // Register session event listeners when session is created
    useEffect(() => {
        if (sessionRef.current) {
            // console.log('Registering session event listeners');

            // High-level session events (these create and update messages)
            sessionRef.current.on("history_added", handleHistoryAdded);
            sessionRef.current.on("history_updated", handleHistoryUpdated);

            // Low-level transport events (for transcription updates)
            sessionRef.current.on("transport_event", handleTransportEvent);
        }
    }, [sessionRef.current]);

    function handleTransportEvent(event) {
        // Log ALL events to debug
        // console.log('[Transport Event]', event.type, JSON.stringify(event, null, 2));

        switch (event.type) {
            case 'conversation.item.input_audio_transcription.completed': {
                // const userText = event.transcript;
                // console.log('✅ User transcript:', userText);
                // addTranscriptMessage(event.event_id, 'user', userText);
                handleTranscriptionCompleted(event)
                break;
            }

            case 'response.output_audio_transcript.delta': {
                // const aiText = event.delta;
                // console.log('✅ AI transcript delta:', aiText);
                handleTranscriptionDelta(event);
                break;
            }

            case 'response.output_audio_transcript.done': {
                // const aiText = event.transcript;
                // console.log('✅ AI transcript done:', aiText);
                // addTranscriptMessage(event.event_id, 'assistant', aiText);
                handleTranscriptionCompleted(event);
                break;
            }

            default:
                break;
        }
    }

    const connect = useCallback(async ({
                                           getEphemeralKey, initialAgents, audioElement, extraContext = {},
                                       }) => {
        if (sessionRef.current) {
            // console.log('Already connected');
            return;
        }

        updateStatus('CONNECTING');

        try {
            const ephemeralKey = await getEphemeralKey();
            const rootAgent = initialAgents[0];
            const audioFormat = audioFormatForCodec('opus');

            sessionRef.current = new RealtimeSession(rootAgent, {
                transport: new OpenAIRealtimeWebRTC({
                    audioElement, changePeerConnection: async (pc) => {
                        applyCodecPreferences(pc, 'opus');
                        return pc;
                    },
                }), model: 'gpt-realtime', config: {
                    inputAudioFormat: audioFormat, outputAudioFormat: audioFormat, inputAudioTranscription: {
                        model: 'gpt-4o-mini-transcribe',
                    }, turn_detection: {
                        type: 'semantic_vad',
                        threshold: 0.9,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500,
                        create_response: true,
                    },
                }, context: extraContext,
            });

            await sessionRef.current.connect({apiKey: ephemeralKey});

            updateStatus('CONNECTED');

        } catch (error) {
            console.error('Connection error:', error);
            updateStatus('DISCONNECTED');
        }
    }, [updateStatus, addTranscriptMessage]);

    const disconnect = useCallback(() => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        updateStatus('DISCONNECTED');
    }, [updateStatus]);

    const interrupt = useCallback(() => {
        sessionRef.current?.interrupt();
    }, []);

    const mute = useCallback((shouldMute) => {
        sessionRef.current?.mute(shouldMute);
    }, []);

    return {
        status, connect, disconnect, interrupt, mute,
    };
}
