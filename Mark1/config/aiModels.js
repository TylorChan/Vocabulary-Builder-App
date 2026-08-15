function readViteEnv(key) {
    if (typeof import.meta === "undefined") return "";
    return import.meta?.env?.[key] || "";
}

function readProcessEnv(key) {
    return globalThis.process?.env?.[key] || "";
}

function readModelEnv(key, fallback) {
    return String(
        readViteEnv(key) ||
        readProcessEnv(key) ||
        fallback
    ).trim();
}

function readReasoningEffortEnv(key, fallback = "high") {
    const value = readModelEnv(key, fallback).toLowerCase();
    return new Set(["minimal", "low", "medium", "high", "max"]).has(value)
        ? value
        : fallback;
}

function readEnumEnv(key, fallback, allowedValues) {
    const value = readModelEnv(key, fallback).toLowerCase();
    return new Set(allowedValues).has(value) ? value : fallback;
}

const AI_MODELS = {
    GEMINI_DEFINE_MODEL: readModelEnv("GEMINI_DEFINE_MODEL", "gemini-2.5-flash-lite"),
    OPENAI_SESSION_TITLE_MODEL: readModelEnv("OPENAI_SESSION_TITLE_MODEL", "gpt-5.2-2025-12-11"),
    OPENAI_TONE_SANITIZER_MODEL: readModelEnv("OPENAI_TONE_SANITIZER_MODEL", "gpt-5-nano-2025-08-07"),
    OPENAI_TTS_PREVIEW_MODEL: readModelEnv("OPENAI_TTS_PREVIEW_MODEL", "gpt-4o-mini-tts-2025-12-15"),
    OPENAI_MEMORY_EXTRACTION_MODEL: readModelEnv("OPENAI_MEMORY_EXTRACTION_MODEL", "gpt-5.2-2025-12-11"),
    OPENAI_EXPRESSION_EXTRACTION_MODEL: readModelEnv("OPENAI_EXPRESSION_EXTRACTION_MODEL", "gpt-5.6-terra"),
    OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT: readReasoningEffortEnv("OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT", "high"),
    OPENAI_EXPRESSION_ASSIST_MODEL: readModelEnv("OPENAI_EXPRESSION_ASSIST_MODEL", "gpt-5.6-terra"),
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT: readReasoningEffortEnv("OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT", "medium"),
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL: readModelEnv("OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL", "text-embedding-3-small"),
    DEEPSEEK_EXPRESSION_GAP_GATE_MODEL: readModelEnv("DEEPSEEK_EXPRESSION_GAP_GATE_MODEL", "deepseek-v4-flash"),
    DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT: readEnumEnv(
        "DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT",
        "none",
        ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    ),
    DEEPSEEK_COMPANION_INTENT_MODEL: readModelEnv("DEEPSEEK_COMPANION_INTENT_MODEL", "deepseek-v4-flash"),
    DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT: readEnumEnv(
        "DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT",
        "none",
        ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    ),
    OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL: readModelEnv("OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL", "gpt-5.4-mini-2026-03-17"),
    OPENAI_ROLEPLAY_SCENE_PLAN_MODEL: readModelEnv("OPENAI_ROLEPLAY_SCENE_PLAN_MODEL", "gpt-5.6-sol"),
    OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT: readReasoningEffortEnv("OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT", "high"),
    OPENAI_REVIEW_TURN_EVIDENCE_MODEL: readModelEnv("OPENAI_REVIEW_TURN_EVIDENCE_MODEL", "gpt-5.6-terra"),
    OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT: readReasoningEffortEnv("OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT", "medium"),
    GEMINI_TRANSCRIPT_REVIEW_MODEL: readModelEnv("GEMINI_TRANSCRIPT_REVIEW_MODEL", "gemini-3.6-flash"),
    GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL: readEnumEnv(
        "GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL",
        "minimal",
        ["minimal", "low", "medium", "high"],
    ),
    DEEPSEEK_TRANSCRIPT_REVIEW_MODEL: readModelEnv("DEEPSEEK_TRANSCRIPT_REVIEW_MODEL", "deepseek-v4-flash"),
    DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT: readEnumEnv(
        "DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT",
        "none",
        ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    ),
    OPENAI_REVIEW_BEAT_REPLANNER_MODEL: readModelEnv("OPENAI_REVIEW_BEAT_REPLANNER_MODEL", "gpt-5.6-terra"),
    OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT: readReasoningEffortEnv("OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT", "high"),
    OPENAI_SCENE_RATER_MODEL: readModelEnv("OPENAI_SCENE_RATER_MODEL", "gpt-5-mini-2025-08-07"),
    DEFAULT_REALTIME_MODEL: readModelEnv("VITE_REALTIME_MODEL", "gpt-realtime-2.1"),
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
        key: "OPENAI_EXPRESSION_EXTRACTION_MODEL",
        model: AI_MODELS.OPENAI_EXPRESSION_EXTRACTION_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/expression/enrich",
        purpose: "Evidence-bound Expression learning-context extraction",
    },
    {
        key: "OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT",
        model: AI_MODELS.OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/expression/enrich",
        purpose: "Expression extraction reasoning effort",
    },
    {
        key: "OPENAI_EXPRESSION_ASSIST_MODEL",
        model: AI_MODELS.OPENAI_EXPRESSION_ASSIST_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/expressionAssistService.js",
        purpose: "Final Free Chat Expression Assist action and candidate selection",
    },
    {
        key: "OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT",
        model: AI_MODELS.OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/expressionAssistService.js",
        purpose: "Expression Assist final-decision reasoning effort",
    },
    {
        key: "OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL",
        model: AI_MODELS.OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/expressionRetrievalStore.js",
        purpose: "Per-user Expression retrieval embeddings",
    },
    {
        key: "DEEPSEEK_EXPRESSION_GAP_GATE_MODEL",
        model: AI_MODELS.DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/expressionGapGateService.js",
        purpose: "Low-latency semantic routing gate for implicit Free Chat expression gaps",
    },
    {
        key: "DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT",
        model: AI_MODELS.DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/expressionGapGateService.js",
        purpose: "Expression gap gate reasoning effort",
    },
    {
        key: "DEEPSEEK_COMPANION_INTENT_MODEL",
        model: AI_MODELS.DEEPSEEK_COMPANION_INTENT_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/companionIntentService.js",
        purpose: "Voice-session enable/disable intent gate for current webpage context",
    },
    {
        key: "DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT",
        model: AI_MODELS.DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/companionIntentService.js",
        purpose: "Companion intent gate reasoning effort",
    },
    {
        key: "OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL",
        model: AI_MODELS.OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/roleplay/retrieval-plan",
        purpose: "Role-play word grouping and compact retrieval query planning",
    },
    {
        key: "OPENAI_ROLEPLAY_SCENE_PLAN_MODEL",
        model: AI_MODELS.OPENAI_ROLEPLAY_SCENE_PLAN_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/roleplay/plan",
        purpose: "Final role-play scene planning after group-level memory retrieval",
    },
    {
        key: "OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT",
        model: AI_MODELS.OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/server.js:/api/roleplay/plan",
        purpose: "Final role-play scene-planning reasoning effort",
    },
    {
        key: "OPENAI_REVIEW_TURN_EVIDENCE_MODEL",
        model: AI_MODELS.OPENAI_REVIEW_TURN_EVIDENCE_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/reviewTeachingService.js",
        purpose: "Optional non-blocking semantic classification of completed review turns",
    },
    {
        key: "OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT",
        model: AI_MODELS.OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/reviewTeachingService.js",
        purpose: "Review-turn semantic evidence reasoning effort",
    },
    {
        key: "GEMINI_TRANSCRIPT_REVIEW_MODEL",
        model: AI_MODELS.GEMINI_TRANSCRIPT_REVIEW_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/transcriptReviewBenchmarkService.js",
        purpose: "Gemini transcript-review latency and quality benchmark",
    },
    {
        key: "GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL",
        model: AI_MODELS.GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/transcriptReviewBenchmarkService.js",
        purpose: "Gemini transcript-review thinking level",
    },
    {
        key: "DEEPSEEK_TRANSCRIPT_REVIEW_MODEL",
        model: AI_MODELS.DEEPSEEK_TRANSCRIPT_REVIEW_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/transcriptReviewBenchmarkService.js",
        purpose: "DeepSeek transcript-review latency and quality benchmark",
    },
    {
        key: "DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT",
        model: AI_MODELS.DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/transcriptReviewBenchmarkService.js",
        purpose: "DeepSeek transcript-review reasoning effort",
    },
    {
        key: "OPENAI_REVIEW_BEAT_REPLANNER_MODEL",
        model: AI_MODELS.OPENAI_REVIEW_BEAT_REPLANNER_MODEL,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/reviewTeachingService.js",
        purpose: "Event-driven Teaching Beat replanning after support exhaustion",
    },
    {
        key: "OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT",
        model: AI_MODELS.OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT,
        usedBy: "/Users/daqingchen/Vocabulary-Builder-App/Mark1/services/reviewTeachingService.js",
        purpose: "Teaching Beat replanning reasoning effort",
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
    OPENAI_EXPRESSION_EXTRACTION_MODEL,
    OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT,
    OPENAI_EXPRESSION_ASSIST_MODEL,
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    DEEPSEEK_COMPANION_INTENT_MODEL,
    DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT,
    OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT,
    OPENAI_REVIEW_TURN_EVIDENCE_MODEL,
    OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT,
    GEMINI_TRANSCRIPT_REVIEW_MODEL,
    GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL,
    DEEPSEEK_TRANSCRIPT_REVIEW_MODEL,
    DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT,
    OPENAI_REVIEW_BEAT_REPLANNER_MODEL,
    OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT,
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
    OPENAI_EXPRESSION_EXTRACTION_MODEL,
    OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT,
    OPENAI_EXPRESSION_ASSIST_MODEL,
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    DEEPSEEK_COMPANION_INTENT_MODEL,
    DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT,
    OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT,
    OPENAI_REVIEW_TURN_EVIDENCE_MODEL,
    OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT,
    GEMINI_TRANSCRIPT_REVIEW_MODEL,
    GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL,
    DEEPSEEK_TRANSCRIPT_REVIEW_MODEL,
    DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT,
    OPENAI_REVIEW_BEAT_REPLANNER_MODEL,
    OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT,
    OPENAI_SCENE_RATER_MODEL,
    DEFAULT_REALTIME_MODEL,
    REALTIME_MODEL,
    REALTIME_TRANSCRIBE_MODEL,
};
