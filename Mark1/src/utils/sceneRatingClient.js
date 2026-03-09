import { VOICE_BASE_URL } from "../config/apiConfig";

export async function rateScene({ sceneEvidence, wordsInScene }) {
    const res = await fetch(`${VOICE_BASE_URL}/api/rate-scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneEvidence, wordsInScene })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`rate-scene failed: ${text}`);
    }

    return res.json();
}
