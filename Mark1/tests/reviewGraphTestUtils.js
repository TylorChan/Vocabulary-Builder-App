import { randomUUID } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph";
import { ReviewGraphService } from "../orchestration/reviewGraph/reviewGraphService.js";

export const TEST_USER_ID = "review-test@example.com";

export function makeTeachingBeat({
    beatId,
    targetId,
    expression,
    type = "ELICIT",
    supportLadder = ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"],
    maxTurns = 4,
} = {}) {
    return {
        beatId,
        type,
        targetIds: [targetId],
        communicativeNeed: {
            situation: `Create a natural reason to use ${expression}.`,
            reasonToSpeak: "Answer a skeptical conversation partner.",
            userRole: "Learner responding in the scene",
        },
        teacherMove: {
            intent: `Ask one open question that invites the meaning of ${expression}.`,
            responseShape: "One concise reaction followed by one question.",
            doNotRevealTarget: true,
        },
        successCriteria: {
            semanticGoal: `Use ${expression} with the intended meaning in context.`,
            preferredExpression: expression,
            meaningMustFit: true,
            contextMustFit: true,
            exactSentenceRequired: false,
            pronunciationCannotBeJudgedFromTranscriptOnly: true,
        },
        supportLadder,
        branchPolicy: {
            achieved: "ADVANCE_BEAT",
            meaningCorrectTargetMissing: "RAISE_SUPPORT",
            partial: "DEEPEN",
            stuck: "RAISE_SUPPORT_OR_REPLAN",
            offTopic: "REANCHOR",
            asrUncertain: "CLARIFY_WITHOUT_PENALTY",
        },
        limits: { maxTurns, maxExplicitRetries: 1 },
    };
}

export const TEST_PLAN = Object.freeze({
    title: "Two-scene review",
    scenes: [
        {
            sceneId: "scene-one",
            title: "Postgame debate",
            setting: "Two friends discuss the game after the final buzzer.",
            goal: "Use contender while comparing players.",
            starterLine: "Who is the strongest challenger next season?",
            targetWordIds: ["word-contender"],
            targetWords: ["contender"],
            teachingBeats: [makeTeachingBeat({
                beatId: "contender-elicit",
                targetId: "word-contender",
                expression: "contender",
            })],
        },
        {
            sceneId: "scene-two",
            title: "Unexpected news",
            setting: "A friend shares surprising news over coffee.",
            goal: "React naturally with out of the blue.",
            starterLine: "You will not believe what happened this morning.",
            targetWordIds: ["word-blue"],
            targetWords: ["out of the blue"],
            teachingBeats: [makeTeachingBeat({
                beatId: "blue-transfer",
                targetId: "word-blue",
                expression: "out of the blue",
                type: "TRANSFER",
            })],
        },
    ],
});

export function makeEvent(type, expectedRevision, payload = {}, eventId = randomUUID()) {
    return { type, expectedRevision, payload, eventId };
}

export function createTestService(overrides = {}) {
    return new ReviewGraphService({
        checkpointer: new MemorySaver(),
        retryDelayMs: 0,
        planBuilder: async () => TEST_PLAN,
        ...overrides,
    });
}

export async function startReview(service, {
    dueWords = [
        { id: "word-contender", text: "contender" },
        { id: "word-blue", text: "out of the blue" },
    ],
    legacyProgress = null,
    reviewRunId = null,
} = {}) {
    return service.startRun({
        userId: TEST_USER_ID,
        sourceSessionId: "voice-session-1",
        dueWords,
        legacyProgress,
        reviewRunId,
    });
}
