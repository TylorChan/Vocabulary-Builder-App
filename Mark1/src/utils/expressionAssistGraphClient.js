import { API_BASE_URL } from "../config/apiConfig";

export const EXPRESSION_ASSIST_GRAPH_MODES = Object.freeze({
    OFF: "off",
    SHADOW: "shadow",
    AUTHORITY: "authority",
});

export const EXPRESSION_ASSIST_GRAPH_MODE = (() => {
    const value = String(import.meta.env.VITE_EXPRESSION_ASSIST_GRAPH_MODE || "off")
        .trim()
        .toLowerCase();
    return Object.values(EXPRESSION_ASSIST_GRAPH_MODES).includes(value)
        ? value
        : EXPRESSION_ASSIST_GRAPH_MODES.OFF;
})();

export const EXPRESSION_ASSIST_GRAPH_EVENT_TYPES = Object.freeze({
    FREE_CHAT_TURN_COMPLETED: "FREE_CHAT_TURN_COMPLETED",
    CONTEXT_RESET: "CONTEXT_RESET",
    CARD_EFFECT_CLAIMED: "CARD_EFFECT_CLAIMED",
    CARD_EFFECT_COMPLETED: "CARD_EFFECT_COMPLETED",
    CARD_EFFECT_FAILED: "CARD_EFFECT_FAILED",
});

export class ExpressionAssistGraphHttpError extends Error {
    constructor(message, {
        status = 500,
        code = "EXPRESSION_ASSIST_GRAPH_HTTP_ERROR",
        response = null,
    } = {}) {
        super(message);
        this.name = "ExpressionAssistGraphHttpError";
        this.status = status;
        this.code = code;
        this.response = response;
        this.controlPacket = response?.controlPacket || null;
    }
}

export function resolveExpressionAssistGraphTimeoutMs(value) {
    const rawValue = String(value ?? "").trim();
    const normalizedValue = rawValue.toLowerCase();
    if (["0", "off", "none", "disabled"].includes(normalizedValue)) return null;

    const configured = Number(rawValue || 15_000);
    return Number.isFinite(configured)
        ? Math.max(1_000, Math.min(45_000, configured))
        : 15_000;
}

function requestTimeoutMs() {
    return resolveExpressionAssistGraphTimeoutMs(
        import.meta.env.VITE_EXPRESSION_ASSIST_GRAPH_TIMEOUT_MS,
    );
}

async function requestJson(path, options = {}) {
    const controller = new AbortController();
    const timeoutMs = requestTimeoutMs();
    const timeoutId = timeoutMs == null
        ? null
        : setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            signal: controller.signal,
        });
        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : {};
        } catch {
            payload = { error: text || `HTTP ${response.status}` };
        }
        if (!response.ok) {
            throw new ExpressionAssistGraphHttpError(
                payload?.error || `Expression Assist graph failed: ${response.status}`,
                { status: response.status, code: payload?.code, response: payload },
            );
        }
        return payload;
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new ExpressionAssistGraphHttpError("Expression Assist graph timed out", {
                status: 504,
                code: "EXPRESSION_ASSIST_GRAPH_TIMEOUT",
            });
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function startExpressionAssistGraphRun({
    userId,
    sessionId,
    assistRunId = null,
    restart = false,
    eventId = globalThis.crypto?.randomUUID?.(),
}) {
    return requestJson("/api/expression-assist-runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId, assistRunId, restart, eventId }),
    });
}

export async function sendExpressionAssistGraphEvent({
    assistRunId,
    userId,
    sessionId,
    eventId,
    type,
    expectedRevision,
    payload = {},
    occurredAt,
}) {
    return requestJson(`/api/expression-assist-runs/${encodeURIComponent(assistRunId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            userId,
            sessionId,
            eventId,
            type,
            expectedRevision,
            payload,
            occurredAt,
        }),
    });
}
