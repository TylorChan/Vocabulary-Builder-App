function readViteEnv(key) {
    if (typeof import.meta === "undefined") return "";
    return import.meta?.env?.[key] || "";
}

function readProcessEnv(key) {
    if (typeof process === "undefined") return "";
    return process.env?.[key] || "";
}

function readModelEnv(key, fallback) {
    return String(
        readViteEnv(key) ||
        readProcessEnv(key) ||
        fallback
    ).trim();
}

const AI_MODELS = {
    GEMINI_DEFINE_MODEL: readModelEnv("GEMINI_DEFINE_MODEL", "gemini-2.5-flash-lite"),
    OPENAI_SESSION_TITLE_MODEL: readModelEnv("OPENAI_SESSION_TITLE_MODEL", "gpt-5.2-2025-12-11"),
    OPENAI_TONE_SANITIZER_MODEL: readModelEnv("OPENAI_TONE_SANITIZER_MODEL", "gpt-5-nano-2025-08-07"),
    OPENAI_TTS_PREVIEW_MODEL: readModelEnv("OPENAI_TTS_PREVIEW_MODEL", "gpt-4o-mini-tts-2025-12-15"),
    OPENAI_MEMORY_EXTRACTION_MODEL: readModelEnv("OPENAI_MEMORY_EXTRACTION_MODEL", "gpt-5.2-2025-12-11"),
    OPENAI_ROLEPLAY_PLAN_MODEL: readModelEnv("OPENAI_ROLEPLAY_PLAN_MODEL", "gpt-5-mini-2025-08-07"),
    OPENAI_SCENE_RATER_MODEL: readModelEnv("OPENAI_SCENE_RATER_MODEL", "gpt-5-mini-2025-08-07"),
    DEFAULT_REALTIME_MODEL: readModelEnv("VITE_REALTIME_MODEL", "gpt-realtime-1.5"),
    REALTIME_TRANSCRIBE_MODEL: readModelEnv("VITE_REALTIME_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe-2025-12-15"),
};

const AI_MODEL_USAGE = [
    {
        key: "GEMINI_DEFINE_MODEL",
        model: AI_MODELS.GEMINI_DEFINE_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/define",
        purpose: "Context-aware vocabulary definition generation",
    },
    {
        key: "OPENAI_SESSION_TITLE_MODEL",
        model: AI_MODELS.OPENAI_SESSION_TITLE_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/session/title",
        purpose: "Short session title generation",
    },
    {
        key: "OPENAI_TONE_SANITIZER_MODEL",
        model: AI_MODELS.OPENAI_TONE_SANITIZER_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/agent-tone/sanitize",
        purpose: "Tone/test text safety classification",
    },
    {
        key: "OPENAI_TTS_PREVIEW_MODEL",
        model: AI_MODELS.OPENAI_TTS_PREVIEW_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/agent-voice/test",
        purpose: "Voice preview TTS generation",
    },
    {
        key: "OPENAI_MEMORY_EXTRACTION_MODEL",
        model: AI_MODELS.OPENAI_MEMORY_EXTRACTION_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/memory/extract-insights and /Users/daqingchen/Vocabulary-Builder-App/Mark1/memory/memoryServer.js",
        purpose: "Semantic/episodic/procedural memory extraction and reconciliation",
    },
    {
        key: "OPENAI_ROLEPLAY_PLAN_MODEL",
        model: AI_MODELS.OPENAI_ROLEPLAY_PLAN_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/roleplay/plan",
        purpose: "Role-play scene planning",
    },
    {
        key: "OPENAI_SCENE_RATER_MODEL",
        model: AI_MODELS.OPENAI_SCENE_RATER_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/voiceServer.js:/api/rate-scene",
        purpose: "Word usage scene rating",
    },
    {
        key: "DEFAULT_REALTIME_MODEL",
        model: AI_MODELS.DEFAULT_REALTIME_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/voiceServer.js and /Users/daqingchen/Vocabulary-Builder-App/Mark1/src/hooks/useRealtimeSession.js",
        purpose: "Realtime voice tutor session model",
    },
    {
        key: "REALTIME_TRANSCRIBE_MODEL",
        model: AI_MODELS.REALTIME_TRANSCRIBE_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/src/hooks/useRealtimeSession.js",
        purpose: "Realtime speech-to-text transcription",
    },
];

const {
    GEMINI_DEFINE_MODEL,
    OPENAI_SESSION_TITLE_MODEL,
    OPENAI_TONE_SANITIZER_MODEL,
    OPENAI_TTS_PREVIEW_MODEL,
    OPENAI_MEMORY_EXTRACTION_MODEL,
    OPENAI_ROLEPLAY_PLAN_MODEL,
    OPENAI_SCENE_RATER_MODEL,
    DEFAULT_REALTIME_MODEL,
    REALTIME_TRANSCRIBE_MODEL,
} = AI_MODELS;

const REALTIME_MODEL = DEFAULT_REALTIME_MODEL;

export {
    AI_MODELS,
    AI_MODEL_USAGE,
    GEMINI_DEFINE_MODEL,
    OPENAI_SESSION_TITLE_MODEL,
    OPENAI_TONE_SANITIZER_MODEL,
    OPENAI_TTS_PREVIEW_MODEL,
    OPENAI_MEMORY_EXTRACTION_MODEL,
    OPENAI_ROLEPLAY_PLAN_MODEL,
    OPENAI_SCENE_RATER_MODEL,
    DEFAULT_REALTIME_MODEL,
    REALTIME_MODEL,
    REALTIME_TRANSCRIBE_MODEL,
};
