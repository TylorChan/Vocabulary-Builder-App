import { API_BASE_URL } from "../config/apiConfig";

export function isExpressionAssistEnabled() {
    return String(import.meta.env.VITE_EXPRESSION_ASSIST_ENABLED || "false").toLowerCase() === "true";
}

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || `Expression Assist request failed: ${response.status}`);
    }
    return payload;
}

export function requestExpressionAssist(payload, { signal } = {}) {
    return requestJson("/api/expression-assist/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
}

export async function syncExpressionRetrievalIndex({ userId, vocabularyId }) {
    if (!isExpressionAssistEnabled()) return { skipped: true };
    return requestJson("/api/expression-assist/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, vocabularyId }),
    });
}

export async function deleteExpressionRetrievalIndex({ userId, vocabularyId }) {
    if (!isExpressionAssistEnabled()) return { skipped: true };
    const params = new URLSearchParams({ userId: String(userId) });
    return requestJson(
        `/api/expression-assist/index/${encodeURIComponent(vocabularyId)}?${params}`,
        { method: "DELETE" },
    );
}

export function reportExpressionAssistEvent(payload) {
    if (!isExpressionAssistEnabled()) return Promise.resolve({ skipped: true });
    return fetch(`${API_BASE_URL}/api/expression-assist/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
    }).catch(() => null);
}
