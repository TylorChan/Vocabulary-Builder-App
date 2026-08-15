import { API_BASE_URL } from "../config/apiConfig";

export const COMPANION_INTENTS = Object.freeze({
    ENABLE: "ENABLE",
    DISABLE: "DISABLE",
    NO_ACTION: "NO_ACTION",
});

export async function classifyCompanionIntent(payload, { signal } = {}) {
    const response = await fetch(`${API_BASE_URL}/api/companion-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body?.error || `Companion intent request failed: ${response.status}`);
    }
    return body;
}
