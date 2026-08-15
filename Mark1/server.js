import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import { Buffer } from "node:buffer";
import process from "node:process";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import {
    DEEPSEEK_COMPANION_INTENT_MODEL,
    DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT,
    DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    DEEPSEEK_TRANSCRIPT_REVIEW_MODEL,
    DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT,
    GEMINI_DEFINE_MODEL,
    GEMINI_TRANSCRIPT_REVIEW_MODEL,
    GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL,
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
    OPENAI_EXPRESSION_ASSIST_MODEL,
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
    OPENAI_EXPRESSION_EXTRACTION_MODEL,
    OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT,
    OPENAI_MEMORY_EXTRACTION_MODEL,
    OPENAI_SESSION_TITLE_MODEL,
    OPENAI_TONE_SANITIZER_MODEL,
    OPENAI_TTS_PREVIEW_MODEL,
} from "./config/aiModels.js";
import {
    normalizeExpressionExtraction,
    validateExpressionEnrichmentRequest,
} from "./src/utils/expressionContext.js";
import {
    buildExpressionExtractionInput,
    EXPRESSION_EXTRACTION_SCHEMA,
} from "./src/utils/expressionEnrichmentPrompt.js";
import {
    createRolePlayPlanningService,
    RolePlayPlanningError,
} from "./services/rolePlayPlanningService.js";
import { createReviewMemoryService } from "./services/reviewMemoryService.js";
import { createReviewTeachingService } from "./services/reviewTeachingService.js";
import { createTranscriptReviewBenchmarkService } from "./services/transcriptReviewBenchmarkService.js";
import { createReviewGraphRuntime } from "./orchestration/reviewGraph/reviewGraphRuntime.js";
import { createReviewGraphRouter } from "./routes/reviewGraphRoutes.js";
import { createTranscriptReviewRouter } from "./routes/transcriptReviewRoutes.js";
import { createExpressionAssistRouter } from "./routes/expressionAssistRoutes.js";
import { createExpressionAssistService } from "./services/expressionAssistService.js";
import { createExpressionGapGateService } from "./services/expressionGapGateService.js";
import { createCompanionIntentService } from "./services/companionIntentService.js";
import { createExpressionRetrievalStore } from "./services/expressionRetrievalStore.js";
import { createExpressionAssistGraphRuntime } from "./orchestration/expressionAssistGraph/expressionAssistGraphRuntime.js";
import { createExpressionAssistGraphRouter } from "./routes/expressionAssistGraphRoutes.js";
import { createVoiceSessionTraceStore } from "./services/voiceSessionTraceStore.js";
import { createVoiceSessionTraceRouter } from "./routes/voiceSessionTraceRoutes.js";
import { createCompanionIntentRouter } from "./routes/companionIntentRoutes.js";

// Load .env file
dotenv.config();
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// Express app
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(compression());

const voiceSessionTraceStore = createVoiceSessionTraceStore({
    enabled: process.env.VOICE_SESSION_TRACE_ENABLED
        ? process.env.VOICE_SESSION_TRACE_ENABLED === "true"
        : process.env.NODE_ENV !== "production",
});
if (voiceSessionTraceStore.enabled) {
    app.use(
        "/api/debug/voice-session-traces",
        createVoiceSessionTraceRouter({ store: voiceSessionTraceStore }),
    );
}

function traceNodeVoiceEvent(event, data = {}) {
    const sessionId = data?.sessionId || data?.sourceSessionId;
    if (!sessionId) return;
    voiceSessionTraceStore.append({
        sessionId,
        source: "node",
        event,
        data,
    }).catch((error) => {
        console.warn("[VoiceSessionTrace] write failed", error?.message || error);
    });
}

const expressionAssistLogger = {
    info(label, data = {}) {
        console.info(label, data);
        traceNodeVoiceEvent("expression_assist_decision", { label, ...data });
    },
    warn(label, data = {}) {
        console.warn(label, data);
        traceNodeVoiceEvent("expression_assist_warning", { label, ...data });
    },
};

const DEFINE_DEFINITION_MAX_CHARS = 110;
const DEFINE_IN_VIDEO_DEFINITION_MAX_CHARS = 150;
const DEFINE_REAL_LIFE_USAGE_MAX_CHARS = 120;
const DEFINE_EXAMPLE_MAX_CHARS = 130;
const DEFINE_EXAMPLE_TRANSLATION_MAX_CHARS = 110;

function truncateText(value, maxChars) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function normalizeDefinitionPayload(payload) {
    const inVideoDefinition = payload?.in_video_definition || payload?.inVideoDefinition || payload?.video_definition;
    return {
        ...payload,
        definition: truncateText(payload?.definition, DEFINE_DEFINITION_MAX_CHARS),
        in_video_definition: truncateText(inVideoDefinition, DEFINE_IN_VIDEO_DEFINITION_MAX_CHARS),
        readLife_usage: truncateText(payload?.readLife_usage, DEFINE_REAL_LIFE_USAGE_MAX_CHARS),
        example_sentence: truncateText(payload?.example_sentence, DEFINE_EXAMPLE_MAX_CHARS),
        example_translation: truncateText(payload?.example_translation, DEFINE_EXAMPLE_TRANSLATION_MAX_CHARS),
    };
}

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rolePlayPlanningService = createRolePlayPlanningService({ openaiClient: openai });
const reviewTeachingService = createReviewTeachingService({ openaiClient: openai });
const reviewMemoryService = createReviewMemoryService();
const reviewGraphRuntime = createReviewGraphRuntime({
    planningService: rolePlayPlanningService,
    memoryService: reviewMemoryService,
    teachingService: reviewTeachingService,
    logger: (record) => {
        console.info("[reviewGraph]", JSON.stringify(record));
        traceNodeVoiceEvent("review_graph", record);
    },
});
app.use("/api/review-runs", createReviewGraphRouter({ runtime: reviewGraphRuntime }));
const expressionAssistEnabled = process.env.EXPRESSION_ASSIST_ENABLED === "true";
let expressionAssistServicePromise = null;
const expressionAssistRuntime = {
    enabled: expressionAssistEnabled,
    getService() {
        if (!this.enabled) return Promise.resolve(null);
        if (!expressionAssistServicePromise) {
            expressionAssistServicePromise = Promise.resolve(createExpressionAssistService({
                openaiClient: openai,
                retrievalStore: createExpressionRetrievalStore({
                    openaiClient: openai,
                    embeddingModel: process.env.OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL
                        || OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
                    logger: expressionAssistLogger,
                }),
                model: process.env.OPENAI_EXPRESSION_ASSIST_MODEL
                    || OPENAI_EXPRESSION_ASSIST_MODEL,
                reasoningEffort: process.env.OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT
                    || OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
                enabled: true,
                timeoutMs: process.env.EXPRESSION_ASSIST_TIMEOUT_MS,
                logger: expressionAssistLogger,
            }));
        }
        return expressionAssistServicePromise;
    },
    async close() {
        if (!expressionAssistServicePromise) return;
        const service = await expressionAssistServicePromise;
        await service?.close?.();
        expressionAssistServicePromise = null;
    },
};
if (expressionAssistEnabled) {
    queueMicrotask(() => {
        expressionAssistRuntime.getService()
            .then((service) => service?.warm?.())
            .then(() => console.log("[ExpressionAssist] retrieval connection warmed"))
            .catch((error) => {
                console.warn("[ExpressionAssist] retrieval warmup unavailable", {
                    message: error?.message || String(error),
                });
            });
    });
}
app.use("/api/expression-assist", createExpressionAssistRouter({ runtime: expressionAssistRuntime }));
const expressionGapGateService = createExpressionGapGateService({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_EXPRESSION_GAP_GATE_MODEL
        || DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    reasoningEffort: process.env.DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT
        || DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    enabled: process.env.EXPRESSION_GAP_GATE_ENABLED === "true",
    timeoutMs: process.env.EXPRESSION_GAP_GATE_TIMEOUT_MS,
});
const companionIntentService = createCompanionIntentService({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_COMPANION_INTENT_MODEL
        || DEEPSEEK_COMPANION_INTENT_MODEL,
    reasoningEffort: process.env.DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT
        || DEEPSEEK_COMPANION_INTENT_REASONING_EFFORT,
    enabled: process.env.COMPANION_INTENT_GATE_ENABLED
        ? process.env.COMPANION_INTENT_GATE_ENABLED === "true"
        : process.env.EXPRESSION_GAP_GATE_ENABLED === "true",
    timeoutMs: process.env.COMPANION_INTENT_TIMEOUT_MS
        || process.env.EXPRESSION_GAP_GATE_TIMEOUT_MS,
});
app.use("/api/companion-intent", createCompanionIntentRouter({
    service: companionIntentService,
    onDecision: ({ request, result }) => {
        traceNodeVoiceEvent("companion_intent_decision", {
            sessionId: request?.sessionId,
            turnId: request?.turnId,
            intent: result.intent,
            reason: result.reason,
            confidence: result.confidence,
            totalMs: result.telemetry?.totalMs,
        });
    },
}));
const expressionAssistGraphRuntime = createExpressionAssistGraphRuntime({
    decisionServiceProvider: () => expressionAssistRuntime.getService(),
    gapServiceProvider: () => expressionGapGateService,
    logger: (record) => {
        console.info("[expressionAssistGraph]", JSON.stringify(record));
        traceNodeVoiceEvent("expression_assist_graph", record);
    },
});
app.use(
    "/api/expression-assist-runs",
    createExpressionAssistGraphRouter({ runtime: expressionAssistGraphRuntime }),
);
const transcriptReviewBenchmarkEnabled = process.env.TRANSCRIPT_REVIEW_BENCHMARK_ENABLED
    ? process.env.TRANSCRIPT_REVIEW_BENCHMARK_ENABLED === "true"
    : process.env.NODE_ENV !== "production";
if (transcriptReviewBenchmarkEnabled) {
    const transcriptReviewBenchmarkService = createTranscriptReviewBenchmarkService({
        geminiApiKey: process.env.GEMINI_API_KEY,
        deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        geminiModel: GEMINI_TRANSCRIPT_REVIEW_MODEL,
        geminiThinkingLevel: GEMINI_TRANSCRIPT_REVIEW_THINKING_LEVEL,
        deepseekModel: DEEPSEEK_TRANSCRIPT_REVIEW_MODEL,
        deepseekReasoningEffort: DEEPSEEK_TRANSCRIPT_REVIEW_REASONING_EFFORT,
        timeoutMs: process.env.TRANSCRIPT_REVIEW_TIMEOUT_MS,
    });
    app.use(
        "/api/transcript-review",
        createTranscriptReviewRouter({ service: transcriptReviewBenchmarkService }),
    );
}
// Gemini setup (for /api/define)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const REALTIME_SOUND_PROFILES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
];

// Endpoint for word definitions (Gemini 2.5 Flash-Lite)
app.post('/api/define', async (req, res) => {
    const { tmpText, videoTitle, surroundingText } = req.body;
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_DEFINE_MODEL,
            contents: `You are a vocabulary tutor helping English learners understand words from real 
  video/podcast content.

  Task: Explain the word/phrase in EXACT JSON format with natural, conversational language.

  Format Requirements:
  - Keep the answer compact. If the selected text is long, explain the key phrase/idea, not every word.
  - "definition": One short sentence, max ${DEFINE_DEFINITION_MAX_CHARS} characters, explaining the general meaning only.
  - "in_video_definition": One short sentence, max ${DEFINE_IN_VIDEO_DEFINITION_MAX_CHARS} characters, explaining how the word/phrase is used in THIS video. Integrate the context naturally—avoid phrases like "in the context of" or "the video states".
  - "readLife_usage": One short sentence, max ${DEFINE_REAL_LIFE_USAGE_MAX_CHARS} characters. Must start with 'In real life,' followed by a complete, coherent statement.
  - "example_sentence": One vivid real life practical example using the exact word "${tmpText}", max ${DEFINE_EXAMPLE_MAX_CHARS} characters.
  - "example_translation": Chinese translation of the example sentence, max ${DEFINE_EXAMPLE_TRANSLATION_MAX_CHARS} characters.

  Example 1:
  Word: "binge-watch"
  Video: "Netflix Shows Worth Your Time"
  Caption: "I totally binge-watched this series last weekend"
  Answer: {
    "definition": "This means watching many episodes of a show consecutively in one sitting.",
    "in_video_definition": "In this Netflix review, the host is describing shows that are so engaging you can't stop watching.",
    "readLife_usage": "In real life, people say this when talking about streaming shows for hours.",
    "example_sentence": "I accidentally binge-watched the entire season instead of sleeping.",
    "example_translation": "我一不小心刷了整季剧，都没睡觉。"
  }

  Example 2:
  Word: "render"
  Video: "Traditional Carbonara Recipe"
  Caption: "cook the guanciale to render out the fat"
  Answer: {
    "definition": "This means to melt and extract fat from meat by cooking it slowly.",
    "in_video_definition": "In this Italian cooking tutorial, the chef shows how to render fat from guanciale for carbonara sauce.",
    "readLife_usage": "In real life, cooks use this with bacon, duck, or other fatty meat.",
    "example_sentence": "Render the bacon until crispy, then save the fat for cooking vegetables.",
    "example_translation": "把培根煎到酥脆，然后留下油脂用来炒菜。"
  }

  Now complete:
  Word: "${tmpText}"
  Video: "${videoTitle || 'Unknown video'}"
  Caption: "${surroundingText || 'No context available'}"
  Answer: {`,
            config: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseJsonSchema: {
                    type: "object",
                    properties: {
                        definition: { type: "string" },
                        in_video_definition: { type: "string" },
                        readLife_usage: { type: "string" },
                        example_sentence: { type: "string" },
                        example_translation: { type: "string" }
                    },
                    required: ["definition", "in_video_definition", "readLife_usage", "example_sentence", "example_translation"]
                }
            }
        });
        const parsedData = normalizeDefinitionPayload(JSON.parse(response.text));
        console.log(parsedData);
        return res.json(parsedData);
    } catch (error) {
        console.log("ERROR: " + error.message);
        return res.status(500).json({ error: error.message });
    }
});

app.post("/api/expression/enrich", async (req, res) => {
    let request;
    try {
        request = validateExpressionEnrichmentRequest(req.body);
    } catch (error) {
        return res.status(400).json({
            error: error.message,
            code: "invalid_expression_evidence",
        });
    }

    try {
        const response = await openai.responses.create({
            model: OPENAI_EXPRESSION_EXTRACTION_MODEL,
            reasoning: {
                effort: OPENAI_EXPRESSION_EXTRACTION_REASONING_EFFORT,
            },
            input: buildExpressionExtractionInput(request),
            text: {
                format: {
                    type: "json_schema",
                    name: "expression_learning_context",
                    schema: EXPRESSION_EXTRACTION_SCHEMA,
                    strict: true,
                },
            },
            max_output_tokens: 3000,
            store: false,
        });

        const rawText = response.output_text ?? response.output?.[0]?.content?.[0]?.text ?? "";
        if (!rawText) {
            throw new Error("Expression extraction returned no structured output");
        }
        const payload = JSON.parse(rawText);
        const enrichment = normalizeExpressionExtraction({
            payload,
            request,
            extractorModel: OPENAI_EXPRESSION_EXTRACTION_MODEL,
        });
        return res.json(enrichment);
    } catch (error) {
        const insufficientEvidence = error?.code === "insufficient_evidence";
        console.error("expression enrichment error:", error.message);
        return res.status(insufficientEvidence ? 422 : 500).json({
            error: error.message,
            code: insufficientEvidence ? "insufficient_evidence" : "expression_enrichment_failed",
        });
    }
});

app.post("/api/session/title", async (req, res) => {
    const { messages = [] } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages is required" });
    }

    const compact = messages
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && m?.text)
        .map((m) => ({
            role: m.role,
            text: String(m.text).slice(0, 280),
        }))
        .slice(-8);

    if (!compact.length) {
        return res.status(400).json({ error: "valid messages are required" });
    }

    try {
        const response = await openai.responses.create({
            model: OPENAI_SESSION_TITLE_MODEL,
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: "Create a concise session title from a dialogue. Return 2-6 words, plain text style, no emoji, no quotes.",
                        },
                    ],
                },
                {
                    role: "user",
                    content: [{ type: "input_text", text: JSON.stringify(compact) }],
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "session_title",
                    schema: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                        },
                        required: ["title"],
                        additionalProperties: false,
                    },
                    strict: true,
                },
            },
        });

        const payload = response.output_text ? JSON.parse(response.output_text) : null;
        const title = String(payload?.title || "").trim() || "Conversation";
        return res.json({ title: title.slice(0, 48) });
    } catch (error) {
        console.error("session title error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

app.post("/api/agent-tone/sanitize", async (req, res) => {
    const type = String(req.body?.type || "tone").trim().toLowerCase() === "test_text"
        ? "test_text"
        : "tone";
    const rawValue = String(req.body?.value ?? req.body?.tone ?? "").trim();

    if (!rawValue) {
        return res.json({
            accepted: true,
            sanitizedTone: "",
            sanitizedValue: "",
            reason: "Empty tone cleared.",
        });
    }

    if (rawValue.length > 300) {
        return res.status(400).json({
            error: "input is too long (max 300 chars)",
        });
    }

    const schema = {
        type: "object",
        properties: {
            accepted: { type: "boolean" },
            reason: { type: "string" },
        },
        required: ["accepted", "reason"],
        additionalProperties: false,
    };

    const prompt = type === "test_text"
        ? `
You are validating test speech text for a realtime voice preview.
This is moderation/classification only, NOT rewriting.

Input:
${JSON.stringify(rawValue)}

Rules:
- Default to ACCEPT.
- Accept natural short text that can be spoken aloud in a demo.
- Reject only if the input is clearly and explicitly unsafe.
- Reject only if the input contains explicit abusive profanity, hate, sexual content, violence, illegal content, or other clearly unsafe language.
- Reject obvious spam or nonsense only if it is unusable.
- Do NOT rewrite, summarize, or sanitize the input.
- Return only:
  - accepted: boolean
  - reason: exactly one short sentence (max 100 chars).
`
        : `
You are validating a user's custom tone/style text for a realtime English tutor.
This is moderation/classification only, NOT rewriting.

Input:
${JSON.stringify(rawValue)}

Rules:
- Default to ACCEPT.
- Reject only if the input is clearly and explicitly unsafe.
- Reject only if the input contains explicit abusive profanity, hate, sexual content, violence, illegal content, or other clearly unsafe language.
- Reject obvious spam or complete nonsense only if it is unusable.
- Do NOT reject text just because it is dramatic, sarcastic, intense, highly stylized, or refers to a fictional or recognizable personality.
- Do NOT reject text just because it sounds role-play-like, theatrical, cinematic, edgy, bossy, arrogant, playful, or character-inspired.
- If the input is merely a stylistic preference, even if unusual or strongly worded, ACCEPT it.
- Do NOT rewrite, summarize, or sanitize the input.
- Return only:
  - accepted: boolean
  - reason: exactly one short sentence (max 100 chars).
`;

    try {
        const response = await openai.responses.create({
            model: OPENAI_TONE_SANITIZER_MODEL,
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: "You are a safety validator for user-defined speaking style settings.",
                        },
                    ],
                },
                {
                    role: "user",
                    content: [{ type: "input_text", text: prompt }],
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "agent_tone_validation",
                    schema,
                    strict: true,
                },
            },
            max_output_tokens: 120,
        });

        let payload = null;
        if (response.output_text) {
            try {
                payload = JSON.parse(response.output_text);
            } catch {
                payload = null;
            }
        }

        // Fail open for tone preferences: only reject when the model explicitly says false.
        const accepted = type === "tone" || type === "test_text"
            ? payload?.accepted !== false
            : Boolean(payload?.accepted);

        const reason = String(payload?.reason || "").replace(/\s+/g, " ").trim().slice(0, 100)
            || (accepted
                ? "Accepted: valid input."
                : "Rejected: invalid or unsafe input.");

        if (!accepted) {
            return res.json({
                accepted: false,
                sanitizedTone: "",
                sanitizedValue: "",
                reason,
            });
        }

        return res.json({
            accepted: true,
            sanitizedTone: rawValue,
            sanitizedValue: rawValue,
            reason,
        });
    } catch (error) {
        console.error("agent tone sanitize error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

app.post("/api/agent-voice/test", async (req, res) => {
    const requestedProfile = String(req.body?.soundProfile || "").trim().toLowerCase();
    const soundProfile = REALTIME_SOUND_PROFILES.includes(requestedProfile)
        ? requestedProfile
        : "shimmer";
    const tone = String(req.body?.tone || "").trim();
    const text = String(req.body?.text || "").trim();

    if (!text) {
        return res.status(400).json({ error: "text is required" });
    }
    if (text.length > 300) {
        return res.status(400).json({ error: "text too long (max 300 chars)" });
    }
    if (tone.length > 300) {
        return res.status(400).json({ error: "tone too long (max 300 chars)" });
    }

    try {
        const tts = await openai.audio.speech.create({
            model: OPENAI_TTS_PREVIEW_MODEL,
            voice: soundProfile,
            input: text,
            instructions: tone
                ? `Speak using this EXACT style guidance: ${tone}`
                : "Speak naturally and clearly.",
            format: "mp3",
        });

        const audioBuffer = Buffer.from(await tts.arrayBuffer());
        return res.json({
            mimeType: "audio/mpeg",
            audioBase64: audioBuffer.toString("base64"),
            soundProfile,
        });
    } catch (error) {
        console.error("agent voice test error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

app.post("/api/memory/extract-insights", async (req, res) => {
    const { messages = [], videoTitles = [] } = req.body || {};
    if (!Array.isArray(messages)) {
        return res.status(400).json({ error: "messages must be an array" });
    }
    if (!Array.isArray(videoTitles)) {
        return res.status(400).json({ error: "videoTitles must be an array" });
    }

    const compact = messages
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && m?.text)
        .map((m) => ({
            role: m.role,
            text: String(m.text).replace(/\s+/g, " ").trim().slice(0, 280),
        }))
        .filter((m) => m.text.length > 0)
        .slice(-30);

    const messageCount = compact.length;
    const userMessageCount = compact.filter((m) => m.role === "user").length;
    const compactVideoTitles = [...new Set(
        videoTitles
            .map((t) => String(t || "").replace(/\s+/g, " ").trim())
            .filter((t) => t.length > 0)
    )].slice(0, 20);
    const videoTitleCount = compactVideoTitles.length;

    if (!messageCount && !videoTitleCount) {
        return res.json({
            topics: [],
            videoTopics: [],
            stylePreferences: [],
            summary: "No substantial conversation yet.",
            messageCount: 0,
            userMessageCount: 0,
            videoTitleCount: 0,
        });
    }

    const prompt = `
You are a memory extraction engine for English-learning conversations.

Goal:
Extract stable personalization signals from dialogue.

Definitions:
- confidence: how certain you are this item is supported by dialogue (0.0-1.0)
- stability: how likely this item is useful across future sessions (0.0-1.0)
  low = one-off mention, medium = repeated in this session, high = recurring preference
- time decay is computed by backend, so do NOT output decay values

Hard constraints:
- Use evidence from user messages and provided video titles.
- Be conservative and factual.
- Avoid generic items: "english", "practice", "good", "thing".
- Do not include personally identifying info.
- If evidence is weak, return fewer items.

Output rules:
- topics: up to 6 concise interest topics.
- videoTopics: up to 5 content themes inferred from video titles.
- stylePreferences: up to 6 stable speaking/learning preferences (e.g., correction style, pacing, slang preference).
- For each item include: text, confidence, stability, evidence.
- summary: 1-2 short sentences on recurring interests and stable preferences.

Return JSON only.

Dialogue:
${JSON.stringify(compact)}

Video titles from saved vocabulary:
${JSON.stringify(compactVideoTitles)}
`;

    const schema = {
        type: "object",
        properties: {
            topics: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        text: { type: "string" },
                        confidence: { type: "number" },
                        stability: { type: "number" },
                        evidence: { type: "string" },
                    },
                    required: ["text", "confidence", "stability", "evidence"],
                    additionalProperties: false,
                },
            },
            videoTopics: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        text: { type: "string" },
                        confidence: { type: "number" },
                        stability: { type: "number" },
                        evidence: { type: "string" },
                    },
                    required: ["text", "confidence", "stability", "evidence"],
                    additionalProperties: false,
                },
            },
            stylePreferences: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        text: { type: "string" },
                        confidence: { type: "number" },
                        stability: { type: "number" },
                        evidence: { type: "string" },
                    },
                    required: ["text", "confidence", "stability", "evidence"],
                    additionalProperties: false,
                },
            },
            summary: { type: "string" },
        },
        required: ["topics", "videoTopics", "stylePreferences", "summary"],
        additionalProperties: false,
    };

    const clamp01 = (n, fallback = 0.5) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return fallback;
        return Math.max(0, Math.min(1, v));
    };

    const normalizeSignalItems = (list, maxItems) => {
        const seen = new Set();
        return (Array.isArray(list) ? list : [])
            .map((item) => {
                if (typeof item === "string") {
                    return {
                        text: item,
                        confidence: 0.65,
                        stability: 0.55,
                        evidence: "Recovered from non-structured item.",
                    };
                }
                return {
                    text: String(item?.text || "").trim(),
                    confidence: clamp01(item?.confidence, 0.6),
                    stability: clamp01(item?.stability, 0.55),
                    evidence: String(item?.evidence || "").trim() || "No explicit evidence provided.",
                };
            })
            .map((item) => ({ ...item, text: item.text.replace(/\s+/g, " ") }))
            .filter((item) => item.text.length > 0)
            .filter((item) => {
                const key = item.text.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, maxItems);
    };

    try {
        const response = await openai.responses.create({
            model: OPENAI_MEMORY_EXTRACTION_MODEL,
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: "You extract structured user interests for personalization. Be factual and concise.",
                        },
                    ],
                },
                {
                    role: "user",
                    content: [{ type: "input_text", text: prompt }],
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "conversation_insights",
                    schema,
                    strict: true,
                },
            },
            max_output_tokens: 900,
        });

        const payload = response.output_text ? JSON.parse(response.output_text) : {};
        const topics = normalizeSignalItems(payload.topics, 6);
        const videoTopics = normalizeSignalItems(payload.videoTopics, 5);
        const stylePreferences = normalizeSignalItems(payload.stylePreferences, 6);
        const summary = String(payload.summary || "").trim() || "No substantial conversation yet.";

        return res.json({
            topics,
            videoTopics,
            stylePreferences,
            summary,
            messageCount,
            userMessageCount,
            videoTitleCount,
        });
    } catch (error) {
        console.error("memory extract error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

app.post("/api/roleplay/retrieval-plan", async (req, res) => {
    try {
        res.json(await rolePlayPlanningService.createRetrievalPlan(req.body || {}));
    } catch (error) {
        console.error("roleplay retrieval plan error:", error.message);
        const status = error instanceof RolePlayPlanningError ? error.status : 500;
        res.status(status).json({ error: error.message, code: error.code || "ROLEPLAY_RETRIEVAL_FAILED" });
    }
});

app.post("/api/roleplay/plan", async (req, res) => {
    try {
        res.json(await rolePlayPlanningService.createScenePlan(req.body || {}));
    } catch (error) {
        console.error("roleplay plan error:", error.message);
        const status = error instanceof RolePlayPlanningError ? error.status : 500;
        res.status(status).json({ error: error.message, code: error.code || "ROLEPLAY_PLAN_FAILED" });
    }
});

// Create HTTP server from Express app
const httpServer = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Attach WebSocket server to same HTTP server
const wss = new WebSocketServer({ server: httpServer });


wss.on('connection', (browserWS) => {
    console.log('Browser connected');

    // Connect to Deepgram with auth headers
    const deepgramWS = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
            punctuate: 'true',
            interim_results: 'true',
            filler_words: 'true',
            smart_format: 'true',
            model: 'nova-3',
        }),
        {
            headers: { 'Authorization': `token ${DEEPGRAM_API_KEY}` }
        }
    );

    // Handle Deepgram connection events
    deepgramWS.on('error', (error) => {
        console.error('Deepgram error:', error.message);
    });

    browserWS.on('error', (error) => {
        console.error('Browser error:', error.message);
    });


    deepgramWS.on('open', () => {
        if (browserWS.readyState === WebSocket.OPEN) {
            browserWS.send(JSON.stringify({ type: "READY" }));
        }
        console.log('Deepgram connection established');
    });

    // Relay audio: Browser → Deepgram
    browserWS.on('message', (audioData, isbinary) => {
        if (deepgramWS.readyState === WebSocket.OPEN) {
            // console.log(isbinary)
            // NOTE: websocket accepts binary (audio data here) and text data. 
            // The server was blindly forwarding everything as binary. 
            // So fowarding type check is necessary here.
            if (isbinary) {
                console.log('start transcription');
                deepgramWS.send(audioData);
            } else {
                const parsed = JSON.parse(audioData);
                if (parsed?.type === 'KeepAlive') {
                    console.log('Forwarding KeepAlive to Deepgram');
                    deepgramWS.send(JSON.stringify(parsed));
                    return;
                }
            }
        }
    });

    // Relay transcription: Deepgram → Browser
    deepgramWS.on('message', (transcription) => {
        if (browserWS.readyState === WebSocket.OPEN) {
            console.log('send transcription to browser');
            const textData = transcription.toString();
            browserWS.send(textData);
            console.log(textData)
            // browserWS.send(transcription);
        }
    });

    // Cleanup on disconnect
    browserWS.on('close', () => deepgramWS.close());
    deepgramWS.on('close', () => browserWS.close());
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal}: closing services`);
    await reviewGraphRuntime.close().catch((error) => {
        console.error("review graph shutdown error:", error.message);
    });
    await expressionAssistRuntime.close().catch((error) => {
        console.error("expression assist shutdown error:", error.message);
    });
    await expressionAssistGraphRuntime.close().catch((error) => {
        console.error("expression assist graph shutdown error:", error.message);
    });
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
