import { API_BASE_URL } from "../config/apiConfig";

const ROLEPLAY_BASE_URL = API_BASE_URL;

export async function fetchRolePlayPlan({ dueWords, memory, semanticHints, currentUserFocus = "" }) {
    const res = await fetch(`${ROLEPLAY_BASE_URL}/api/roleplay/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueWords, memory, semanticHints, currentUserFocus }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`roleplay plan failed: ${res.status} ${text}`);
    }

    return res.json();
}
