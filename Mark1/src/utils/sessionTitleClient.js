import { API_BASE_URL } from "../config/apiConfig";

const SESSION_TITLE_BASE_URL = API_BASE_URL;

export async function summarizeSessionTitle({ messages }) {
    const res = await fetch(`${SESSION_TITLE_BASE_URL}/api/session/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`session title failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data?.title || "";
}
