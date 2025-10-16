import {useCallback, useRef, useState} from 'react';
import {
    RealtimeSession, OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';
import {audioFormatForCodec, applyCodecPreferences} from '../utils/codecUtils';
import {useTranscript} from '../contexts/TranscriptContext';

export function useRealtimeSession(callbacks = {}) {
    const sessionRef = useRef(null);
    const [status, setStatus] = useState('DISCONNECTED');
    const {addTranscriptMessage, updateTranscriptMessage} = useTranscript();

    const updateStatus = useCallback((newStatus) => {
        setStatus(newStatus);
        callbacks.onConnectionChange?.(newStatus);
    }, [callbacks]);

    function handleTransportEvent(event) {
        // Log ALL events to debug
        console.log('[Transport Event]', event.type, JSON.stringify(event, null, 2));

        switch (event.type) {
            case 'conversation.item.input_audio_transcription.completed': {
                const userText = event.transcript;
                // console.log('✅ User transcript:', userText);
                addTranscriptMessage(event.event_id, 'user', userText);
                break;
            }

            case 'response.output_audio_transcript.delta': {
                const aiText = event.delta;
                // console.log('✅ AI transcript delta:', aiText);
                updateTranscriptMessage(event.event_id, 'assistant', aiText, true);
                break;
            }

            case 'response.output_audio_transcript.done': {
                const aiText = event.transcript;
                // console.log('✅ AI transcript done:', aiText);
                addTranscriptMessage(event.event_id, 'assistant', aiText);
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
            console.log('Already connected');
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
                        model: 'whisper-1',
                    }, turn_detection: {
                        type: 'server_vad',
                        threshold: 0.9,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500,
                        create_response: true,
                    },
                }, context: extraContext,
            });

            sessionRef.current.on('transport_event', handleTransportEvent);
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
