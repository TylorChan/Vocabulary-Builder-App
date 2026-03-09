function stripTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function toWebSocketBase(httpBase) {
    if (!httpBase) return "";
    return httpBase.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
}

const IS_LOCAL_BUILD =
    (typeof import.meta !== "undefined" && import.meta?.env?.DEV) ||
    (typeof import.meta !== "undefined" && import.meta?.env?.MODE === "prodlocal");

const API_BASE_URL = stripTrailingSlash(
    import.meta.env.VITE_API_BASE_URL || (IS_LOCAL_BUILD ? "http://localhost:3000" : "")
);

const VOICE_BASE_URL = stripTrailingSlash(
    import.meta.env.VITE_VOICE_BASE_URL || (IS_LOCAL_BUILD ? "http://localhost:3002" : "")
);

const MEMORY_BASE_URL = stripTrailingSlash(
    import.meta.env.VITE_MEMORY_BASE_URL || (IS_LOCAL_BUILD ? "http://localhost:3003" : "")
);

const BACKEND_BASE_URL = stripTrailingSlash(
    import.meta.env.VITE_BACKEND_BASE_URL || (IS_LOCAL_BUILD ? "http://localhost:8080" : "")
);

const GRAPHQL_ENDPOINT = stripTrailingSlash(
    import.meta.env.VITE_GRAPHQL_ENDPOINT || `${BACKEND_BASE_URL}/graphql`
);

const DEEPGRAM_RELAY_WS_URL = stripTrailingSlash(
    import.meta.env.VITE_DEEPGRAM_RELAY_WS_URL || toWebSocketBase(API_BASE_URL)
);

export {
    API_BASE_URL,
    BACKEND_BASE_URL,
    VOICE_BASE_URL,
    MEMORY_BASE_URL,
    GRAPHQL_ENDPOINT,
    DEEPGRAM_RELAY_WS_URL,
};
