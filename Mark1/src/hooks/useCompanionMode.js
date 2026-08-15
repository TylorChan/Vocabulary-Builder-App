/* global chrome */
import { useCallback, useEffect, useRef } from "react";
import { getCompletedConversationMessages } from "../utils/expressionAssist";
import {
    classifyCompanionIntent,
    COMPANION_INTENTS,
} from "../utils/companionIntentClient";
import { traceVoiceSessionEvent } from "../utils/voiceSessionTraceClient";

function boundedMessagesWithCurrentTurn(transcriptItems, { itemId, transcript }) {
    const messages = getCompletedConversationMessages(transcriptItems).slice(-3);
    const turnId = String(itemId || "").trim();
    const text = String(transcript || "").replace(/\s+/g, " ").trim();
    const index = messages.findIndex((message) => message.messageId === turnId);
    const current = { messageId: turnId, role: "user", text };
    if (index >= 0) messages[index] = current;
    else messages.push(current);
    return messages.slice(-3).map(({ role, text: messageText }) => ({ role, text: messageText }));
}

function isUsableTurn(transcript) {
    const text = String(transcript || "").trim().toLowerCase();
    return Boolean(text)
        && !text.includes("inaudible")
        && !text.includes("transcribing")
        && !text.includes("transcription failed");
}

export function useCompanionMode({ sessionId, transcriptItems }) {
    const portRef = useRef(null);
    const activeRef = useRef(false);
    const queueRef = useRef(Promise.resolve());
    const sessionEpochRef = useRef(0);
    const stateRef = useRef({ sessionId, transcriptItems });
    stateRef.current = { sessionId, transcriptItems };

    const setAura = useCallback((enabled) => {
        activeRef.current = enabled;
        portRef.current?.postMessage({ type: "COMPANION_AURA_SET", enabled });
    }, []);

    useEffect(() => {
        const port = chrome.runtime.connect({ name: "extension-popup" });
        portRef.current = port;
        return () => {
            try {
                port.postMessage({ type: "COMPANION_AURA_SET", enabled: false });
            } catch {
                // The extension may already be unloading.
            }
            port.disconnect();
            portRef.current = null;
            activeRef.current = false;
        };
    }, []);

    useEffect(() => {
        sessionEpochRef.current += 1;
        setAura(false);
    }, [sessionId, setAura]);

    const observeCompletedTurn = useCallback(({ itemId, transcript }) => {
        if (!isUsableTurn(transcript)) return Promise.resolve(null);
        const epoch = sessionEpochRef.current;
        const contextMessages = boundedMessagesWithCurrentTurn(
            stateRef.current.transcriptItems,
            { itemId, transcript },
        );

        const task = async () => {
            if (epoch !== sessionEpochRef.current) return null;
            try {
                const result = await classifyCompanionIntent({
                    sessionId: stateRef.current.sessionId,
                    turnId: itemId,
                    transcript,
                    active: activeRef.current,
                    contextMessages,
                });
                if (epoch !== sessionEpochRef.current) return null;
                if (result.intent === COMPANION_INTENTS.ENABLE) setAura(true);
                if (result.intent === COMPANION_INTENTS.DISABLE) setAura(false);
                traceVoiceSessionEvent({
                    sessionId: stateRef.current.sessionId,
                    source: "browser.companion_intent",
                    event: "companion_intent_decision",
                    data: {
                        turnId: itemId,
                        intent: result.intent,
                        reason: result.reason,
                        confidence: result.confidence,
                    },
                });
                return result;
            } catch (error) {
                console.warn("Companion intent observation failed:", error);
                return null;
            }
        };

        queueRef.current = queueRef.current.then(task, task);
        return queueRef.current;
    }, [setAura]);

    return { observeCompletedTurn };
}
