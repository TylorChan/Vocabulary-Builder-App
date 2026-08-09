export const REVIEW_TURN_OUTCOMES = [
    "ACHIEVED",
    "MEANING_OK_TARGET_MISSING",
    "PARTIAL",
    "STUCK",
    "OFF_TOPIC",
    "ASR_UNCERTAIN",
];

export const TURN_EVIDENCE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        outcome: {
            type: "string",
            enum: REVIEW_TURN_OUTCOMES,
        },
        targetEvidence: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    targetId: { type: "string" },
                    meaningFit: { type: "boolean" },
                    contextFit: { type: "boolean" },
                    usageMode: { type: "string" },
                    matched: { type: "boolean" },
                },
                required: ["targetId", "meaningFit", "contextFit", "usageMode", "matched"],
            },
        },
        asrUncertain: { type: "boolean" },
        confidence: { type: "number" },
    },
    required: ["outcome", "targetEvidence", "asrUncertain", "confidence"],
};

const MAX_CURRENT_TURN_CHARS = 4_000;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_RECENT_TURNS = 12;
const MAX_RECENT_TURN_CHARS = 2_000;

export class TranscriptReviewRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = "TranscriptReviewRequestError";
        this.status = 400;
    }
}

function cleanText(value, maxChars) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function normalizeCurrentTurn(value) {
    const source = typeof value === "string" ? { text: value } : value;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new TranscriptReviewRequestError("currentTurn must be a string or an object");
    }

    const text = cleanText(source.text, MAX_CURRENT_TURN_CHARS);
    if (!text) {
        throw new TranscriptReviewRequestError("currentTurn.text is required");
    }

    return {
        turnId: cleanText(source.turnId, 160) || null,
        role: "user",
        text,
    };
}

function normalizeRecentTurn(value, index) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TranscriptReviewRequestError(`conversationContext.recentTurns[${index}] must be an object`);
    }

    const role = value.role === "assistant" ? "assistant" : value.role === "user" ? "user" : "";
    const text = cleanText(value.text, MAX_RECENT_TURN_CHARS);
    if (!role || !text) {
        throw new TranscriptReviewRequestError(
            `conversationContext.recentTurns[${index}] requires role=user|assistant and non-empty text`,
        );
    }

    return {
        turnId: cleanText(value.turnId, 160) || null,
        role,
        text,
    };
}

function normalizeReviewContract(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TranscriptReviewRequestError("reviewContract is required");
    }

    const activeBeat = value.activeBeat;
    const targetIds = Array.isArray(activeBeat?.targetIds)
        ? activeBeat.targetIds.map((targetId) => cleanText(targetId, 160)).filter(Boolean)
        : [];

    if (!activeBeat || typeof activeBeat !== "object" || targetIds.length === 0) {
        throw new TranscriptReviewRequestError("reviewContract.activeBeat.targetIds must contain at least one target id");
    }

    return {
        activeScene: value.activeScene && typeof value.activeScene === "object" ? value.activeScene : null,
        activeBeat: {
            ...activeBeat,
            targetIds: [...new Set(targetIds)],
        },
        observation: value.observation && typeof value.observation === "object" ? value.observation : null,
        targetProgress: value.targetProgress && typeof value.targetProgress === "object" ? value.targetProgress : null,
        beatProgress: value.beatProgress && typeof value.beatProgress === "object" ? value.beatProgress : null,
    };
}

export function normalizeTranscriptReviewRequest(body = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new TranscriptReviewRequestError("Request body must be a JSON object");
    }

    const currentTurn = normalizeCurrentTurn(body.currentTurn);
    const context = body.conversationContext && typeof body.conversationContext === "object"
        ? body.conversationContext
        : {};
    const recentTurns = Array.isArray(context.recentTurns)
        ? context.recentTurns
            .map(normalizeRecentTurn)
            .filter((turn) => !currentTurn.turnId || turn.turnId !== currentTurn.turnId)
            .slice(-MAX_RECENT_TURNS)
        : [];

    return {
        currentTurn,
        conversationContext: {
            rollingSummary: cleanText(context.rollingSummary, MAX_SUMMARY_CHARS),
            summaryVersion: Number.isInteger(context.summaryVersion) ? context.summaryVersion : null,
            coversThroughTurnId: cleanText(context.coversThroughTurnId, 160) || null,
            recentTurns,
        },
        reviewContract: normalizeReviewContract(body.reviewContract),
    };
}

function boundedJson(value, maxChars) {
    const text = JSON.stringify(value ?? null);
    return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function buildTranscriptReviewPrompt(request) {
    const { currentTurn, conversationContext, reviewContract } = request;
    const recentTurns = conversationContext.recentTurns.map(({ role, text, turnId }) => ({
        turnId,
        role,
        text,
    }));

    return `You classify one completed learner turn in an English speaking-practice scene.

The rolling summary and recent turns are context only. Use them to resolve references, ellipsis, and conversational continuity.
Evaluate ONLY the CURRENT LEARNER TURN. Never credit a target expression that appears only in earlier turns or in the summary.

- ACHIEVED: the current learner turn uses the preferred Expression with the intended meaning and contextual fit. Exact sentence matching is never required.
- MEANING_OK_TARGET_MISSING: the current learner turn communicates the intended meaning but does not use the target Expression.
- PARTIAL: at least one substantive part of the current learner turn attempts the communicative goal, but the answer is incomplete, confused, internally contradictory, or mixed with irrelevant ideas. Prefer PARTIAL over OFF_TOPIC whenever such an attempt exists.
- STUCK: the learner is clearly unable to express the requested idea after the available context.
- OFF_TOPIC: no substantive part of the current learner turn attempts the current communicative goal. Do not choose OFF_TOPIC merely because the answer contains grammar errors, misunderstanding, or irrelevant material alongside a relevant attempt.
- ASR_UNCERTAIN: the current transcript itself is too unreliable to judge.
- Never infer pronunciation quality from transcript spelling.
- Lexical matches are evidence, not automatic proof of contextual fit.
- Return evidence only for activeBeat.targetIds.
- Return a JSON data instance with exactly these top-level keys: outcome, targetEvidence, asrUncertain, confidence.
- Do not return or repeat JSON Schema metadata such as type, properties, required, or additionalProperties.

Active scene:
${boundedJson(reviewContract.activeScene, 4_000)}

Active teaching beat:
${boundedJson(reviewContract.activeBeat, 4_000)}

Current progress:
${boundedJson({
        targetProgress: reviewContract.targetProgress,
        beatProgress: reviewContract.beatProgress,
    }, 4_000)}

Deterministic lexical observation for the current learner turn:
${boundedJson(reviewContract.observation, 2_000)}

Rolling conversation summary:
${JSON.stringify(conversationContext.rollingSummary || "")}

Recent verbatim turns before the current learner turn:
${boundedJson(recentTurns, 8_000)}

CURRENT LEARNER TURN:
${JSON.stringify(currentTurn.text)}`;
}

export function validateTranscriptReviewResult(result, activeTargetIds) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("Structured review output must be an object");
    }
    if (!REVIEW_TURN_OUTCOMES.includes(result.outcome)) {
        throw new Error(`Unsupported review outcome: ${String(result.outcome)}`);
    }
    if (!Array.isArray(result.targetEvidence)) {
        throw new Error("targetEvidence must be an array");
    }
    if (typeof result.asrUncertain !== "boolean") {
        throw new Error("asrUncertain must be a boolean");
    }
    if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
        throw new Error("confidence must be a number between 0 and 1");
    }

    const allowedTargetIds = new Set(activeTargetIds);
    const seenTargetIds = new Set();
    for (const [index, evidence] of result.targetEvidence.entries()) {
        if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
            throw new Error(`targetEvidence[${index}] must be an object`);
        }
        if (!allowedTargetIds.has(evidence.targetId)) {
            throw new Error(`targetEvidence[${index}].targetId is not active: ${String(evidence.targetId)}`);
        }
        if (seenTargetIds.has(evidence.targetId)) {
            throw new Error(`targetEvidence contains duplicate targetId: ${evidence.targetId}`);
        }
        seenTargetIds.add(evidence.targetId);

        for (const field of ["meaningFit", "contextFit", "matched"]) {
            if (typeof evidence[field] !== "boolean") {
                throw new Error(`targetEvidence[${index}].${field} must be a boolean`);
            }
        }
        if (typeof evidence.usageMode !== "string" || !evidence.usageMode.trim()) {
            throw new Error(`targetEvidence[${index}].usageMode must be a non-empty string`);
        }
    }

    return result;
}

export function getTranscriptReviewContextStats(request, prompt) {
    return {
        recentTurnCount: request.conversationContext.recentTurns.length,
        hasRollingSummary: Boolean(request.conversationContext.rollingSummary),
        inputChars: prompt.length,
    };
}
