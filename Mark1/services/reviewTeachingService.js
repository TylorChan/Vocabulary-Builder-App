import {
    OPENAI_REVIEW_BEAT_REPLANNER_MODEL,
    OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT,
    OPENAI_REVIEW_TURN_EVIDENCE_MODEL,
    OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT,
} from "../config/aiModels.js";
import { TURN_EVIDENCE_SCHEMA } from "./transcriptReviewContract.js";

const BEAT_OVERRIDE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        reasonCode: { type: "string" },
        targetIds: { type: "array", items: { type: "string" } },
        questionIntent: { type: "string" },
        communicativeGoal: { type: "string" },
        supportLevel: { type: "string", enum: ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"] },
        constraints: {
            type: "object",
            additionalProperties: false,
            properties: {
                endWithQuestion: { type: "boolean" },
                maxTeacherSentences: { type: "integer" },
                doNotRequireExactSentence: { type: "boolean" },
                doNotReopenCompletedTargets: { type: "boolean" },
            },
            required: [
                "endWithQuestion",
                "maxTeacherSentences",
                "doNotRequireExactSentence",
                "doNotReopenCompletedTargets",
            ],
        },
    },
    required: [
        "reasonCode",
        "targetIds",
        "questionIntent",
        "communicativeGoal",
        "supportLevel",
        "constraints",
    ],
};

function parseResponseJson(response, operation) {
    const rawText = response?.output_text ?? response?.output?.[0]?.content?.[0]?.text ?? "";
    if (!rawText) throw new Error(`${operation} returned an empty response`);
    try {
        return JSON.parse(rawText);
    } catch (error) {
        throw new Error(`${operation} returned invalid JSON: ${error.message}`);
    }
}

function boundedJson(value, maxChars = 8_000) {
    const text = JSON.stringify(value ?? null);
    return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function createReviewTeachingService({ openaiClient }) {
    if (!openaiClient?.responses?.create) {
        throw new Error("createReviewTeachingService requires an OpenAI client");
    }

    async function classifyTurnEvidence({
        transcript,
        activeScene,
        activeBeat,
        observation,
        targetProgress,
        beatProgress,
    }) {
        const response = await openaiClient.responses.create({
            model: OPENAI_REVIEW_TURN_EVIDENCE_MODEL,
            reasoning: { effort: OPENAI_REVIEW_TURN_EVIDENCE_REASONING_EFFORT },
            input: `You classify one completed learner turn in an English speaking-practice scene.

Decide only from the supplied transcript and teaching contract.
- ACHIEVED: the learner used the preferred Expression with the intended meaning and contextual fit. Exact sentence matching is never required.
- MEANING_OK_TARGET_MISSING: the learner communicated the intended meaning but did not use the target Expression.
- PARTIAL: the answer is relevant but incomplete or ambiguous.
- STUCK: the learner is clearly unable to express the requested idea after the available context.
- OFF_TOPIC: the answer does not address the current communicative need.
- ASR_UNCERTAIN: the transcript itself is too unreliable to judge.
- Never infer pronunciation quality from transcript spelling.
- Lexical matches are evidence, not automatic proof of contextual fit.
- Return evidence only for activeBeat.targetIds.

Active scene:
${boundedJson(activeScene, 4_000)}

Active teaching beat:
${boundedJson(activeBeat, 4_000)}

Current progress:
${boundedJson({ targetProgress, beatProgress }, 4_000)}

Deterministic lexical observation:
${boundedJson(observation, 2_000)}

Completed learner transcript:
${JSON.stringify(String(transcript || "").slice(0, 4_000))}`,
            text: {
                format: {
                    type: "json_schema",
                    name: "review_turn_evidence",
                    schema: TURN_EVIDENCE_SCHEMA,
                    strict: true,
                },
            },
            max_output_tokens: 1_200,
            store: false,
        });
        return parseResponseJson(response, "Review turn evidence classifier");
    }

    async function replanTeachingBeat({
        activeScene,
        activeBeat,
        targetProgress,
        beatProgress,
        recentTurnEvidence,
        overrideId,
    }) {
        const response = await openaiClient.responses.create({
            model: OPENAI_REVIEW_BEAT_REPLANNER_MODEL,
            reasoning: { effort: OPENAI_REVIEW_BEAT_REPLANNER_REASONING_EFFORT },
            input: `You repair one exhausted Teaching Beat in an English speaking-practice workflow.

Generate one different, concise teaching move. Do not rewrite the Scene Plan.
- Preserve the active target and communicative meaning.
- Change the situation, comparison, or question angle enough to avoid repeating the failed loop.
- The Teacher should use at most two short sentences and end with one answerable question.
- Do not demand an exact sentence.
- Do not reopen completed targets.
- Do not judge pronunciation from transcript-only evidence.
- Return structured intent, not the final spoken line.

Active scene:
${boundedJson(activeScene, 4_000)}

Exhausted beat:
${boundedJson(activeBeat, 4_000)}

Progress and recent structured evidence:
${boundedJson({ targetProgress, beatProgress, recentTurnEvidence }, 6_000)}`,
            text: {
                format: {
                    type: "json_schema",
                    name: "review_beat_override",
                    schema: BEAT_OVERRIDE_SCHEMA,
                    strict: true,
                },
            },
            max_output_tokens: 1_200,
            store: false,
        });
        return {
            overrideId,
            ...parseResponseJson(response, "Review Teaching Beat replanner"),
            expiresAfterTurnId: null,
            overrideRevision: 1,
        };
    }

    return { classifyTurnEvidence, replanTeachingBeat };
}
