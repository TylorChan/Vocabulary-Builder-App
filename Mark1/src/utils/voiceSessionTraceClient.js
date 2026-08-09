import { API_BASE_URL } from "../config/apiConfig";

const FLUSH_DELAY_MS = 250;
const queue = [];
let flushTimer = null;

function tracingEnabled() {
    const configured = String(import.meta.env.VITE_VOICE_SESSION_TRACE_ENABLED ?? "").trim().toLowerCase();
    if (configured) return configured === "true";
    return import.meta.env.DEV === true;
}

async function flush() {
    flushTimer = null;
    const events = queue.splice(0, queue.length);
    if (!events.length) return;
    try {
        await fetch(`${API_BASE_URL}/api/debug/voice-session-traces/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }),
            keepalive: true,
        });
    } catch {
        // Debug tracing must never affect the voice workflow.
    }
}

export function traceVoiceSessionEvent({ sessionId, event, data = {}, source = "browser" }) {
    if (!tracingEnabled()) return;
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedEvent = String(event || "").trim();
    if (!normalizedSessionId || !normalizedEvent) return;
    queue.push({
        sessionId: normalizedSessionId,
        source,
        event: normalizedEvent,
        occurredAt: new Date().toISOString(),
        data,
    });
    if (queue.length >= 20) {
        if (flushTimer) clearTimeout(flushTimer);
        void flush();
        return;
    }
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

export function flushVoiceSessionTrace() {
    if (flushTimer) clearTimeout(flushTimer);
    return flush();
}
