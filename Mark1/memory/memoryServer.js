import express from "express";
import cors from "cors";
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url) });
import { MongoClient } from "mongodb";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { MongoStore } from "./mongoStore.js";
import { createMemoryVectorStore } from "./memoryVectorStore.js";

let verbose = true;

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();

const memoryDbName =
    process.env.MONGODB_DATABASE ||
    process.env.MONGO_DB_NAME ||
    process.env.MONGODB_ATLAS_DB_NAME ||
    "vocabularydb";
const memoryCollection = process.env.MEMORY_STORE_COLLECTION || "lg_memory";
const memoryItemsCollectionName = process.env.MEMORY_ITEMS_COLLECTION || "memory_items";
const authUsersCollectionName = process.env.AUTH_USERS_COLLECTION || "user_accounts";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const store = new MongoStore({
    mongoClient: client,
    dbName: memoryDbName,
    collection: memoryCollection,
});
await store.ensureIndexes();

const authUsersCollection = client
    .db(memoryDbName)
    .collection(authUsersCollectionName);
await authUsersCollection.createIndex({ email: 1 }, { unique: true });
const memoryItemsCollection = client
    .db(memoryDbName)
    .collection(memoryItemsCollectionName);
await memoryItemsCollection.createIndex({ itemId: 1 }, { unique: true });
await memoryItemsCollection.createIndex({ userId: 1, bucket: 1, kind: 1, status: 1, updatedAt: -1 });

const { addMemoryChunk, semanticSearch } = await createMemoryVectorStore();

function debugLog(stage, payload = {}) {
    if (!verbose) return;
    console.log(`[memoryServer][${stage}]`, payload);
}

function parseStructuredOutput(response, label) {
    const text = String(response?.output_text || "");
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch (error) {
        debugLog("structured-output:parse-failed", {
            label,
            status: response?.status || null,
            incompleteDetails: response?.incomplete_details || null,
            outputTextLength: text.length,
            outputTextPreview: text.slice(0, 500),
            outputTextTail: text.slice(-500),
        });
        const reason = response?.incomplete_details?.reason
            ? ` (${response.incomplete_details.reason})`
            : "";
        throw new Error(`${label} returned malformed structured output${reason}`);
    }
}

const DECAY_HALF_LIFE_DAYS = 30;
const DECAY_LAMBDA = Math.log(2) / DECAY_HALF_LIFE_DAYS;

function clamp01(n, fallback = 0.5) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1, v));
}

function daysSince(isoDate) {
    const ts = Date.parse(isoDate || "");
    if (!Number.isFinite(ts)) return 0;
    const diff = Date.now() - ts;
    return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

function normalizeSignalItem(item, fallbackKind) {
    if (typeof item === "string") {
        return {
            kind: fallbackKind,
            text: item.trim(),
            confidence: 0.6,
            stability: 0.55,
            evidence: "Recovered from string item.",
        };
    }

    return {
        kind: String(item?.kind || fallbackKind || "").trim(),
        text: String(item?.text || "").trim(),
        confidence: clamp01(item?.confidence, 0.6),
        stability: clamp01(item?.stability, 0.55),
        evidence: String(item?.evidence || "").trim() || "No explicit evidence.",
    };
}

function toSignalArray(rawList = [], fallbackKind = "") {
    return (Array.isArray(rawList) ? rawList : [])
        .map((item) => {
            const normalized = normalizeSignalItem(item, fallbackKind);
            if (!normalized.text) return null;
            const lastSeenAt = item?.lastSeenAt || new Date().toISOString();
            const mentions = Math.max(1, Number(item?.mentions || 1));
            const ageDays = daysSince(lastSeenAt);
            const decayFactor = Math.exp(-DECAY_LAMBDA * ageDays);
            const baseScore = clamp01(normalized.confidence, 0.55) * clamp01(normalized.stability, 0.5);
            return {
                ...normalized,
                itemId: String(item?.itemId || item?.id || ""),
                lastSeenAt,
                mentions,
                rankScore: baseScore * decayFactor,
                status: String(item?.status || "active"),
            };
        })
        .filter(Boolean);
}

function buildSearchText(item) {
    return [
        `kind: ${item.kind}`,
        `text: ${item.text}`,
        `evidence: ${item.evidence || "none"}`,
    ].join("\n");
}

function compactMessages(messages = []) {
    return (Array.isArray(messages) ? messages : [])
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && m?.text)
        .map((m) => ({
            role: m.role,
            text: String(m.text).replace(/\s+/g, " ").trim().slice(0, 280),
        }))
        .filter((m) => m.text.length > 0)
        .slice(-30);
}

function compactVideoTitles(videoTitles = []) {
    return [...new Set(
        (Array.isArray(videoTitles) ? videoTitles : [])
            .map((t) => String(t || "").replace(/\s+/g, " ").trim())
            .filter((t) => t.length > 0)
    )].slice(0, 20);
}

async function extractSemanticInsights({ messages = [], videoTitles = [] }) {
    const compact = compactMessages(messages);
    const compactTitles = compactVideoTitles(videoTitles);

    if (!compact.length && !compactTitles.length) {
        return {
            topics: [],
            videoTopics: [],
            stylePreferences: [],
            summary: "No substantial conversation yet.",
        };
    }

    const prompt = `
You are a memory extraction engine for English-learning conversations.

Goal:
Extract stable personalization signals from dialogue.

Definitions:
- confidence: how certain you are this item is supported by dialogue (0.0-1.0)
- stability: how likely this item is useful across future sessions (0.0-1.0)
  low = one-off mention, medium = repeated in this session, high = recurring preference

Hard constraints:
- Use evidence from user messages and provided video titles.
- Be conservative and factual.
- Avoid generic items: "english", "practice", "good", "thing".
- Do not include personally identifying info.
- If evidence is weak, return fewer items.

Output rules:
- topics: up to 6 concise interest topics.
- videoTopics: up to 5 content themes inferred from video titles.
- stylePreferences: up to 6 stable speaking/learning preferences.
- For each item include: text, confidence, stability, evidence.
- summary: 1-2 short sentences on recurring interests and stable preferences.

Return JSON only.

Dialogue:
${JSON.stringify(compact)}

Video titles from saved vocabulary:
${JSON.stringify(compactTitles)}
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

    const response = await openai.responses.create({
        model: "gpt-5.2-2025-12-11",
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
        max_output_tokens: 4086,
    });

    const payload = parseStructuredOutput(response, "semantic extraction");
    const topics = (payload.topics || []).map((item) => normalizeSignalItem(item, "interest")).filter((item) => item.text);
    const videoTopics = (payload.videoTopics || []).map((item) => normalizeSignalItem(item, "video_topic")).filter((item) => item.text);
    const stylePreferences = (payload.stylePreferences || []).map((item) => normalizeSignalItem(item, "style_preference")).filter((item) => item.text);

    return {
        topics,
        videoTopics,
        stylePreferences,
        summary: String(payload.summary || "").trim() || "No substantial conversation yet.",
    };
}

async function extractEpisodicInsights({ messages = [], videoTitles = [] }) {
    const compact = compactMessages(messages);
    const compactTitles = compactVideoTitles(videoTitles);

    if (!compact.length && !compactTitles.length) {
        return {
            scenes: [],
            mistakes: [],
            slangSuggestions: [],
            summary: "No substantial session events.",
        };
    }

    const prompt = `
You extract episodic learning memory from one completed English-learning session.

Goal:
Capture session-specific events and useful near-term coaching reminders.

Hard constraints:
- Use only the current session dialogue and video titles.
- Focus on concrete events from this session, not stable long-term preferences.
- Be concise and factual.
- If evidence is weak, return fewer items.

Output rules:
- scenes: up to 4 short session events or scene summaries.
- mistakes: up to 6 speaking mistakes or weak spots worth remembering for the next few sessions.
- slangSuggestions: up to 4 useful phrases/slang suggestions that fit the user's recent scenes.
- Each item must include: text, confidence, stability, evidence.
- summary: 1-2 short sentences summarizing what happened in this session.

Return JSON only.

Dialogue:
${JSON.stringify(compact)}

Video titles from saved vocabulary:
${JSON.stringify(compactTitles)}
`;

    const schema = {
        type: "object",
        properties: {
            scenes: {
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
            mistakes: {
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
            slangSuggestions: {
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
        required: ["scenes", "mistakes", "slangSuggestions", "summary"],
        additionalProperties: false,
    };

    const response = await openai.responses.create({
        model: "gpt-5.2-2025-12-11",
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: "You extract episodic session memory for an English-learning tutor system.",
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
                name: "episodic_insights",
                schema,
                strict: true,
            },
        },
        max_output_tokens: 4086,
    });

    const payload = parseStructuredOutput(response, "episodic extraction");
    return {
        scenes: (payload.scenes || []).map((item) => normalizeSignalItem(item, "scene_event")).filter((item) => item.text),
        mistakes: (payload.mistakes || []).map((item) => normalizeSignalItem(item, "speaking_mistake")).filter((item) => item.text),
        slangSuggestions: (payload.slangSuggestions || []).map((item) => normalizeSignalItem(item, "slang_hint")).filter((item) => item.text),
        summary: String(payload.summary || "").trim() || "No substantial session events.",
    };
}

async function extractProceduralInsights({ messages = [], videoTitles = [] }) {
    const compact = compactMessages(messages);
    const compactTitles = compactVideoTitles(videoTitles);

    if (!compact.length && !compactTitles.length) {
        return {
            rules: [],
            summary: "No stable procedural rules detected.",
        };
    }

    const prompt = `
You extract procedural memory for an English-learning tutor.

Goal:
Infer stable teaching rules or operational preferences that should guide future tutoring behavior.

Hard constraints:
- Use only the current session dialogue and video titles.
- Only extract procedural rules if there is explicit or repeated evidence.
- Focus on how the tutor should behave, not on user interests or one-off scene content.
- Be conservative and concise.

Output rules:
- rules: up to 6 stable tutoring rules or interaction preferences.
- Each item must include: text, confidence, stability, evidence.
- summary: 1-2 short sentences summarizing the strongest stable operational preferences.

Return JSON only.

Dialogue:
${JSON.stringify(compact)}

Video titles from saved vocabulary:
${JSON.stringify(compactTitles)}
`;

    const schema = {
        type: "object",
        properties: {
            rules: {
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
        required: ["rules", "summary"],
        additionalProperties: false,
    };

    const response = await openai.responses.create({
        model: "gpt-5.2-2025-12-11",
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: "You extract stable procedural tutoring rules from dialogue.",
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
                name: "procedural_insights",
                schema,
                strict: true,
            },
        },
        max_output_tokens: 4086,
    });

    const payload = parseStructuredOutput(response, "procedural extraction");
    return {
        rules: (payload.rules || []).map((item) => normalizeSignalItem(item, "tutoring_rule")).filter((item) => item.text),
        summary: String(payload.summary || "").trim() || "No stable procedural rules detected.",
    };
}

async function findMemoryCandidates({ userId, bucket, item, k = 5 }) {
    const results = await semanticSearch({
        query: buildSearchText(item),
        k: Math.max(k * 3, 12),
        preFilter: {
            userId: { $eq: userId },
            bucket: { $eq: bucket },
            kind: { $eq: item.kind },
            status: { $eq: "active" },
        },
    });

    const itemIds = [];
    const seen = new Set();
    for (const doc of results) {
        const itemId = String(doc?.metadata?.itemId || "").trim();
        if (!itemId || seen.has(itemId)) continue;
        seen.add(itemId);
        itemIds.push(itemId);
        if (itemIds.length >= k) break;
    }

    if (!itemIds.length) return [];
    const docs = await memoryItemsCollection
        .find({
            userId,
            itemId: { $in: itemIds },
            bucket,
            status: "active",
        })
        .toArray();

    const byId = new Map(docs.map((doc) => [doc.itemId, doc]));
    return itemIds.map((id) => byId.get(id)).filter(Boolean);
}

async function reconcileMemoryItems({ incomingItems = [], candidateMap = {} }) {
    if (!incomingItems.length) return [];

    const schema = {
        type: "object",
        properties: {
            decisions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        tempId: { type: "string" },
                        action: { type: "string", enum: ["ADD", "UPDATE", "DELETE", "NONE"] },
                        targetId: { type: "string" },
                        mergedItem: {
                            type: "object",
                            properties: {
                                kind: { type: "string" },
                                text: { type: "string" },
                                confidence: { type: "number" },
                                stability: { type: "number" },
                                evidence: { type: "string" },
                            },
                            required: ["kind", "text", "confidence", "stability", "evidence"],
                            additionalProperties: false,
                        },
                        reason: { type: "string" },
                    },
                    required: ["tempId", "action", "targetId", "mergedItem", "reason"],
                    additionalProperties: false,
                },
            },
        },
        required: ["decisions"],
        additionalProperties: false,
    };

    const reconcileChunk = async (items) => {
        const prompt = `
You reconcile user memory items.

Task:
For each incoming item, compare it against the provided candidate existing items and decide one action:
- ADD: new stable memory, not covered by candidates
- UPDATE: same underlying preference/topic, but the incoming item should update an existing item
- DELETE: incoming evidence strongly shows an existing item should be archived
- NONE: duplicate or too weak, no change needed

Rules:
- Be conservative.
- Prefer UPDATE over ADD when the incoming item is a more specific continuation of an existing memory.
- Only use DELETE for clear contradiction or obsolescence.
- Keep text concise and reusable across future sessions.
- Do not invent new preferences not supported by the evidence.
- targetId must be provided for UPDATE / DELETE / NONE when you are referring to an existing item.
- For ADD, targetId must be an empty string.

Return JSON only.

Input:
${JSON.stringify(items.map((item) => ({
        incoming: item,
        candidates: candidateMap[item.tempId] || [],
    })))}
`;
        const response = await openai.responses.create({
            model: "gpt-5.2-2025-12-11",
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: "You reconcile new user memory items against existing structured memory.",
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
                    name: "memory_reconcile",
                    schema,
                    strict: true,
                },
            },
            max_output_tokens: 1600,
        });

        const payload = parseStructuredOutput(response, "memory reconcile");
        return Array.isArray(payload?.decisions) ? payload.decisions : [];
    };

    const batchSize = 1;
    const allDecisions = [];
    for (let i = 0; i < incomingItems.length; i += batchSize) {
        const chunk = incomingItems.slice(i, i + batchSize);
        const chunkDecisions = await reconcileChunk(chunk);
        allDecisions.push(...chunkDecisions);
    }
    return allDecisions;
}

function buildCanonicalProfile({ activeItems = [], existingSemantic = {}, summary = "", nowIso = new Date().toISOString() }) {
    const profileBase = existingSemantic?.profile || {};

    const toRanked = (kind) => toSignalArray(
        activeItems.filter((item) => item.kind === kind && item.status === "active"),
        kind
    ).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

    const toClusterShape = (items, maxItems) => items.slice(0, maxItems).map((item) => ({
        label: item.text,
        score: Number((item.rankScore || 0).toFixed(4)),
        supportCount: Math.max(1, Number(item.mentions || 1)),
        lastSeenAt: item.lastSeenAt || nowIso,
        supportingSignals: [item.text],
        evidence: item.evidence || "",
    }));

    const interests = toRanked("interest");
    const videoTopics = toRanked("video_topic");
    const preferences = toRanked("style_preference");

    const agentTone = profileBase?.agentTone || {
        raw: "",
        sanitized: "",
        updatedAt: null,
        source: "user_settings",
    };
    const agentVoice = profileBase?.agentVoice || {
        tone: { raw: "", sanitized: "", updatedAt: null, source: "user_settings" },
        soundProfile: "shimmer",
        testingText: { raw: "", sanitized: "", updatedAt: null, source: "user_settings" },
        updatedAt: null,
    };
    const agentBehavior = profileBase?.agentBehavior || {
        correctionLevel: "default",
        updatedAt: null,
        source: "user_settings",
    };

    return {
        ...existingSemantic,
        interests: interests.map((item) => item.text).slice(0, 20),
        videoTopics: videoTopics.map((item) => item.text).slice(0, 20),
        preferences: preferences.map((item) => item.text).slice(0, 20),
        interestSignals: interests.slice(0, 20).map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        videoTopicSignals: videoTopics.slice(0, 20).map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        preferenceSignals: preferences.slice(0, 20).map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        profile: {
            ...profileBase,
            coreInterests: toClusterShape(interests, 8),
            coreVideoTopics: toClusterShape(videoTopics, 6),
            corePreferences: toClusterShape(preferences, 6),
            agentTone,
            agentVoice,
            agentBehavior,
            correctionLevel: agentBehavior?.correctionLevel || profileBase?.correctionLevel || "default",
            summary: String(summary || "").trim() || String(profileBase?.summary || "").trim() || "No substantial conversation yet.",
            updatedAt: nowIso,
            version: 2,
        },
        conversationSummaries: [
            ...((existingSemantic?.conversationSummaries || []).slice(-4)),
            { when: nowIso, summary: String(summary || "").trim() || "No substantial conversation yet." },
        ],
    };
}

function buildEpisodicMemory({ activeItems = [], existingEpisodic = {}, summary = "", nowIso = new Date().toISOString(), difficultWordIds = [] }) {
    const ranked = (kind, maxItems) => toSignalArray(
        activeItems.filter((item) => item.kind === kind && item.status === "active"),
        kind
    )
        .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
        .slice(0, maxItems);

    const sceneEvents = ranked("scene_event", 6);
    const mistakes = ranked("speaking_mistake", 8);
    const slang = ranked("slang_hint", 6);

    return {
        ...existingEpisodic,
        lastScenes: sceneEvents.map((item) => item.text),
        difficultWords: Array.from(new Set([
            ...((existingEpisodic?.difficultWords || []).filter(Boolean)),
            ...difficultWordIds.filter(Boolean),
        ])).slice(-20),
        typicalMistakes: mistakes.map((item) => item.text),
        slangSuggestions: slang.map((item) => item.text),
        eventSignals: sceneEvents.map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        mistakeSignals: mistakes.map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        slangSignals: slang.map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        summary: String(summary || "").trim() || String(existingEpisodic?.summary || "").trim() || "No substantial session events.",
        updatedAt: nowIso,
        version: 2,
    };
}

function buildProceduralMemory({ activeItems = [], existingProcedural = {}, summary = "", nowIso = new Date().toISOString() }) {
    const rules = toSignalArray(
        activeItems.filter((item) => item.kind === "tutoring_rule" && item.status === "active"),
        "tutoring_rule"
    )
        .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
        .slice(0, 8);

    return {
        ...existingProcedural,
        rules: rules.map((item) => item.text),
        ruleSignals: rules.map((item) => ({
            itemId: item.itemId,
            kind: item.kind,
            text: item.text,
            confidence: item.confidence,
            stability: item.stability,
            evidence: item.evidence,
            lastSeenAt: item.lastSeenAt,
            mentions: item.mentions,
            rankScore: item.rankScore,
            status: item.status,
        })),
        summary: String(summary || "").trim() || String(existingProcedural?.summary || "").trim() || "No stable procedural rules detected.",
        updatedAt: nowIso,
        version: 2,
    };
}

async function applyMemoryDecision({ userId, bucket, sessionId, decision, incomingMap, existingById, nowIso }) {
    const incoming = incomingMap.get(decision.tempId);
    if (!incoming) return null;

    const merged = normalizeSignalItem(decision.mergedItem, incoming.kind);
    if (!merged.text) return null;

    if (decision.action === "ADD") {
        const doc = {
            itemId: uuidv4(),
            userId,
            bucket,
            kind: merged.kind,
            text: merged.text,
            confidence: merged.confidence,
            stability: merged.stability,
            evidence: merged.evidence,
            lastSeenAt: nowIso,
            mentions: 1,
            status: "active",
            sourceSessionId: sessionId || null,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        await memoryItemsCollection.insertOne(doc);
        await addMemoryChunk({
            text: buildSearchText(doc),
            metadata: {
                userId,
                bucket,
                kind: doc.kind,
                status: doc.status,
                itemId: doc.itemId,
            },
        });
        return { action: "ADD", itemId: doc.itemId, kind: doc.kind };
    }

    if (!decision.targetId) return null;
    const prev = existingById.get(decision.targetId);
    if (!prev) return null;

    if (decision.action === "DELETE") {
        await memoryItemsCollection.updateOne(
            { userId, itemId: decision.targetId },
            {
                $set: {
                    status: "archived",
                    updatedAt: nowIso,
                    archivedAt: nowIso,
                },
            }
        );
        return { action: "DELETE", itemId: decision.targetId, kind: prev.kind };
    }

    if (decision.action === "NONE") {
        await memoryItemsCollection.updateOne(
            { userId, itemId: decision.targetId },
            {
                $set: {
                    lastSeenAt: nowIso,
                    updatedAt: nowIso,
                },
                $inc: { mentions: 1 },
            }
        );
        return { action: "NONE", itemId: decision.targetId, kind: prev.kind };
    }

    if (decision.action === "UPDATE") {
        const nextDoc = {
            ...prev,
            kind: merged.kind || prev.kind,
            text: merged.text,
            confidence: merged.confidence,
            stability: merged.stability,
            evidence: merged.evidence,
            lastSeenAt: nowIso,
            updatedAt: nowIso,
            status: "active",
            sourceSessionId: sessionId || prev.sourceSessionId || null,
            mentions: Math.max(1, Number(prev.mentions || 1)) + 1,
        };
        await memoryItemsCollection.updateOne(
            { userId, itemId: decision.targetId },
            { $set: nextDoc }
        );
        await addMemoryChunk({
            text: buildSearchText(nextDoc),
            metadata: {
                userId,
                bucket,
                kind: nextDoc.kind,
                status: nextDoc.status,
                itemId: nextDoc.itemId,
            },
        });
        return { action: "UPDATE", itemId: decision.targetId, kind: nextDoc.kind };
    }

    return null;
}

function ns(userId, bucket) {
    return [userId, "memory", bucket];
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeName(name, fallbackEmail) {
    const trimmed = String(name || "").trim();
    if (trimmed) return trimmed;
    return (String(fallbackEmail || "").split("@")[0] || "User").slice(0, 80);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, saltBase64, keyLen = 64) {
    return scryptSync(password, Buffer.from(saltBase64, "base64"), keyLen).toString("base64");
}

function safePasswordMatch(password, passwordMeta) {
    const salt = String(passwordMeta?.salt || "");
    const storedHash = String(passwordMeta?.hash || "");
    const keyLen = Number(passwordMeta?.keyLen || 64);
    if (!salt || !storedHash) return false;

    const candidateHash = hashPassword(password, salt, keyLen);
    try {
        return timingSafeEqual(
            Buffer.from(candidateHash, "base64"),
            Buffer.from(storedHash, "base64")
        );
    } catch {
        return false;
    }
}

function toSessionUser(userDoc) {
    const email = normalizeEmail(userDoc?.email || "");
    return {
        id: email,
        email,
        name: String(userDoc?.name || email).trim() || email,
        createdAt: userDoc?.createdAt || new Date().toISOString(),
        lastLoginAt: userDoc?.lastLoginAt || new Date().toISOString(),
    };
}

app.post("/auth/register", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const name = normalizeName(req.body?.name, email);
        const password = String(req.body?.password || "");

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Please enter a valid email address." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters." });
        }

        const existing = await authUsersCollection.findOne({ email }, { projection: { _id: 1 } });
        if (existing) {
            return res.status(409).json({ error: "This email is already registered. Please sign in." });
        }

        const nowIso = new Date().toISOString();
        const salt = randomBytes(16).toString("base64");
        const keyLen = 64;
        const hash = hashPassword(password, salt, keyLen);

        const userDoc = {
            email,
            name,
            createdAt: nowIso,
            lastLoginAt: nowIso,
            password: {
                algorithm: "scrypt",
                salt,
                hash,
                keyLen,
            },
        };

        await authUsersCollection.insertOne(userDoc);
        return res.json({ user: toSessionUser(userDoc) });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ error: "This email is already registered. Please sign in." });
        }
        return next(error);
    }
});

app.post("/auth/signin", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Please enter a valid email address." });
        }
        if (!password) {
            return res.status(400).json({ error: "Password is required." });
        }

        const userDoc = await authUsersCollection.findOne({ email });
        if (!userDoc?.password?.salt || !userDoc?.password?.hash) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        if (!safePasswordMatch(password, userDoc.password)) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const nowIso = new Date().toISOString();
        await authUsersCollection.updateOne(
            { _id: userDoc._id },
            { $set: { lastLoginAt: nowIso } }
        );

        return res.json({
            user: toSessionUser({
                ...userDoc,
                lastLoginAt: nowIso,
            }),
        });
    } catch (error) {
        return next(error);
    }
});

app.get("/memory/bootstrap", async (req, res, next) => {
    try {
        const { userId } = req.query;
        const semantic = await store.get(ns(userId, "semantic"), "latest");
        const episodic = await store.get(ns(userId, "episodic"), "latest");
        const procedural = await store.get(ns(userId, "procedural"), "latest");

        res.json({
            userId,
            memory: {
                semantic: semantic?.value ?? null,
                episodic: episodic?.value ?? null,
                procedural: procedural?.value ?? null,
            },
        });
    } catch (error) {
        next(error);
    }
});

app.post("/memory/update", async (req, res, next) => {
    try {
        const { userId, bucket, value } = req.body;
        // bucket: "semantic" | "episodic" | "procedural"
        await store.put(ns(userId, bucket), "latest", value);
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.post("/memory/semantic/add", async (req, res, next) => {
    try {
        const { userId, text, metadata = {} } = req.body;
        await addMemoryChunk({
            text,
            metadata: { userId, ...metadata },
        });
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.get("/memory/semantic/search", async (req, res, next) => {
    try {
        const { userId, query, k = 5 } = req.query;
        const results = await semanticSearch({
            query,
            k: Number(k),
            preFilter: { userId: { $eq: userId } },
        });

        res.json({
            results: results.map((doc) => ({
                text: doc.pageContent,
                metadata: doc.metadata,
            })),
        });
    } catch (error) {
        next(error);
    }
});

async function handleMemoryConsolidate(req, res, next) {
    try {
        const {
            userId,
            messages = [],
            videoTitles = [],
            sessionId = null,
            difficultWordIds = [],
        } = req.body || {};
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const compact = compactMessages(messages);
        const compactTitles = compactVideoTitles(videoTitles);
        const userMessageCount = compact.filter((m) => m.role === "user").length;
        debugLog("consolidate:start", {
            userId,
            sessionId,
            messageCount: compact.length,
            userMessageCount,
            videoTitleCount: compactTitles.length,
            difficultWordCount: Array.isArray(difficultWordIds) ? difficultWordIds.length : 0,
        });

        let semanticBase = (await store.get(ns(userId, "semantic"), "latest"))?.value || {};
        let episodicBase = (await store.get(ns(userId, "episodic"), "latest"))?.value || {};
        let proceduralBase = (await store.get(ns(userId, "procedural"), "latest"))?.value || {};

        if (userMessageCount < 3 && compactTitles.length === 0) {
            return res.json({
                ok: true,
                skipped: true,
                reason: "Not enough dialogue evidence",
                memory: {
                    semantic: semanticBase,
                    episodic: episodicBase,
                    procedural: proceduralBase,
                },
            });
        }

        const semanticInsights = await extractSemanticInsights({
            messages: compact,
            videoTitles: compactTitles,
        });
        const episodicInsights = await extractEpisodicInsights({
            messages: compact,
            videoTitles: compactTitles,
        });
        const proceduralInsights = await extractProceduralInsights({
            messages: compact,
            videoTitles: compactTitles,
        });
        debugLog("consolidate:extracted", {
            semantic: {
                topics: semanticInsights.topics.length,
                videoTopics: semanticInsights.videoTopics.length,
                stylePreferences: semanticInsights.stylePreferences.length,
            },
            episodic: {
                scenes: episodicInsights.scenes.length,
                mistakes: episodicInsights.mistakes.length,
                slangSuggestions: episodicInsights.slangSuggestions.length,
            },
            procedural: {
                rules: proceduralInsights.rules.length,
            },
        });

        const nowIso = new Date().toISOString();
        const applied = [];

        const reconcileBucket = async ({ bucket, incomingItems = [] }) => {
            if (!incomingItems.length) {
                debugLog("reconcile:skip-empty", { userId, sessionId, bucket });
                return [];
            }
            const candidateMap = {};
            const existingById = new Map();

            for (const item of incomingItems) {
                const candidates = await findMemoryCandidates({ userId, bucket, item, k: 5 });
                candidateMap[item.tempId] = candidates.map((doc) => ({
                    itemId: doc.itemId,
                    kind: doc.kind,
                    text: doc.text,
                    confidence: clamp01(doc.confidence, 0.55),
                    stability: clamp01(doc.stability, 0.5),
                    evidence: String(doc.evidence || "").trim() || "Recovered prior signal",
                    lastSeenAt: doc.lastSeenAt || doc.updatedAt,
                    mentions: Math.max(1, Number(doc.mentions || 1)),
                }));
                for (const doc of candidates) {
                    existingById.set(doc.itemId, doc);
                }
            }
            debugLog("reconcile:candidates", {
                userId,
                sessionId,
                bucket,
                incomingCount: incomingItems.length,
                candidateCounts: incomingItems.map((item) => ({
                    tempId: item.tempId,
                    kind: item.kind,
                    text: item.text,
                    candidates: (candidateMap[item.tempId] || []).length,
                })),
            });

            const decisions = await reconcileMemoryItems({
                incomingItems,
                candidateMap,
            });
            debugLog("reconcile:decisions", {
                userId,
                sessionId,
                bucket,
                decisionCount: decisions.length,
                decisions: decisions.map((decision) => ({
                    tempId: decision.tempId,
                    action: decision.action,
                    targetId: decision.targetId,
                    text: decision?.mergedItem?.text || "",
                })),
            });
            const incomingMap = new Map(incomingItems.map((item) => [item.tempId, item]));
            const bucketApplied = [];

            for (const decision of decisions) {
                const result = await applyMemoryDecision({
                    userId,
                    bucket,
                    sessionId,
                    decision,
                    incomingMap,
                    existingById,
                    nowIso,
                });
                if (result) bucketApplied.push(result);
            }
            debugLog("reconcile:applied", {
                userId,
                sessionId,
                bucket,
                appliedCount: bucketApplied.length,
                applied: bucketApplied,
            });

            return bucketApplied;
        };

        const incomingSemanticItems = [
            ...(semanticInsights.topics || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "semantic",
                ...normalizeSignalItem(item, "interest"),
            })),
            ...(semanticInsights.videoTopics || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "semantic",
                ...normalizeSignalItem(item, "video_topic"),
            })),
            ...(semanticInsights.stylePreferences || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "semantic",
                ...normalizeSignalItem(item, "style_preference"),
            })),
        ].filter((item) => item.text);

        const incomingEpisodicItems = [
            ...(episodicInsights.scenes || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "episodic",
                ...normalizeSignalItem(item, "scene_event"),
            })),
            ...(episodicInsights.mistakes || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "episodic",
                ...normalizeSignalItem(item, "speaking_mistake"),
            })),
            ...(episodicInsights.slangSuggestions || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "episodic",
                ...normalizeSignalItem(item, "slang_hint"),
            })),
        ].filter((item) => item.text);

        const incomingProceduralItems = [
            ...(proceduralInsights.rules || []).map((item) => ({
                tempId: uuidv4(),
                bucket: "procedural",
                ...normalizeSignalItem(item, "tutoring_rule"),
            })),
        ].filter((item) => item.text);

        applied.push(...await reconcileBucket({ bucket: "semantic", incomingItems: incomingSemanticItems }));
        applied.push(...await reconcileBucket({ bucket: "episodic", incomingItems: incomingEpisodicItems }));
        applied.push(...await reconcileBucket({ bucket: "procedural", incomingItems: incomingProceduralItems }));

        const [semanticActiveItems, episodicActiveItems, proceduralActiveItems] = await Promise.all([
            memoryItemsCollection.find({ userId, bucket: "semantic", status: "active" }).sort({ updatedAt: -1 }).toArray(),
            memoryItemsCollection.find({ userId, bucket: "episodic", status: "active" }).sort({ updatedAt: -1 }).toArray(),
            memoryItemsCollection.find({ userId, bucket: "procedural", status: "active" }).sort({ updatedAt: -1 }).toArray(),
        ]);

        semanticBase = buildCanonicalProfile({
            activeItems: semanticActiveItems,
            existingSemantic: semanticBase,
            summary: semanticInsights.summary,
            nowIso,
        });
        episodicBase = buildEpisodicMemory({
            activeItems: episodicActiveItems,
            existingEpisodic: episodicBase,
            summary: episodicInsights.summary,
            nowIso,
            difficultWordIds,
        });
        proceduralBase = buildProceduralMemory({
            activeItems: proceduralActiveItems,
            existingProcedural: proceduralBase,
            summary: proceduralInsights.summary,
            nowIso,
        });

        await Promise.all([
            store.put(ns(userId, "semantic"), "latest", semanticBase),
            store.put(ns(userId, "episodic"), "latest", episodicBase),
            store.put(ns(userId, "procedural"), "latest", proceduralBase),
        ]);

        await Promise.all([
            addMemoryChunk({
                text: `Core interests: ${semanticBase.interests.slice(0, 6).join(", ") || "none"}. Video themes: ${semanticBase.videoTopics.slice(0, 5).join(", ") || "none"}. Style preferences: ${semanticBase.preferences.slice(0, 6).join(", ") || "none"}. Summary: ${semanticInsights.summary}`,
                metadata: { userId, bucket: "semantic", kind: "profile_summary", status: "active", itemId: `profile-${userId}`, type: "semantic_profile", when: nowIso },
            }),
            addMemoryChunk({
                text: `Recent scenes: ${episodicBase.lastScenes.slice(0, 4).join(", ") || "none"}. Difficult words: ${episodicBase.difficultWords.slice(-6).join(", ") || "none"}. Mistakes: ${episodicBase.typicalMistakes.slice(0, 5).join(", ") || "none"}. Summary: ${episodicInsights.summary}`,
                metadata: { userId, bucket: "episodic", kind: "session_summary", status: "active", itemId: `episodic-${sessionId || nowIso}`, type: "episodic_summary", when: nowIso },
            }),
            addMemoryChunk({
                text: `Tutoring rules: ${proceduralBase.rules.slice(0, 6).join(", ") || "none"}. Summary: ${proceduralInsights.summary}`,
                metadata: { userId, bucket: "procedural", kind: "rule_summary", status: "active", itemId: `procedural-${userId}`, type: "procedural_summary", when: nowIso },
            }),
        ]);

        res.json({
            ok: true,
            skipped: false,
            extractedCount: incomingSemanticItems.length + incomingEpisodicItems.length + incomingProceduralItems.length,
            reconciledCount: applied.length,
            actions: applied,
            memory: {
                semantic: semanticBase,
                episodic: episodicBase,
                procedural: proceduralBase,
            },
        });
        debugLog("consolidate:done", {
            userId,
            sessionId,
            extractedCount: incomingSemanticItems.length + incomingEpisodicItems.length + incomingProceduralItems.length,
            reconciledCount: applied.length,
        });
    } catch (error) {
        next(error);
    }
}

app.post("/memory/consolidate", handleMemoryConsolidate);
app.post("/memory/semantic/consolidate", handleMemoryConsolidate);

app.use((err, _req, res, _next) => {
    console.error("[memoryServer] request failed:", err);
    res.status(500).json({
        error: err?.message || "memory server error",
    });
});

const PORT = Number(process.env.PORT || 3003);
app.listen(PORT, () => {
    console.log(
        `Memory server running on ${PORT} (db=${memoryDbName}, collection=${memoryCollection})`
    );
});
