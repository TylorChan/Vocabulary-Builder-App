import { MEMORY_BASE_URL } from "../config/apiConfig";

async function postJson(path, payload) {
    let response;
    try {
        response = await fetch(`${MEMORY_BASE_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        const err = new Error("Auth service unavailable.");
        err.status = 0;
        throw err;
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const err = new Error(
            String(data?.error || `Auth request failed (${response.status})`)
        );
        err.status = response.status;
        throw err;
    }
    return data;
}

export async function registerAuthUserRemote({ email, name, password }) {
    const data = await postJson("/auth/register", { email, name, password });
    return data?.user || null;
}

export async function signInAuthUserRemote({ email, password }) {
    const data = await postJson("/auth/signin", { email, password });
    return data?.user || null;
}

