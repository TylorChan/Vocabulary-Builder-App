import { scenePlanSchema } from "../memory/scenePlanSchema.js";
import {
    OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_MODEL,
    OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT,
} from "../config/aiModels.js";
import { projectExpressionContextForScene } from "../src/utils/expressionContext.js";
import { getSceneTeachingBeats } from "../orchestration/reviewGraph/reviewTeaching.js";
import {
    REVIEW_MAX_BEATS_PER_SCENE,
    REVIEW_SUPPORT_LEVELS,
} from "../orchestration/reviewGraph/reviewConstants.js";

export const MAX_GROUP_RETRIEVAL_QUERY_CHARS = 800;
export const MAX_GROUP_SOURCE_CONTEXT_CHARS = 260;
export const ROLEPLAY_GROUP_MEMORY_TOP_K = 3;
export const MAX_SCENE_ABSTRACT_WORDS = 24;
export const MAX_SCENE_ABSTRACT_CHARS = 150;

const RETRIEVAL_PLAN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        groups: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    groupId: { type: "string" },
                    theme: { type: "string" },
                    targetWordIds: { type: "array", items: { type: "string" } },
                    targetWords: { type: "array", items: { type: "string" } },
                    retrievalQuery: { type: "string" },
                },
                required: ["groupId", "theme", "targetWordIds", "targetWords", "retrievalQuery"],
            },
        },
    },
    required: ["groups"],
};

export class RolePlayPlanningError extends Error {
    constructor(message, { status = 500, code = "ROLEPLAY_PLANNING_FAILED", retryable = true } = {}) {
        super(message);
        this.name = "RolePlayPlanningError";
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}

function truncateText(value, maxChars) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function sanitizeSceneAbstract(value) {
    const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const wordLimited = words.length > MAX_SCENE_ABSTRACT_WORDS
        ? `${words.slice(0, MAX_SCENE_ABSTRACT_WORDS).join(" ")}…`
        : words.join(" ");
    return truncateText(wordLimited, MAX_SCENE_ABSTRACT_CHARS);
}

export function normalizeRolePlayDueWord(word) {
    let expressionContext = null;
    try {
        expressionContext = projectExpressionContextForScene(word?.learningContext);
    } catch {
        expressionContext = null;
    }

    return {
        id: String(word?.id || "").trim(),
        text: String(word?.text || "").trim(),
        definition: truncateText(word?.definition, 180),
        realLifeDef: truncateText(word?.realLifeDef, 180),
        surroundingText: truncateText(word?.surroundingText, MAX_GROUP_SOURCE_CONTEXT_CHARS),
        videoTitle: truncateText(word?.videoTitle, 120),
        expressionContext,
        learningState: word?.fsrsCard ? {
            state: truncateText(word.fsrsCard.state, 40),
            reps: Number.isFinite(Number(word.fsrsCard.reps)) ? Number(word.fsrsCard.reps) : 0,
            dueDate: truncateText(word.fsrsCard.dueDate, 60),
        } : null,
    };
}

export function normalizeRolePlayDueWords(dueWords) {
    if (!Array.isArray(dueWords) || dueWords.length === 0) {
        throw new RolePlayPlanningError("dueWords is required", {
            status: 400,
            code: "DUE_WORDS_REQUIRED",
            retryable: false,
        });
    }
    const normalized = dueWords
        .map(normalizeRolePlayDueWord)
        .filter((word) => word.id && word.text)
        .slice(0, 30);
    if (!normalized.length) {
        throw new RolePlayPlanningError("dueWords must include id and text", {
            status: 400,
            code: "INVALID_DUE_WORDS",
            retryable: false,
        });
    }
    return normalized;
}

export function buildGroupRetrievalQuery({ group, words, currentUserFocus }) {
    const sourceContext = truncateText(
        words.map((word) => [word.videoTitle, word.surroundingText].filter(Boolean).join(": ")).filter(Boolean).join(" | "),
        MAX_GROUP_SOURCE_CONTEXT_CHARS,
    );
    const query = [
        "Task: vocabulary_scene_review",
        `Target phrases: ${words.map((word) => word.text).filter(Boolean).join(", ")}`,
        `Meanings: ${words.map((word) => [word.text, word.definition || word.realLifeDef].filter(Boolean).join(" = ")).filter(Boolean).join("; ")}`,
        `Source context: ${sourceContext}`,
        `Expression learning context: ${truncateText(JSON.stringify(words.map((word) => ({ text: word.text, ...word.expressionContext })).filter((item) => item.senseDefinition)), 300)}`,
        `Current user focus: ${truncateText(currentUserFocus, 160)}`,
        `Scene/search intent: ${truncateText(group?.theme || "spoken English role-play practice", 100)}`,
        "Find: prior user attempts, past corrections, natural spoken examples, useful roleplay context.",
    ].filter((line) => !line.endsWith(": ")).join("\n");

    return truncateText(query, MAX_GROUP_RETRIEVAL_QUERY_CHARS);
}

export function sanitizeRetrievalGroups(groups, dueWords, currentUserFocus) {
    const wordsById = new Map(dueWords.map((word) => [word.id, word]));
    const usedIds = new Set();
    const sanitized = [];

    for (const [index, group] of (Array.isArray(groups) ? groups : []).entries()) {
        const targetWordIds = (Array.isArray(group?.targetWordIds) ? group.targetWordIds : [])
            .map((id) => String(id || "").trim())
            .filter((id) => wordsById.has(id) && !usedIds.has(id));
        if (!targetWordIds.length) continue;
        targetWordIds.forEach((id) => usedIds.add(id));
        const words = targetWordIds.map((id) => wordsById.get(id)).filter(Boolean);
        const compactGroup = {
            groupId: String(group?.groupId || `g${sanitized.length + 1}`).trim(),
            theme: truncateText(group?.theme, 80) || `Vocabulary group ${index + 1}`,
            targetWordIds,
            targetWords: words.map((word) => word.text),
        };
        compactGroup.retrievalQuery = buildGroupRetrievalQuery({
            group: { ...group, ...compactGroup },
            words,
            currentUserFocus,
        });
        sanitized.push(compactGroup);
    }

    for (const word of dueWords) {
        if (usedIds.has(word.id)) continue;
        const group = {
            groupId: `g${sanitized.length + 1}`,
            theme: truncateText(word.text, 80) || "Vocabulary review",
            targetWordIds: [word.id],
            targetWords: [word.text],
        };
        group.retrievalQuery = buildGroupRetrievalQuery({ group, words: [word], currentUserFocus });
        sanitized.push(group);
    }

    return sanitized;
}

export function validateScenePlanTeachingBeats(rolePlayPlan, dueWords) {
    const dueWordIds = new Set(dueWords.map((word) => word.id));
    const coveredIds = new Set();
    const errors = [];
    const scenes = Array.isArray(rolePlayPlan?.scenes) ? rolePlayPlan.scenes : [];
    const supportOrder = [
        REVIEW_SUPPORT_LEVELS.CONTEXT_CUE,
        REVIEW_SUPPORT_LEVELS.EXPRESSION_HINT,
        REVIEW_SUPPORT_LEVELS.SHORT_RECAST,
    ];

    if (!scenes.length) errors.push("plan has no scenes");

    for (const [sceneIndex, scene] of scenes.entries()) {
        const sceneAbstract = sanitizeSceneAbstract(scene?.abstract);
        if (!sceneAbstract) {
            errors.push(`scene ${sceneIndex + 1} has no abstract`);
        } else {
            scene.abstract = sceneAbstract;
        }
        const rawTargetIds = Array.isArray(scene?.targetWordIds) ? scene.targetWordIds : [];
        const sceneTargetIds = rawTargetIds.filter((id) => dueWordIds.has(id));
        rawTargetIds.filter((id) => !dueWordIds.has(id)).forEach((id) => {
            errors.push(`scene ${sceneIndex + 1} has unknown target ${id}`);
        });
        const rawBeats = Array.isArray(scene?.teachingBeats) ? scene.teachingBeats : [];
        if (rawBeats.length > REVIEW_MAX_BEATS_PER_SCENE) {
            errors.push(`scene ${sceneIndex + 1} exceeds ${REVIEW_MAX_BEATS_PER_SCENE} teaching beats`);
        }
        const rawBeatIds = rawBeats.map((beat) => String(beat?.beatId || "").trim()).filter(Boolean);
        if (new Set(rawBeatIds).size !== rawBeatIds.length) {
            errors.push(`scene ${sceneIndex + 1} has duplicate teaching beat IDs`);
        }
        const beats = getSceneTeachingBeats(scene);
        if (!beats.length) {
            errors.push(`scene ${sceneIndex + 1} has no valid teaching beats`);
            continue;
        }
        if (beats.length !== rawBeats.length) {
            errors.push(`scene ${sceneIndex + 1} contains an invalid teaching beat`);
        }
        rawBeats.forEach((beat, beatIndex) => {
            const label = `scene ${sceneIndex + 1} beat ${beatIndex + 1}`;
            const beatTargetIds = Array.isArray(beat?.targetIds) ? beat.targetIds : [];
            if (!beatTargetIds.length || beatTargetIds.some((id) => !rawTargetIds.includes(id))) {
                errors.push(`${label} must reference scene targets only`);
            }
            if (beat?.successCriteria?.exactSentenceRequired !== false) {
                errors.push(`${label} cannot require an exact sentence`);
            }
            if (beat?.successCriteria?.pronunciationCannotBeJudgedFromTranscriptOnly !== true) {
                errors.push(`${label} must prohibit transcript-only pronunciation judgments`);
            }
            const maxTurns = Number(beat?.limits?.maxTurns);
            const maxExplicitRetries = Number(beat?.limits?.maxExplicitRetries);
            if (!Number.isInteger(maxTurns) || maxTurns < 2 || maxTurns > 5) {
                errors.push(`${label} maxTurns must be between 2 and 5`);
            }
            if (!Number.isInteger(maxExplicitRetries) || maxExplicitRetries < 0 || maxExplicitRetries > 1) {
                errors.push(`${label} maxExplicitRetries must be 0 or 1`);
            }
            const supportLadder = Array.isArray(beat?.supportLadder) ? beat.supportLadder : [];
            const supportIndexes = supportLadder.map((level) => supportOrder.indexOf(level));
            const ordered = supportIndexes.every((index, position) => (
                index >= 0 && (position === 0 || index > supportIndexes[position - 1])
            ));
            if (!supportLadder.length || supportLadder.length > 3 || !ordered) {
                errors.push(`${label} supportLadder must be ordered and non-empty`);
            }
        });
        const sceneCoveredIds = new Set(beats.flatMap((beat) => beat.targetIds));
        sceneTargetIds.forEach((id) => {
            if (sceneCoveredIds.has(id)) coveredIds.add(id);
            else errors.push(`scene ${sceneIndex + 1} target ${id} has no teaching beat`);
        });
    }

    dueWordIds.forEach((id) => {
        if (!coveredIds.has(id)) errors.push(`due word ${id} is not covered by a teaching beat`);
    });
    if (errors.length) {
        throw new RolePlayPlanningError(`Scene Planner teaching-beat validation failed: ${errors.join("; ")}`, {
            code: "INVALID_TEACHING_BEATS",
            retryable: false,
        });
    }
    return rolePlayPlan;
}

function parseResponseJson(response, operation) {
    const rawText = response?.output_text ?? response?.output?.[0]?.content?.[0]?.text ?? "";
    if (!rawText) {
        throw new RolePlayPlanningError(`${operation} returned an empty response`, {
            code: "EMPTY_MODEL_RESPONSE",
        });
    }
    try {
        return JSON.parse(rawText);
    } catch (error) {
        throw new RolePlayPlanningError(`${operation} returned invalid JSON: ${error.message}`, {
            code: "INVALID_MODEL_JSON",
            retryable: false,
        });
    }
}

export function createRolePlayPlanningService({ openaiClient }) {
    if (!openaiClient?.responses?.create) {
        throw new Error("createRolePlayPlanningService requires an OpenAI client");
    }

    async function createRetrievalPlan({ dueWords, semantic = null, currentUserFocus = "" }) {
        const normalizedDueWords = normalizeRolePlayDueWords(dueWords);
        const prompt = `
You are a retrieval planner for an English speaking-practice RAG system.

Goal:
Create semantic word groups and one retrieval query per group. These queries will be embedded for vector search before scene planning.

Rules:
- Do not generate the final role-play scenes.
- Do not dump all user interests into the query.
- Preserve deterministic anchors from the input: word text, meaning, source context, video title, and current user focus.
- Add only useful abstraction and spoken-English expansion terms that help retrieve relevant user memory.
- Prefer 3-6 groups total. Use fewer groups if due words are semantically close.
- Each retrieval query should be compact and no more than ${MAX_GROUP_RETRIEVAL_QUERY_CHARS} characters.
- Exclude unrelated long-term interests unless directly connected to the group.

Due words:
${JSON.stringify(normalizedDueWords)}

semantic.profile for broad awareness only:
${JSON.stringify(semantic?.profile || null)}

Current user focus:
${JSON.stringify(String(currentUserFocus || "").trim())}

Return JSON only.
`;
        const response = await openaiClient.responses.create({
            model: OPENAI_ROLEPLAY_RETRIEVAL_PLANNER_MODEL,
            input: prompt,
            text: {
                format: {
                    type: "json_schema",
                    name: "roleplay_retrieval_plan",
                    schema: RETRIEVAL_PLAN_SCHEMA,
                    strict: true,
                },
            },
        });
        const payload = parseResponseJson(response, "Role-play retrieval planner");
        return {
            groups: sanitizeRetrievalGroups(payload.groups, normalizedDueWords, currentUserFocus),
            queryBudget: {
                maxChars: MAX_GROUP_RETRIEVAL_QUERY_CHARS,
                sourceContextMaxChars: MAX_GROUP_SOURCE_CONTEXT_CHARS,
            },
        };
    }

    async function createScenePlan({
        dueWords,
        memory = {},
        semanticHints = [],
        wordGroups = [],
        groupSemanticHints = [],
        currentUserFocus = "",
    }) {
        const normalizedDueWords = normalizeRolePlayDueWords(dueWords);
        const prompt = `
You are a scene planner for role-play English learning.
Goal: Generate multi-scene role-play that naturally covers the grouped due words, using retrieved memory as evidence and personalization.
Rules:
- Scenes must be logical and flow naturally.
- A scene can cover 1+ words (variable).
- If dueWords.length === 1, return exactly 1 scene.
- Use these context elements with weighted priority:
  1) currentUserFocus (highest weight)
  2) wordGroups and their deterministic word context (high weight)
  3) groupSemanticHints that match each group (high weight)
  4) due word meanings/source context (medium weight)
  5) semantic.profile as broad personalization only
  6) semanticHints as flattened group hints only, used as fallback detail-only context
- If signals conflict, follow the higher priority item.
- Do not invent scenes from unrelated profile interests.
- Each scene should cover one group or a coherent subset of a group.
- Use group-specific hints only when they improve scene realism, natural expressions, or known user weaknesses.
- If currentUserFocus is empty, rely on videoTitle + word context first.

For EACH scene, include:
- abstract: exactly 1 concise sentence combining the situation and learner's communicative goal; maximum 24 words and 150 characters; do not list target Expressions or expose teaching instructions
- setting: 1–2 sentences describing where/when
- background: 1–2 sentences on why this scene is happening (stakes/motivation) plus concrete context
- roles: 2 short labels (e.g., "Tutor: barista", "User: customer")
- goal: what the user must accomplish in this scene
- starterLine: teacher's first line to open the scene
- tone: "casual", "urgent", "formal", or "friendly"
- sensoryDetail: one vivid sensory detail
- suggestedSlang: 1–3 short slang/phrases that fit this scene (only if natural)
- teachingBeats: 1–2 compact teaching beats per primary Expression. Each beat is a teaching contract, not a fixed script.

Teaching Beat rules:
- Use types ELICIT, DEEPEN, REPAIR, TRANSFER, or WRAP.
- Normally cover 1–3 primary Expressions in one coherent scene.
- Every scene targetWordId must appear in at least one teachingBeat.targetIds entry.
- Give each beat a real communicative need: situation, reasonToSpeak, and userRole.
- teacherMove describes intent and response shape. Do not prewrite a full dialogue.
- The Teacher should normally react briefly and finish with one answerable question.
- successCriteria evaluates meaning and contextual fit. exactSentenceRequired must be false.
- pronunciationCannotBeJudgedFromTranscriptOnly must be true.
- supportLadder should use a useful subset of CONTEXT_CUE, EXPRESSION_HINT, SHORT_RECAST in that order.
- branchPolicy must use the schema's fixed routing values.
- Keep maxTurns between 2 and 5 and maxExplicitRetries between 0 and 1.

Return JSON only, matching schema.

Due words:
${normalizedDueWords.map((word) => `- ${word.text} (id:${word.id})
  videoTitle: ${word.videoTitle || ""}
  surroundingText: ${word.surroundingText || ""}
  videoMeaning: ${word.definition || ""}
  realLifeMeaning: ${word.realLifeDef || ""}
  expressionLearningContext: ${JSON.stringify(word.expressionContext || null)}
  learningState: ${JSON.stringify(word.learningState || null)}`).join("\n")}

User memory:
${JSON.stringify(memory)}

semantic.profile:
${JSON.stringify(memory?.semantic?.profile || null)}

wordGroups:
${JSON.stringify(wordGroups)}

groupSemanticHints:
${JSON.stringify(groupSemanticHints)}

Semantic hints:
${JSON.stringify(semanticHints)}

Current user focus (from this live conversation):
${JSON.stringify(String(currentUserFocus || "").trim())}

Return JSON now:
`;
        const response = await openaiClient.responses.create({
            model: OPENAI_ROLEPLAY_SCENE_PLAN_MODEL,
            reasoning: { effort: OPENAI_ROLEPLAY_SCENE_PLAN_REASONING_EFFORT },
            input: prompt,
            text: {
                format: {
                    type: "json_schema",
                    name: "roleplay_plan",
                    schema: scenePlanSchema,
                    strict: true,
                },
            },
        });
        const rolePlayPlan = parseResponseJson(response, "Role-play scene planner");
        return validateScenePlanTeachingBeats(rolePlayPlan, normalizedDueWords);
    }

    async function buildReviewPlan({ userId, dueWords, currentUserFocus = "", memoryService }) {
        if (!memoryService?.loadBootstrap || !memoryService?.searchSemantic) {
            throw new RolePlayPlanningError("Review memory service is unavailable", {
                code: "MEMORY_SERVICE_UNAVAILABLE",
            });
        }
        const bootstrap = await memoryService.loadBootstrap(userId);
        const semanticMemory = bootstrap?.memory?.semantic || null;
        const retrievalPlan = await createRetrievalPlan({
            dueWords,
            semantic: semanticMemory,
            currentUserFocus,
        });
        const wordGroups = retrievalPlan.groups;
        const groupSemanticHints = await Promise.all(wordGroups.map(async (group) => {
            const retrievalQuery = String(group?.retrievalQuery || "").trim();
            const response = retrievalQuery
                ? await memoryService.searchSemantic({
                    userId,
                    query: retrievalQuery,
                    k: ROLEPLAY_GROUP_MEMORY_TOP_K,
                })
                : { results: [] };
            return {
                groupId: group.groupId,
                targetWordIds: group.targetWordIds || [],
                targetWords: group.targetWords || [],
                retrievalQuery,
                hints: Array.isArray(response?.results) ? response.results : [],
            };
        }));
        const semanticHints = groupSemanticHints.flatMap((group) => group.hints.map((hint) => ({
            ...hint,
            groupId: group.groupId,
            targetWords: group.targetWords,
        })));
        const rolePlayPlan = await createScenePlan({
            dueWords,
            memory: { semantic: semanticMemory },
            semanticHints,
            wordGroups,
            groupSemanticHints,
            currentUserFocus,
        });
        return {
            rolePlayPlan,
            memoryPatch: {
                semantic: semanticMemory,
                semanticHints,
                wordGroups,
                groupSemanticHints,
            },
        };
    }

    return {
        createRetrievalPlan,
        createScenePlan,
        buildReviewPlan,
    };
}
