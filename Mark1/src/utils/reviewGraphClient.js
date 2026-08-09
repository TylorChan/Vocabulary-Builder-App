import { API_BASE_URL } from "../config/apiConfig";

export const REVIEW_GRAPH_MODES = Object.freeze({
    OFF: "off",
    SHADOW: "shadow",
    AUTHORITY: "authority",
});

export const REVIEW_GRAPH_MODE = (() => {
    const value = String(import.meta.env.VITE_REVIEW_GRAPH_MODE || "off").trim().toLowerCase();
    return Object.values(REVIEW_GRAPH_MODES).includes(value) ? value : REVIEW_GRAPH_MODES.OFF;
})();

export const REVIEW_GRAPH_STRICT_TURN_GATE = String(
    import.meta.env.VITE_REVIEW_GRAPH_STRICT_TURN_GATE || "false"
).trim().toLowerCase() === "true";

export class ReviewGraphHttpError extends Error {
    constructor(message, { status = 500, code = "REVIEW_GRAPH_HTTP_ERROR", response = null } = {}) {
        super(message);
        this.name = "ReviewGraphHttpError";
        this.status = status;
        this.code = code;
        this.response = response;
        this.controlPacket = response?.controlPacket || null;
    }
}

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { error: text || `HTTP ${response.status}` };
    }
    if (!response.ok) {
        throw new ReviewGraphHttpError(payload?.error || `Review graph failed: ${response.status}`, {
            status: response.status,
            code: payload?.code,
            response: payload,
        });
    }
    return payload;
}

export async function startReviewGraphRun({
    userId,
    sessionId,
    dueWords,
    legacyProgress = null,
    reviewRunId = null,
    restart = false,
    eventId = globalThis.crypto?.randomUUID?.(),
}) {
    return requestJson("/api/review-runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            userId,
            sessionId,
            dueWords,
            legacyProgress,
            reviewRunId,
            restart,
            eventId,
        }),
    });
}

export async function sendReviewGraphEvent({
    reviewRunId,
    userId,
    sessionId,
    eventId,
    type,
    expectedRevision,
    payload = {},
    occurredAt,
}) {
    return requestJson(`/api/review-runs/${encodeURIComponent(reviewRunId)}/events`, {
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

export async function loadReviewGraphRun({ reviewRunId, userId, sessionId }) {
    const query = new URLSearchParams({ userId, sessionId });
    return requestJson(`/api/review-runs/${encodeURIComponent(reviewRunId)}?${query.toString()}`);
}
