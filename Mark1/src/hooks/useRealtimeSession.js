import {useCallback, useRef, useState, useEffect} from 'react';
import {
    RealtimeSession, OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';
import {audioFormatForCodec, applyCodecPreferences} from '../utils/codecUtils';
import {useTranscript} from '../contexts/TranscriptContext';
import { REALTIME_MODEL, REALTIME_TRANSCRIBE_MODEL } from '../../config/aiModels.js';
import {
    buildUiFeedbackInstruction,
    UI_FEEDBACK_METADATA_KEY,
} from '../utils/realtimeUiFeedback';
import {
    buildRealtimeSessionConfig,
    claimResponseTurn,
    isManualResponseMode,
    REALTIME_RESPONSE_CONTROL_MODES,
    withRealtimeResponseControl,
} from '../utils/realtimeResponseControl';
import {
    appendRealtimeTranscriptDelta,
    extractRealtimeMessageText,
    sanitizeRealtimeError,
    USER_TRANSCRIPTION_FAILED_TEXT,
    USER_TRANSCRIPTION_INAUDIBLE_TEXT,
    USER_TRANSCRIPTION_PENDING_TEXT,
} from '../utils/realtimeTranscript';
import {
    readRealtimeTurnSettleMs,
    RealtimeResponseArbiter,
    RealtimeTurnBuffer,
} from '../utils/realtimeTurnCoordinator';
import {buildRealtimeKeyboardTurn} from '../utils/realtimeKeyboardTurn';

const UI_FEEDBACK_TIMEOUT_MS = 25_000;

function createControlId(prefix) {
    const randomId = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomId}`;
}

export function useRealtimeSession(callbacks = {}) {
    const sessionRef = useRef(null);
    const callbacksRef = useRef(callbacks);
    const [status, setStatus] = useState('DISCONNECTED');
    const {transcriptItems, addTranscriptMessage, updateTranscriptMessage, updateTranscriptItem} = useTranscript();
    const transcriptItemsRef = useRef(transcriptItems);
    const eventHandlersRef = useRef({});
    const userSpeakingRef = useRef(false);
    const latestSpeechStoppedAtRef = useRef(null);
    const speechStoppedAtByItemIdRef = useRef(new Map());
    const assistantSpeakingRef = useRef(false);
    const responseActiveRef = useRef(false);
    const latestAssistantTranscriptRef = useRef("");
    const controlItemIdsRef = useRef(new Set());
    const uiFeedbackQueueRef = useRef([]);
    const activeUiFeedbackRef = useRef(null);
    const processUiFeedbackQueueRef = useRef(() => {});
    const responseControlModeRef = useRef(REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC);
    const completedUserTurnIdsRef = useRef(new Set());
    const localKeyboardTurnIdsRef = useRef(new Set());
    const inputTranscriptByItemIdRef = useRef(new Map());
    const turnBufferRef = useRef(null);
    const responseArbiterRef = useRef(null);
    const controlledResponseEventIdsRef = useRef(new Set());

    const trace = useCallback((event, data = {}) => {
        try {
            callbacksRef.current?.onTrace?.(event, data);
        } catch {
            // Debug tracing must not affect the voice workflow.
        }
    }, []);

    const interruptSessionOutput = useCallback((reason) => {
        try {
            const result = sessionRef.current?.interrupt();
            if (result && typeof result.catch === 'function') {
                result.catch((error) => {
                    trace('realtime_interrupt_failed', {
                        reason,
                        message: error?.message || String(error),
                    });
                });
            }
            return true;
        } catch (error) {
            trace('realtime_interrupt_failed', {
                reason,
                message: error?.message || String(error),
            });
            return false;
        }
    }, [trace]);

    if (!responseArbiterRef.current) {
        responseArbiterRef.current = new RealtimeResponseArbiter({
            interruptOutput: () => interruptSessionOutput('response_superseded'),
            onTrace: trace,
            sendResponse: ({ turnId, instructions = '', metadata = {} }) => {
                if (!sessionRef.current) throw new Error('Realtime session is not connected');
                const eventId = createControlId('controlled-response');
                controlledResponseEventIdsRef.current.add(eventId);
                if (controlledResponseEventIdsRef.current.size > 100) {
                    controlledResponseEventIdsRef.current.delete(
                        controlledResponseEventIdsRef.current.values().next().value,
                    );
                }
                sessionRef.current.transport.sendEvent({
                    type: 'response.create',
                    event_id: eventId,
                    response: {
                        ...(String(instructions || '').trim()
                            ? {instructions: String(instructions).trim()}
                            : {}),
                        metadata: {
                            ...metadata,
                            mark2_source_turn_id: turnId,
                        },
                    },
                });
            },
        });
    }

    if (!turnBufferRef.current) {
        turnBufferRef.current = new RealtimeTurnBuffer({
            settleMs: readRealtimeTurnSettleMs(),
            onFlush: (turn) => {
                responseArbiterRef.current?.registerTurn(turn.itemId);
                trace('user_turn_settled', {
                    turnId: turn.itemId,
                    itemIds: turn.itemIds,
                    segmentCount: turn.segmentCount,
                    transcript: turn.transcript,
                });
                Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.(turn)).catch((error) => {
                    console.warn('Completed-turn observer failed:', error);
                });
            },
        });
    }

    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    useEffect(() => {
        transcriptItemsRef.current = transcriptItems;
    }, [transcriptItems]);

    const updateStatus = useCallback((newStatus) => {
        setStatus(newStatus);
        callbacksRef.current?.onConnectionChange?.(newStatus);
    }, []);

    // ---------------------------- Helpers -------------------------------------//
    function handleHistoryAdded(item) {
        // console.log("[handleHistoryAdded]", item);
        if (!item || item.type !== 'message') return;

        const {itemId, role, content = []} = item;
        if (role === "system" || controlItemIdsRef.current.has(itemId)) return;
        if (role === "user" && localKeyboardTurnIdsRef.current.delete(itemId)) return;
        if (itemId && role) {
            const isUser = role === "user";
            let text = extractRealtimeMessageText(content);

            if (isUser && !text) {
                text = USER_TRANSCRIPTION_PENDING_TEXT;
            }
            addTranscriptMessage(itemId, role, text);
        }
    }

    function handleHistoryUpdated(items) {
        // console.log("[handleHistoryUpdated]", items);
        items.forEach((item) => {
            if (!item || item.type !== 'message') return;

            const {itemId, content = []} = item;

            const text = extractRealtimeMessageText(content);
            if (text) {
                updateTranscriptMessage(itemId, text, false);
            }
        });
    }

    function handleTranscriptionCompleted(item) {
        // History updates don't reliably end in a completed item,
        // so we need to handle finishing up when the transcription is completed.
        const itemId = item.item_id;
        const finalTranscript = !item.transcript || item.transcript === "\n"
            ? USER_TRANSCRIPTION_INAUDIBLE_TEXT
            : item.transcript;
        if (itemId) {
            updateTranscriptMessage(itemId, finalTranscript, false);
            // Use the ref to get the latest transcriptItems
            const transcriptItem = transcriptItemsRef.current.find((i) => i.itemId === itemId);
            updateTranscriptItem(itemId, {status: 'DONE'});

            if (item.type === 'response.output_audio_transcript.done') {
                latestAssistantTranscriptRef.current = finalTranscript;
            }

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
            latestAssistantTranscriptRef.current += deltaText;
        }
    }

    function handleInputTranscriptionDelta(item) {
        const itemId = item.item_id;
        const deltaText = item.delta || "";
        if (!itemId || !deltaText) return;

        const nextTranscript = appendRealtimeTranscriptDelta(
            inputTranscriptByItemIdRef.current.get(itemId),
            deltaText,
        );
        inputTranscriptByItemIdRef.current.set(itemId, nextTranscript);
        updateTranscriptMessage(itemId, nextTranscript, false);
    }

    function handleInputTranscriptionFailed(item) {
        const itemId = item.item_id;
        if (itemId) {
            inputTranscriptByItemIdRef.current.delete(itemId);
            speechStoppedAtByItemIdRef.current.delete(itemId);
            updateTranscriptMessage(itemId, USER_TRANSCRIPTION_FAILED_TEXT, false);
            updateTranscriptItem(itemId, {status: 'ERROR'});
        }
        latestSpeechStoppedAtRef.current = null;

        const error = sanitizeRealtimeError(item.error);
        console.error('[Realtime] Input transcription failed:', error);
        trace('input_transcription_failed', {itemId: itemId || null, error});
    }

    const finishActiveUiFeedback = useCallback(() => {
        const active = activeUiFeedbackRef.current;
        if (!active) return;

        if (active.timeoutId) {
            clearTimeout(active.timeoutId);
        }

        try {
            sessionRef.current?.transport?.sendEvent({
                type: 'conversation.item.delete',
                item_id: active.systemItemId,
                event_id: createControlId('ui-feedback-delete'),
            });
        } catch (error) {
            console.warn('Unable to remove temporary UI feedback item:', error);
        }

        controlItemIdsRef.current.delete(active.systemItemId);
        activeUiFeedbackRef.current = null;
        queueMicrotask(() => processUiFeedbackQueueRef.current());
    }, []);

    const processUiFeedbackQueue = useCallback(() => {
        if (activeUiFeedbackRef.current || userSpeakingRef.current) return;

        const session = sessionRef.current;
        const feedback = uiFeedbackQueueRef.current.shift();
        if (!session || !feedback) return;

        const shouldInterrupt = responseActiveRef.current || assistantSpeakingRef.current;
        const resumeAnchor = shouldInterrupt ? latestAssistantTranscriptRef.current : "";
        const feedbackId = createControlId('ui-feedback');
        const systemItemId = createControlId('ui-feedback-system');
        const responseEventId = createControlId('ui-feedback-response');
        const instruction = buildUiFeedbackInstruction({
            ...feedback,
            resumeAnchor,
        });

        try {
            if (shouldInterrupt) {
                session.interrupt();
            }

            controlItemIdsRef.current.add(systemItemId);
            session.transport.sendEvent({
                type: 'conversation.item.create',
                event_id: createControlId('ui-feedback-item'),
                item: {
                    id: systemItemId,
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text',
                        text: instruction,
                    }],
                },
            });

            const timeoutId = setTimeout(() => {
                console.warn('UI feedback response timed out:', feedbackId);
                finishActiveUiFeedback();
            }, UI_FEEDBACK_TIMEOUT_MS);

            activeUiFeedbackRef.current = {
                feedbackId,
                systemItemId,
                responseEventId,
                responseId: null,
                responseDone: false,
                timeoutId,
            };

            session.transport.sendEvent({
                type: 'response.create',
                event_id: responseEventId,
                response: {
                    instructions: instruction,
                    metadata: {
                        [UI_FEEDBACK_METADATA_KEY]: feedbackId,
                    },
                },
            });
        } catch (error) {
            console.error('Unable to send UI feedback:', error);
            controlItemIdsRef.current.delete(systemItemId);
            activeUiFeedbackRef.current = null;
            queueMicrotask(() => processUiFeedbackQueueRef.current());
        }
    }, [finishActiveUiFeedback]);

    useEffect(() => {
        processUiFeedbackQueueRef.current = processUiFeedbackQueue;
    }, [processUiFeedbackQueue]);

    // ---------------------------- Helpers END -------------------------------------//

    function handleTransportEvent(event) {
        // Log ALL events to debug
        // console.log('[Transport Event]', event.type, JSON.stringify(event, null, 2));

        switch (event.type) {
            case 'input_audio_buffer.speech_started': {
                userSpeakingRef.current = true;
                latestSpeechStoppedAtRef.current = null;
                turnBufferRef.current?.markSpeechStarted();
                if (isManualResponseMode(responseControlModeRef.current)) {
                    responseArbiterRef.current?.beginUserSpeech();
                }
                trace('speech_started', {
                    responseActive: responseActiveRef.current,
                    assistantSpeaking: assistantSpeakingRef.current,
                });
                callbacksRef.current?.onUserTurnStarted?.({ inputMode: 'voice' });
                callbacksRef.current?.onUserSpeechStarted?.();
                break;
            }

            case 'input_audio_buffer.speech_stopped': {
                userSpeakingRef.current = false;
                const speechStoppedAt = new Date().toISOString();
                latestSpeechStoppedAtRef.current = speechStoppedAt;
                if (event.item_id) {
                    speechStoppedAtByItemIdRef.current.set(event.item_id, speechStoppedAt);
                }
                turnBufferRef.current?.markSpeechStopped();
                responseArbiterRef.current?.endUserSpeech();
                trace('speech_stopped', { itemId: event.item_id || null });
                processUiFeedbackQueueRef.current();
                break;
            }

            case 'response.created': {
                responseActiveRef.current = true;
                responseArbiterRef.current?.markResponseCreated();
                latestAssistantTranscriptRef.current = "";
                const sourceTurnId = event.response?.metadata?.mark2_source_turn_id || null;
                trace('response_created', {
                    responseId: event.response?.id || null,
                    sourceTurnId,
                });
                if (
                    isManualResponseMode(responseControlModeRef.current)
                    && sourceTurnId
                    && !responseArbiterRef.current?.isCurrentTurn(sourceTurnId)
                ) {
                    trace('stale_response_interrupted', {
                        responseId: event.response?.id || null,
                        sourceTurnId,
                    });
                    interruptSessionOutput('stale_response_created');
                    break;
                }
                const active = activeUiFeedbackRef.current;
                const feedbackId = event.response?.metadata?.[UI_FEEDBACK_METADATA_KEY];
                if (active && feedbackId === active.feedbackId) {
                    active.responseId = event.response?.id || null;
                }
                break;
            }

            case 'response.done': {
                responseActiveRef.current = false;
                responseArbiterRef.current?.markResponseDone();
                trace('response_done', {
                    responseId: event.response?.id || null,
                    sourceTurnId: event.response?.metadata?.mark2_source_turn_id || null,
                    status: event.response?.status || null,
                });
                const active = activeUiFeedbackRef.current;
                const feedbackId = event.response?.metadata?.[UI_FEEDBACK_METADATA_KEY];
                const matchesActive = active && (
                    feedbackId === active.feedbackId
                    || (active.responseId && event.response?.id === active.responseId)
                );
                if (matchesActive) {
                    active.responseDone = true;
                    if (!assistantSpeakingRef.current) {
                        finishActiveUiFeedback();
                    }
                } else if (!active) {
                    processUiFeedbackQueueRef.current();
                }
                break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
                const itemId = event.item_id || null;
                if (itemId && !claimResponseTurn(completedUserTurnIdsRef.current, itemId)) {
                    break;
                }
                if (itemId) inputTranscriptByItemIdRef.current.delete(itemId);
                handleTranscriptionCompleted(event);
                const transcript = String(event.transcript || "").trim()
                    || USER_TRANSCRIPTION_INAUDIBLE_TEXT;
                const occurredAt = (itemId && speechStoppedAtByItemIdRef.current.get(itemId))
                    || latestSpeechStoppedAtRef.current
                    || new Date().toISOString();
                if (itemId) speechStoppedAtByItemIdRef.current.delete(itemId);
                latestSpeechStoppedAtRef.current = null;
                const completedTurn = {
                    itemId,
                    transcript,
                    occurredAt,
                };
                trace('transcription_completed', completedTurn);
                if (isManualResponseMode(responseControlModeRef.current)) {
                    try {
                        const accepted = turnBufferRef.current?.add(completedTurn) === true;
                        trace('user_turn_buffered', {
                            turnId: itemId,
                            accepted,
                        });
                        if (!accepted) {
                            responseArbiterRef.current?.registerTurn(itemId);
                            Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.(completedTurn))
                                .catch((error) => console.warn('Completed-turn observer failed:', error));
                        }
                    } catch (error) {
                        turnBufferRef.current?.reset();
                        responseArbiterRef.current?.registerTurn(itemId);
                        trace('user_turn_buffer_failed', {
                            turnId: itemId,
                            message: error?.message || String(error),
                        });
                        Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.(completedTurn))
                            .catch((observerError) => {
                                console.warn('Completed-turn observer failed:', observerError);
                            });
                    }
                } else {
                    responseArbiterRef.current?.registerTurn(itemId);
                    Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.(completedTurn))
                        .catch((error) => console.warn('Completed-turn observer failed:', error));
                }
                break;
            }

            case 'conversation.item.input_audio_transcription.delta': {
                handleInputTranscriptionDelta(event);
                break;
            }

            case 'conversation.item.input_audio_transcription.failed': {
                const itemId = event.item_id || null;
                if (itemId && !claimResponseTurn(completedUserTurnIdsRef.current, itemId)) {
                    break;
                }
                const occurredAt = (itemId && speechStoppedAtByItemIdRef.current.get(itemId))
                    || latestSpeechStoppedAtRef.current
                    || new Date().toISOString();
                handleInputTranscriptionFailed(event);
                Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.({
                    itemId,
                    transcript: USER_TRANSCRIPTION_FAILED_TEXT,
                    occurredAt,
                })).catch((error) => {
                    console.warn('Failed-turn observer failed:', error);
                });
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

            case 'conversation.item.deleted': {
                controlItemIdsRef.current.delete(event.item_id);
                break;
            }

            case 'error': {
                const active = activeUiFeedbackRef.current;
                if (active && event.error?.event_id === active.responseEventId) {
                    finishActiveUiFeedback();
                }
                console.error('[Realtime] API error:', sanitizeRealtimeError(event.error));
                if (controlledResponseEventIdsRef.current.has(event.error?.event_id)) {
                    controlledResponseEventIdsRef.current.delete(event.error.event_id);
                    responseArbiterRef.current?.markResponseFailed();
                }
                trace('realtime_error', sanitizeRealtimeError(event.error));
                break;
            }

            default:
                break;
        }
    }

    eventHandlersRef.current = {
        handleHistoryAdded,
        handleHistoryUpdated,
        handleTransportEvent,
        onAudioStart: () => {
            assistantSpeakingRef.current = true;
            responseArbiterRef.current?.markAssistantSpeaking(true);
            trace('assistant_audio_started');
        },
        onAudioStopped: () => {
            assistantSpeakingRef.current = false;
            responseArbiterRef.current?.markAssistantSpeaking(false);
            trace('assistant_audio_stopped');
            if (activeUiFeedbackRef.current?.responseDone) {
                finishActiveUiFeedback();
            } else {
                processUiFeedbackQueueRef.current();
            }
        },
        onAudioInterrupted: () => {
            assistantSpeakingRef.current = false;
            responseArbiterRef.current?.markAssistantSpeaking(false);
            trace('assistant_audio_interrupted');
        },
    };

    const connect = useCallback(async ({
                                           getEphemeralKey,
                                           initialAgents,
                                           audioElement,
                                           extraContext = {},
                                           responseControlMode = REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC,
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
            responseControlModeRef.current = isManualResponseMode(responseControlMode)
                ? REALTIME_RESPONSE_CONTROL_MODES.MANUAL
                : REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC;

            const sessionConfig = buildRealtimeSessionConfig({
                inputAudioFormat: audioFormat,
                outputAudioFormat: audioFormat,
                transcriptionModel: REALTIME_TRANSCRIBE_MODEL,
                responseControlMode: responseControlModeRef.current,
            });
            const session = new RealtimeSession(rootAgent, {
                transport: new OpenAIRealtimeWebRTC({
                    audioElement, changePeerConnection: async (pc) => {
                        applyCodecPreferences(pc, 'opus');
                        return pc;
                    },
                }), model: REALTIME_MODEL, config: sessionConfig, context: extraContext,
            });

            session.on("history_added", (item) => eventHandlersRef.current.handleHistoryAdded(item));
            session.on("history_updated", (items) => eventHandlersRef.current.handleHistoryUpdated(items));
            session.on("transport_event", (event) => eventHandlersRef.current.handleTransportEvent(event));
            session.on("audio_start", () => eventHandlersRef.current.onAudioStart());
            session.on("audio_stopped", () => eventHandlersRef.current.onAudioStopped());
            session.on("audio_interrupted", () => eventHandlersRef.current.onAudioInterrupted());

            sessionRef.current = session;
            await session.connect({apiKey: ephemeralKey});

            updateStatus('CONNECTED');
            trace('realtime_connected', {responseControlMode: responseControlModeRef.current});

        } catch (error) {
            console.error('Connection error:', error);
            trace('realtime_connection_failed', {
                message: error?.message || String(error),
            });
            sessionRef.current?.close();
            sessionRef.current = null;
            updateStatus('DISCONNECTED');
            throw error;
        }
    }, [trace, updateStatus]);

    const disconnect = useCallback(() => {
        const active = activeUiFeedbackRef.current;
        if (active?.timeoutId) clearTimeout(active.timeoutId);
        activeUiFeedbackRef.current = null;
        uiFeedbackQueueRef.current = [];
        controlItemIdsRef.current.clear();
        userSpeakingRef.current = false;
        assistantSpeakingRef.current = false;
        responseActiveRef.current = false;
        latestAssistantTranscriptRef.current = "";
        responseControlModeRef.current = REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC;
        completedUserTurnIdsRef.current.clear();
        localKeyboardTurnIdsRef.current.clear();
        turnBufferRef.current?.reset();
        responseArbiterRef.current?.reset();
        controlledResponseEventIdsRef.current.clear();
        inputTranscriptByItemIdRef.current.clear();
        speechStoppedAtByItemIdRef.current.clear();
        latestSpeechStoppedAtRef.current = null;
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        updateStatus('DISCONNECTED');
        trace('realtime_disconnected');
    }, [trace, updateStatus]);

    const interrupt = useCallback(() => {
        sessionRef.current?.interrupt();
    }, []);

    const mute = useCallback((shouldMute) => {
        sessionRef.current?.mute(shouldMute);
    }, []);

    const sendTextMessage = useCallback((text) => {
        const message = String(text ?? '').trim();
        if (!message) {
            return {ok: false, reason: 'empty'};
        }
        if (!sessionRef.current) {
            return {ok: false, reason: 'not_connected'};
        }
        const itemId = createControlId('keyboard-user-message');
        const occurredAt = new Date().toISOString();
        const keyboardTurn = buildRealtimeKeyboardTurn({
            message,
            itemId,
            eventId: createControlId('keyboard-user-message-event'),
            occurredAt,
        });
        const manualResponse = isManualResponseMode(responseControlModeRef.current);
        try {
            callbacksRef.current?.onUserTurnStarted?.({
                inputMode: 'keyboard',
                itemId,
            });
            if (responseActiveRef.current || assistantSpeakingRef.current) {
                interruptSessionOutput('keyboard_turn_started');
            }

            if (manualResponse) {
                responseArbiterRef.current?.beginUserSpeech();
            }
            responseArbiterRef.current?.registerTurn(itemId);
            addTranscriptMessage(itemId, 'user', message, false, {
                status: 'DONE',
                inputMode: 'keyboard',
            });
            localKeyboardTurnIdsRef.current.add(itemId);
            if (localKeyboardTurnIdsRef.current.size > 100) {
                localKeyboardTurnIdsRef.current.delete(
                    localKeyboardTurnIdsRef.current.values().next().value
                );
            }

            if (manualResponse) {
                sessionRef.current.transport.sendEvent({
                    type: 'conversation.item.create',
                    ...keyboardTurn.eventData,
                });
                responseArbiterRef.current?.endUserSpeech();
            } else {
                sessionRef.current.sendMessage(keyboardTurn.message, keyboardTurn.eventData);
            }

            claimResponseTurn(completedUserTurnIdsRef.current, itemId);
            trace('keyboard_turn_completed', {
                itemId,
                transcript: message,
                occurredAt,
                responseControlMode: manualResponse ? 'manual' : 'automatic',
            });
            Promise.resolve(callbacksRef.current?.onUserTranscriptCompleted?.(
                keyboardTurn.completedTurn
            )).catch((error) => {
                console.warn('Completed text-turn observer failed:', error);
            });
            return {ok: true, itemId};
        } catch (error) {
            if (manualResponse) {
                responseArbiterRef.current?.endUserSpeech();
            }
            localKeyboardTurnIdsRef.current.delete(itemId);
            updateTranscriptItem(itemId, {status: 'ERROR'});
            console.error('sendTextMessage error:', error);
            return {ok: false, reason: error?.message || 'send_failed'};
        }
    }, [addTranscriptMessage, interruptSessionOutput, trace, updateTranscriptItem]);

    const updateAgent = useCallback(async (agent) => {
        if (!sessionRef.current) {
            return {ok: false, reason: 'not_connected'};
        }
        if (!agent) {
            return {ok: false, reason: 'agent_required'};
        }
        try {
            await sessionRef.current.updateAgent(agent);
            return {ok: true};
        } catch (error) {
            console.error('updateAgent error:', error);
            throw error;
        }
    }, []);

    const setResponseControlMode = useCallback((mode) => {
        const normalizedMode = isManualResponseMode(mode)
            ? REALTIME_RESPONSE_CONTROL_MODES.MANUAL
            : REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC;
        responseControlModeRef.current = normalizedMode;
        if (!isManualResponseMode(normalizedMode)) {
            turnBufferRef.current?.reset();
            responseArbiterRef.current?.reset();
        }
        if (!sessionRef.current) return {ok: true, pending: true, mode: normalizedMode};
        try {
            const nextConfig = withRealtimeResponseControl(
                sessionRef.current.options.config,
                normalizedMode,
            );
            sessionRef.current.options.config = nextConfig;
            sessionRef.current.transport.updateSessionConfig(nextConfig);
            return {ok: true, mode: normalizedMode};
        } catch (error) {
            console.error('setResponseControlMode error:', error);
            return {ok: false, reason: error?.message || 'response_control_failed'};
        }
    }, []);

    const requestResponse = useCallback(({ turnId, instructions = '', metadata = {} } = {}) => {
        const normalizedTurnId = String(turnId || '').trim();
        if (!sessionRef.current) return {ok: false, reason: 'not_connected'};
        if (!normalizedTurnId) return {ok: false, reason: 'turn_id_required'};
        try {
            const result = responseArbiterRef.current.request({
                turnId: normalizedTurnId,
                instructions,
                metadata,
            });
            trace('controlled_response_requested', {
                turnId: normalizedTurnId,
                queued: result?.queued === true,
                dispatched: result?.dispatched === true,
                reason: result?.reason || null,
            });
            return result;
        } catch (error) {
            console.error('requestResponse error:', error);
            return {ok: false, reason: error?.message || 'response_request_failed'};
        }
    }, [trace]);

    const requestUiFeedback = useCallback((feedback) => {
        if (!sessionRef.current) {
            return {ok: false, reason: 'not_connected'};
        }

        try {
            buildUiFeedbackInstruction(feedback);
        } catch (error) {
            return {ok: false, reason: error?.message || 'invalid_feedback'};
        }

        uiFeedbackQueueRef.current.push({...feedback});
        processUiFeedbackQueueRef.current();
        return {ok: true, queued: true};
    }, []);

    return {
        status,
        connect,
        disconnect,
        interrupt,
        mute,
        sendTextMessage,
        requestUiFeedback,
        requestResponse,
        setResponseControlMode,
        updateAgent,
    };
}
