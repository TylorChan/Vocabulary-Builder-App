const ROLEPLAY_BASE_URL = "http://localhost:3000";

export async function fetchRolePlayPlan({ dueWords, memory, semanticHints }) {
    const res = await fetch(`${ROLEPLAY_BASE_URL}/api/roleplay/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueWords, memory, semanticHints }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`roleplay plan failed: ${res.status} ${text}`);
    }

    return res.json();
}