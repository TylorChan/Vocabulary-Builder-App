import { API_BASE_URL } from "../config/apiConfig";

const TONE_BASE_URL = API_BASE_URL;

export const REALTIME_SOUND_PROFILES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
];

export async function sanitizeAgentToneWithLLM({ tone = "", type = "tone" }) {
    const res = await fetch(`${TONE_BASE_URL}/api/agent-tone/sanitize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: tone, type }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`agent tone sanitize failed: ${res.status} ${text}`);
    }

    return res.json();
}

export async function testAgentVoicePreview({ soundProfile = "shimmer", tone = "", text = "" }) {
    const res = await fetch(`${TONE_BASE_URL}/api/agent-voice/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            soundProfile,
            tone,
            text,
        }),
    });

    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`agent voice test failed: ${res.status} ${msg}`);
    }

    return res.json();
}
