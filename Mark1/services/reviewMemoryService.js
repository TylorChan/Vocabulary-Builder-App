import process from "node:process";

const DEFAULT_TIMEOUT_MS = 10_000;
const ROLEPLAY_GROUP_MEMORY_TOP_K_FALLBACK = 3;

function stripTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(fetchImpl, url, { timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) {
            const body = await response.text();
            const error = new Error(`Memory service failed: ${response.status} ${body.slice(0, 240)}`);
            error.status = response.status;
            error.retryable = response.status === 429 || response.status >= 500;
            throw error;
        }
        return response.json();
    } finally {
        clearTimeout(timer);
    }
}

export function createReviewMemoryService({
    baseUrl = process.env.MEMORY_SERVICE_URL
        || process.env.VITE_MEMORY_BASE_URL
        || "http://localhost:3003",
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.REVIEW_MEMORY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
} = {}) {
    const normalizedBaseUrl = stripTrailingSlash(baseUrl);
    if (!normalizedBaseUrl) throw new Error("Review memory service requires a base URL");
    if (typeof fetchImpl !== "function") throw new Error("Review memory service requires fetch");

    return {
        async loadBootstrap(userId) {
            const url = new URL(`${normalizedBaseUrl}/memory/bootstrap`);
            url.searchParams.set("userId", String(userId || ""));
            return fetchJson(fetchImpl, url, { timeoutMs });
        },
        async searchSemantic({ userId, query, k = ROLEPLAY_GROUP_MEMORY_TOP_K_FALLBACK }) {
            const url = new URL(`${normalizedBaseUrl}/memory/semantic/search`);
            url.searchParams.set("userId", String(userId || ""));
            url.searchParams.set("query", String(query || ""));
            url.searchParams.set("k", String(Math.max(1, Math.min(10, Number(k) || 3))));
            return fetchJson(fetchImpl, url, { timeoutMs });
        },
    };
}
