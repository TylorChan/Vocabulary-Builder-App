const MEMORY_BASE_URL = "http://localhost:3003";

export async function loadMemoryBootstrap(userId) {
    const res = await fetch(`${MEMORY_BASE_URL}/memory/bootstrap?userId=${userId}`);
    if (!res.ok) throw new Error(`memory bootstrap failed: ${res.status}`);
    return res.json(); // { userId, memory: { semantic, episodic, procedural } }
}

export async function updateMemoryBucket({ userId, bucket, value }) {
    const res = await fetch(`${MEMORY_BASE_URL}/memory/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, bucket, value }),
    });
    if (!res.ok) throw new Error(`memory update failed: ${res.status}`);
    return res.json();
}

export async function addSemanticMemory({ userId, text, metadata = {} }) {
    const res = await fetch(`${MEMORY_BASE_URL}/memory/semantic/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text, metadata }),
    });
    if (!res.ok) throw new Error(`memory semantic add failed: ${res.status}`);
    return res.json();
}

export async function searchSemanticMemory({ userId, query, k = 5 }) {
    const url = new URL(`${MEMORY_BASE_URL}/memory/semantic/search`);
    url.searchParams.set("userId", userId);
    url.searchParams.set("query", query);
    url.searchParams.set("k", String(k));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`memory search failed: ${res.status}`);
    return res.json(); // { results: [...] }
}