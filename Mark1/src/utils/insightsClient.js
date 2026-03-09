import { API_BASE_URL } from "../config/apiConfig";

const INSIGHTS_BASE_URL = API_BASE_URL;

export async function extractConversationInsightsWithLLM({ messages = [], videoTitles = [] }) {
    const res = await fetch(`${INSIGHTS_BASE_URL}/api/memory/extract-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, videoTitles }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`insights extraction failed: ${res.status} ${text}`);
    }

    return res.json();
}
