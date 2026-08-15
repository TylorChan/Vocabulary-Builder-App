import { useCallback, useEffect, useRef } from "react";
import {
    EXPRESSION_ASSIST_GRAPH_EVENT_TYPES,
    EXPRESSION_ASSIST_GRAPH_MODE,
    EXPRESSION_ASSIST_GRAPH_MODES,
    sendExpressionAssistGraphEvent,
    startExpressionAssistGraphRun,
} from "../utils/expressionAssistGraphClient";
import { ExpressionAssistGraphEventQueue } from "../utils/expressionAssistGraphEventQueue";
import {
    buildExpressionAssistSnapshot,
    getCompletedConversationMessages,
    isUntrustedExpressionAssistTranscript,
} from "../utils/expressionAssist";
import { traceVoiceSessionEvent } from "../utils/voiceSessionTraceClient";

const AUTOMATIC_RESPONSE_MODE = "automatic";
const MANUAL_RESPONSE_MODE = "manual";
const ASSIST_LOADING_DELAY_MS = 250;
const ASSIST_LOADING_TITLE = "Scouting expressions";
const ASSIST_ERROR_TITLE = "Checking expressions failed";

function waitForCardCommit() {
    if (typeof requestAnimationFrame !== "function") {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

function currentPhase(reviewPhase, practiceMode) {
    return String(reviewPhase || practiceMode || "").trim().toUpperCase();
}

function boundedMessagesWithCurrentTurn(transcriptItems, { itemId, transcript }) {
    const messages = getCompletedConversationMessages(transcriptItems).slice(-3);
    const normalizedId = String(itemId || "").trim();
    const normalizedTranscript = String(transcript || "").replace(/\s+/g, " ").trim();
    const existingIndex = messages.findIndex((message) => message.messageId === normalizedId);
    if (existingIndex >= 0) {
        messages[existingIndex] = {
            messageId: normalizedId,
            role: "user",
            text: normalizedTranscript,
        };
    } else {
        messages.push({ messageId: normalizedId, role: "user", text: normalizedTranscript });
    }
    return messages.slice(-3);
}

export function useExpressionAssistGraphFlow({
    userId,
    sessionId,
    practiceMode,
    reviewPhase,
    status,
    transcriptItems,
    addExpressionCard,
    addTranscriptBreadcrumb,
    updateTranscriptItem,
    removeTranscriptItem,
    requestResponse,
    setResponseControlMode,
}) {
    const enabled = EXPRESSION_ASSIST_GRAPH_MODE !== EXPRESSION_ASSIST_GRAPH_MODES.OFF;
    const authority = EXPRESSION_ASSIST_GRAPH_MODE === EXPRESSION_ASSIST_GRAPH_MODES.AUTHORITY;
    const shadow = EXPRESSION_ASSIST_GRAPH_MODE === EXPRESSION_ASSIST_GRAPH_MODES.SHADOW;
    const queueRef = useRef(null);
    const packetRef = useRef(null);
    const latestTurnIdRef = useRef(null);
    const userSpeechPendingRef = useRef(false);
    const activeSessionIdRef = useRef(null);
    const effectProcessingRef = useRef(new Set());
    const responseRequestedRef = useRef(new Set());
    const assistStatusesRef = useRef(new Map());
    const wasFreeChatRef = useRef(false);
    const stateRef = useRef({
        userId,
        sessionId,
        practiceMode,
        reviewPhase,
        status,
        transcriptItems,
    });
    const processPacketRef = useRef(() => {});
    stateRef.current = {
        userId,
        sessionId,
        practiceMode,
        reviewPhase,
        status,
        transcriptItems,
    };

    const desiredResponseControlMode = authority
        && currentPhase(reviewPhase, practiceMode) === "FREE_CHAT"
        ? MANUAL_RESPONSE_MODE
        : AUTOMATIC_RESPONSE_MODE;

    const trace = useCallback((event, data = {}) => {
        const current = stateRef.current;
        traceVoiceSessionEvent({
            sessionId: activeSessionIdRef.current || current.sessionId,
            event,
            source: "browser.expression_assist",
            data,
        });
    }, []);

    const settleAssistStatus = useCallback((turnId, { error = null } = {}) => {
        const normalizedTurnId = String(turnId || "").trim();
        const statusEntry = assistStatusesRef.current.get(normalizedTurnId);
        if (!statusEntry) return;
        if (statusEntry.timerId) clearTimeout(statusEntry.timerId);
        if (statusEntry.itemId) {
            if (error) {
                updateTranscriptItem(statusEntry.itemId, {
                    title: ASSIST_ERROR_TITLE,
                    status: "ERROR",
                    data: {
                        kind: "EXPRESSION_ASSIST_ERROR",
                        icon: "ERROR",
                        loading: false,
                        sourceTurnId: normalizedTurnId,
                        error,
                    },
                });
            } else {
                removeTranscriptItem(statusEntry.itemId);
            }
        } else if (error) {
            addTranscriptBreadcrumb(ASSIST_ERROR_TITLE, {
                kind: "EXPRESSION_ASSIST_ERROR",
                icon: "ERROR",
                loading: false,
                sourceTurnId: normalizedTurnId,
                error,
            });
        }
        assistStatusesRef.current.delete(normalizedTurnId);
    }, [addTranscriptBreadcrumb, removeTranscriptItem, updateTranscriptItem]);

    const scheduleAssistStatus = useCallback((turnId) => {
        if (!authority) return;
        const normalizedTurnId = String(turnId || "").trim();
        settleAssistStatus(normalizedTurnId);
        const statusEntry = { itemId: null, timerId: null };
        statusEntry.timerId = setTimeout(() => {
            statusEntry.timerId = null;
            statusEntry.itemId = addTranscriptBreadcrumb(ASSIST_LOADING_TITLE, {
                kind: "EXPRESSION_ASSIST_LOADING",
                icon: "CHECK",
                loading: true,
                sourceTurnId: normalizedTurnId,
            });
        }, ASSIST_LOADING_DELAY_MS);
        assistStatusesRef.current.set(normalizedTurnId, statusEntry);
    }, [addTranscriptBreadcrumb, authority, settleAssistStatus]);

    const cancelAssistStatuses = useCallback((reason) => {
        [...assistStatusesRef.current.keys()].forEach((turnId) => settleAssistStatus(turnId));
        trace("expression_assist_wait_cancelled", { reason });
    }, [settleAssistStatus, trace]);

    const requestControlledResponse = useCallback((directive, sourceTurnId) => {
        if (!authority || latestTurnIdRef.current !== sourceTurnId) return false;
        if (responseRequestedRef.current.has(sourceTurnId)) return true;
        const result = requestResponse({
            turnId: sourceTurnId,
            instructions: directive?.instruction || "Continue the conversation naturally.",
            metadata: {
                mark2_expression_assist_action: directive?.action || "NO_ACTION",
            },
        });
        if (result?.ok) responseRequestedRef.current.add(sourceTurnId);
        return result?.ok === true;
    }, [authority, requestResponse]);

    const processPacket = useCallback((packet) => {
        const directive = packet?.responseDirective;
        const sourceTurnId = String(directive?.sourceTurnId || "").trim();
        if (sourceTurnId
            && latestTurnIdRef.current
            && latestTurnIdRef.current !== sourceTurnId) return;
        packetRef.current = packet;
        trace("expression_assist_packet", {
            assistRunId: packet?.assistRunId || null,
            revision: packet?.revision ?? null,
            sourceTurnId,
            action: directive?.action || null,
            gate: directive?.gate || null,
        });
        if (shadow && directive) {
            console.info("[ExpressionAssistGraphShadow]", {
                assistRunId: packet.assistRunId,
                revision: packet.revision,
                sourceTurnId,
                action: directive.action,
                gate: directive.gate,
            });
        }
        if (!authority
            || !sourceTurnId
            || userSpeechPendingRef.current
            || latestTurnIdRef.current !== sourceTurnId) return;
        if (responseRequestedRef.current.has(sourceTurnId)) return;

        if (directive.action === "ASSIST_UNAVAILABLE") {
            settleAssistStatus(sourceTurnId);
            requestControlledResponse(directive, sourceTurnId);
            return;
        }

        const effect = (Array.isArray(packet.effects) ? packet.effects : [])
            .find((item) => item?.effectId === directive.effectId && item?.claimable);
        if (directive.effectId && effectProcessingRef.current.has(directive.effectId)) return;
        if (directive.effectId && !effect) {
            settleAssistStatus(sourceTurnId, { error: "card_effect_unavailable" });
            return;
        }
        if (!effect) {
            settleAssistStatus(sourceTurnId);
            requestControlledResponse(directive, sourceTurnId);
            return;
        }
        if (effectProcessingRef.current.has(effect.effectId)) return;
        effectProcessingRef.current.add(effect.effectId);

        queueMicrotask(async () => {
            const queue = queueRef.current;
            try {
                if (!queue) throw new Error("Expression Assist graph queue is unavailable");
                await queue.enqueue(EXPRESSION_ASSIST_GRAPH_EVENT_TYPES.CARD_EFFECT_CLAIMED, {
                    effectId: effect.effectId,
                });
                if (latestTurnIdRef.current !== sourceTurnId) {
                    await queue.enqueue(EXPRESSION_ASSIST_GRAPH_EVENT_TYPES.CARD_EFFECT_FAILED, {
                        effectId: effect.effectId,
                        error: "source turn became stale before card delivery",
                    });
                    return;
                }

                addExpressionCard(effect.payload?.proposal, {
                    ...(effect.payload?.metadata || {}),
                    itemId: `expression-card-${effect.effectId}`,
                });
                await waitForCardCommit();
                settleAssistStatus(sourceTurnId);
                requestControlledResponse(directive, sourceTurnId);
                await queue.enqueue(EXPRESSION_ASSIST_GRAPH_EVENT_TYPES.CARD_EFFECT_COMPLETED, {
                    effectId: effect.effectId,
                });
            } catch (error) {
                console.error("Expression Assist card effect failed", error);
                if (queue) {
                    await queue.enqueue(EXPRESSION_ASSIST_GRAPH_EVENT_TYPES.CARD_EFFECT_FAILED, {
                        effectId: effect.effectId,
                        error: error?.message || "card delivery failed",
                    }).catch(() => undefined);
                }
                settleAssistStatus(sourceTurnId, {
                    error: error?.message || "card_delivery_failed",
                });
            } finally {
                effectProcessingRef.current.delete(effect.effectId);
            }
        });
    }, [
        addExpressionCard,
        authority,
        requestControlledResponse,
        settleAssistStatus,
        shadow,
        trace,
    ]);

    useEffect(() => {
        processPacketRef.current = processPacket;
    }, [processPacket]);

    useEffect(() => {
        if (!enabled) {
            queueRef.current = null;
            packetRef.current = null;
            return undefined;
        }
        const queue = new ExpressionAssistGraphEventQueue({
            sendEvent: (event) => sendExpressionAssistGraphEvent({
                ...event,
                userId: stateRef.current.userId,
                sessionId: activeSessionIdRef.current || stateRef.current.sessionId,
            }),
            onPacket: (packet) => processPacketRef.current(packet),
            onError: (error, event) => {
                const details = {
                    assistRunId: queueRef.current?.assistRunId || null,
                    eventType: event?.type || null,
                    code: error?.code || "EXPRESSION_ASSIST_GRAPH_ERROR",
                    message: error?.message || String(error),
                };
                console.error("[ExpressionAssistGraph] event failed", {
                    ...details,
                });
                trace("expression_assist_graph_error", details);
            },
        });
        queueRef.current = queue;
        return () => {
            if (queueRef.current === queue) {
                cancelAssistStatuses("flow_cleanup");
                queue.reset();
                queueRef.current = null;
                activeSessionIdRef.current = null;
            }
        };
    }, [cancelAssistStatuses, enabled, trace, userId]);

    useEffect(() => {
        if (status !== "CONNECTED") return;
        const result = setResponseControlMode(desiredResponseControlMode);
        if (result?.ok !== true) {
            console.error("Unable to switch Realtime response control", result?.reason);
        }
    }, [desiredResponseControlMode, setResponseControlMode, status]);

    useEffect(() => {
        const freeChatActive = currentPhase(reviewPhase, practiceMode) === "FREE_CHAT";
        const leftFreeChat = wasFreeChatRef.current && !freeChatActive;
        wasFreeChatRef.current = freeChatActive;
        if (!enabled || !leftFreeChat) return;

        latestTurnIdRef.current = null;
        userSpeechPendingRef.current = false;
        cancelAssistStatuses("left_free_chat");
        const queue = queueRef.current;
        if (!queue?.assistRunId) return;
        queue.enqueue(EXPRESSION_ASSIST_GRAPH_EVENT_TYPES.CONTEXT_RESET, {
            reason: "left_free_chat",
        }).catch((error) => {
            console.error("[ExpressionAssistGraph] context reset failed", {
                code: error?.code || "EXPRESSION_ASSIST_GRAPH_ERROR",
                message: error?.message || String(error),
            });
        });
    }, [cancelAssistStatuses, enabled, practiceMode, reviewPhase]);

    const startRun = useCallback(async ({
        assistRunId = null,
        restart = false,
        sourceSessionId = null,
    } = {}) => {
        if (!enabled) return null;
        const queue = queueRef.current;
        if (!queue) throw new Error("Expression Assist graph queue is not initialized");
        const current = stateRef.current;
        activeSessionIdRef.current = sourceSessionId || current.sessionId;
        const response = await startExpressionAssistGraphRun({
            userId: current.userId,
            sessionId: activeSessionIdRef.current,
            assistRunId,
            restart,
        });
        await queue.setRun(response);
        latestTurnIdRef.current = null;
        userSpeechPendingRef.current = false;
        cancelAssistStatuses("run_started");
        effectProcessingRef.current.clear();
        responseRequestedRef.current.clear();
        return response;
    }, [cancelAssistStatuses, enabled]);

    const observeCompletedTurn = useCallback(({ itemId, transcript, occurredAt, itemIds, segmentCount }) => {
        if (!enabled) return Promise.resolve(null);
        userSpeechPendingRef.current = false;
        const current = stateRef.current;
        if (currentPhase(current.reviewPhase, current.practiceMode) !== "FREE_CHAT") {
            return Promise.resolve(null);
        }
        const normalizedTranscript = String(transcript || "").trim();
        if (isUntrustedExpressionAssistTranscript(normalizedTranscript)) {
            const deferredPacket = packetRef.current;
            if (deferredPacket) {
                queueMicrotask(() => processPacketRef.current(deferredPacket));
            }
            return Promise.resolve({ ignored: true, gate: "untrusted_transcript" });
        }
        const turnId = String(itemId || `free-chat-turn-${Date.now()}`).trim();
        latestTurnIdRef.current = turnId;
        scheduleAssistStatus(turnId);
        trace("expression_assist_turn_submitted", {
            turnId,
            itemIds: Array.isArray(itemIds) ? itemIds : [turnId],
            segmentCount: Number(segmentCount || 1),
            transcript: normalizedTranscript,
        });

        const snapshot = buildExpressionAssistSnapshot({
            enabled: true,
            userId: current.userId,
            sessionId: current.sessionId,
            mode: "FREE_CHAT",
            status: current.status,
            transcriptItems: current.transcriptItems,
        });
        const queue = queueRef.current;
        if (!queue?.assistRunId) {
            settleAssistStatus(turnId, { error: "graph_run_unavailable" });
            return Promise.reject(new Error("Expression Assist graph run is not initialized"));
        }

        return queue.enqueueTurn({
            mode: "FREE_CHAT",
            turnId,
            transcript: normalizedTranscript,
            contextMessages: boundedMessagesWithCurrentTurn(current.transcriptItems, {
                itemId: turnId,
                transcript: normalizedTranscript,
            }),
            hasPendingProactiveCard: snapshot.hasPendingProactiveCard,
        }, { occurredAt }).catch((error) => {
            if (authority && latestTurnIdRef.current === turnId) {
                settleAssistStatus(turnId, { error: error?.code || "graph_request_failed" });
            } else {
                settleAssistStatus(turnId);
            }
            trace("expression_assist_turn_failed", {
                turnId,
                code: error?.code || "EXPRESSION_ASSIST_GRAPH_ERROR",
                message: error?.message || String(error),
            });
            throw error;
        });
    }, [authority, enabled, scheduleAssistStatus, settleAssistStatus, trace]);

    const markUserSpeechStarted = useCallback(() => {
        userSpeechPendingRef.current = true;
        cancelAssistStatuses("new_user_speech");
    }, [cancelAssistStatuses]);

    return {
        enabled,
        authority,
        shadow,
        mode: EXPRESSION_ASSIST_GRAPH_MODE,
        desiredResponseControlMode,
        activeRunId: queueRef.current?.assistRunId || null,
        startRun,
        observeCompletedTurn,
        markUserSpeechStarted,
    };
}
