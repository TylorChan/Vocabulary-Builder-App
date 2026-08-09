import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    buildExpressionAssistSnapshot,
    ExpressionAssistController,
} from "../utils/expressionAssist.js";
import {
    isExpressionAssistEnabled,
    reportExpressionAssistEvent,
    requestExpressionAssist,
} from "../utils/expressionAssistClient.js";
import { createExpressionAssistTool } from "../utils/expressionAssistTool.js";

function readExpressionAssistTimeoutMs() {
    const rawValue = String(import.meta.env.VITE_EXPRESSION_ASSIST_TIMEOUT_MS ?? "").trim();
    const normalizedValue = rawValue.toLowerCase();
    if (["0", "off", "none", "disabled"].includes(normalizedValue)) return null;

    const configured = Number(rawValue || 5_000);
    return Number.isFinite(configured)
        ? Math.max(500, Math.min(30_000, configured))
        : 5_000;
}

export function useExpressionAssistFlow({
    userId,
    sessionId,
    mode,
    status,
    transcriptItems,
    addExpressionCard,
}) {
    const enabled = isExpressionAssistEnabled();
    const stateRef = useRef({
        userId,
        sessionId,
        mode,
        status,
        transcriptItems,
    });
    stateRef.current = { userId, sessionId, mode, status, transcriptItems };

    const controllerRef = useRef(null);
    if (!controllerRef.current) {
        controllerRef.current = new ExpressionAssistController({
            getSnapshot: () => buildExpressionAssistSnapshot({
                enabled,
                ...stateRef.current,
            }),
            requestDecision: requestExpressionAssist,
            onSuggestion: (proposal, metadata) => addExpressionCard(proposal, metadata),
            timeoutMs: readExpressionAssistTimeoutMs(),
            onTelemetry: (event) => {
                if (!event?.assistRequestId) return;
                void reportExpressionAssistEvent(event);
            },
        });
    }

    useEffect(() => {
        if (status === "DISCONNECTED") controllerRef.current?.cancel("disconnected");
    }, [status]);

    useEffect(() => () => controllerRef.current?.cancel("unmounted"), []);

    const expressionAssistTool = useMemo(() => (
        enabled
            ? createExpressionAssistTool({
                onRequest: (input) => controllerRef.current.request(input),
            })
            : null
    ), [enabled]);

    const cancelExpressionAssist = useCallback((reason) => {
        controllerRef.current?.cancel(reason);
    }, []);

    return { enabled, expressionAssistTool, cancelExpressionAssist };
}
