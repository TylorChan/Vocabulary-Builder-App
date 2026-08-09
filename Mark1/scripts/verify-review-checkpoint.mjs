import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_TURN_OUTCOMES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import { createReviewCheckpoint } from "../orchestration/reviewGraph/reviewCheckpoint.js";
import { ReviewGraphService } from "../orchestration/reviewGraph/reviewGraphService.js";

const uri = process.env.REVIEW_GRAPH_MONGODB_URI
    || process.env.MONGODB_ATLAS_URI
    || process.env.MONGO_URI;

if (!uri) {
    console.log("[review-checkpoint] skipped: no MongoDB URI configured");
    process.exit(0);
}

const reviewRunId = `contract-${randomUUID()}`;
const userId = "review-checkpoint-contract@mark2.local";
function makeBeat({ beatId, targetId, expression }) {
    return {
        beatId,
        type: "ELICIT",
        targetIds: [targetId],
        communicativeNeed: {
            situation: `Create a natural reason to use ${expression}.`,
            reasonToSpeak: "Convince a skeptical friend.",
            userRole: "Learner",
        },
        teacherMove: {
            intent: "Ask one open question.",
            responseShape: "One reaction followed by one question.",
            doNotRevealTarget: true,
        },
        successCriteria: {
            semanticGoal: `Use ${expression} with the intended meaning.`,
            preferredExpression: expression,
            meaningMustFit: true,
            contextMustFit: true,
            exactSentenceRequired: false,
            pronunciationCannotBeJudgedFromTranscriptOnly: true,
        },
        supportLadder: ["CONTEXT_CUE"],
        branchPolicy: {
            achieved: "ADVANCE_BEAT",
            meaningCorrectTargetMissing: "RAISE_SUPPORT",
            partial: "DEEPEN",
            stuck: "RAISE_SUPPORT_OR_REPLAN",
            offTopic: "REANCHOR",
            asrUncertain: "CLARIFY_WITHOUT_PENALTY",
        },
        limits: { maxTurns: 2, maxExplicitRetries: 1 },
    };
}

const planBuilder = async () => ({
    mode: "role-play",
    scenes: [{
        sceneId: "contract-scene-one",
        title: "Contract scene one",
        goal: "Use contender once.",
        targetWordIds: ["contract-word-one"],
        targetWords: ["contender"],
        teachingBeats: [makeBeat({
            beatId: "contract-beat-one",
            targetId: "contract-word-one",
            expression: "contender",
        })],
    }, {
        sceneId: "contract-scene-two",
        title: "Contract scene two",
        goal: "Use out of the blue once.",
        targetWordIds: ["contract-word-two"],
        targetWords: ["out of the blue"],
        teachingBeats: [makeBeat({
            beatId: "contract-beat-two",
            targetId: "contract-word-two",
            expression: "out of the blue",
        })],
    }],
});

const turnEvidenceBuilder = async ({ activeBeat, transcript }) => {
    const achieved = transcript.includes("contender");
    const meaningOnly = transcript.includes("meaning-only");
    return {
        outcome: achieved
            ? REVIEW_TURN_OUTCOMES.ACHIEVED
            : (meaningOnly ? REVIEW_TURN_OUTCOMES.MEANING_OK_TARGET_MISSING : REVIEW_TURN_OUTCOMES.STUCK),
        targetEvidence: activeBeat.targetIds.map((targetId) => ({
            targetId,
            meaningFit: achieved || meaningOnly,
            contextFit: true,
            usageMode: achieved ? "EXACT_LEXICAL" : "PARAPHRASED",
            matched: achieved,
        })),
        asrUncertain: false,
        confidence: 0.95,
    };
};

const replanBuilder = async ({ activeBeat, overrideId }) => ({
    overrideId,
    reasonCode: "SUPPORT_EXHAUSTED",
    targetIds: activeBeat.targetIds,
    questionIntent: "Ask about a different unexpected event.",
    communicativeGoal: "Create a fresh reason to describe surprise.",
    supportLevel: "CONTEXT_CUE",
    constraints: {
        endWithQuestion: true,
        maxTeacherSentences: 2,
        doNotRequireExactSentence: true,
        doNotReopenCompletedTargets: true,
    },
    overrideRevision: 1,
});

let firstCheckpoint;
let secondCheckpoint;

try {
    firstCheckpoint = await createReviewCheckpoint({ mode: "mongo" });
    const writer = new ReviewGraphService({
        checkpointer: firstCheckpoint.checkpointer,
        planBuilder,
        turnEvidenceBuilder,
        replanBuilder,
        retryDelayMs: 0,
    });
    const started = await writer.startRun({
        reviewRunId,
        userId,
        sourceSessionId: "contract-session",
        dueWords: [
            { id: "contract-word-one", text: "contender" },
            { id: "contract-word-two", text: "out of the blue" },
        ],
    });
    const selected = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.MODE_SELECTED,
        expectedRevision: started.revision,
        payload: { mode: REVIEW_MODES.REVIEW },
    });
    const planned = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.THEME_SUBMITTED,
        expectedRevision: selected.revision,
        payload: { userFocus: "Mongo contract" },
    });
    assert.equal(planned.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(planned.controlPacket.activeBeat.beatId, "contract-beat-one");
    const firstTurn = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.USER_TURN_COMPLETED,
        expectedRevision: planned.revision,
        payload: {
            transcript: "The rookie is a serious contender.",
            turnId: "contract-turn-one",
        },
    });
    const firstCompleted = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
        expectedRevision: firstTurn.revision,
        payload: { sceneId: "contract-scene-one" },
    });
    assert.equal(firstCompleted.controlPacket.activeScene.sceneId, "contract-scene-two");
    assert.equal(firstCompleted.controlPacket.effects[0].status, REVIEW_EFFECT_STATUS.PENDING);

    const meaningOnlyTranscript = "meaning-only checkpoint privacy marker";
    const meaningOnly = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.USER_TURN_COMPLETED,
        expectedRevision: firstCompleted.revision,
        payload: { transcript: meaningOnlyTranscript, turnId: "contract-turn-two" },
    });
    assert.equal(meaningOnly.controlPacket.activeBeatProgress.supportLevel, "CONTEXT_CUE");
    const stuckTranscript = "stuck checkpoint privacy marker";
    const replanned = await writer.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.USER_TURN_COMPLETED,
        expectedRevision: meaningOnly.revision,
        payload: { transcript: stuckTranscript, turnId: "contract-turn-three" },
    });
    assert.equal(replanned.controlPacket.nextAction, "FOLLOW_BEAT_OVERRIDE");
    const writtenRevision = replanned.revision;
    await firstCheckpoint.close();
    firstCheckpoint = null;

    secondCheckpoint = await createReviewCheckpoint({ mode: "mongo" });
    const reader = new ReviewGraphService({
        checkpointer: secondCheckpoint.checkpointer,
        planBuilder,
        retryDelayMs: 0,
    });
    const restored = await reader.getRun({ reviewRunId, userId });
    assert.equal(restored.revision, writtenRevision);
    assert.equal(restored.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(restored.controlPacket.activeScene.sceneId, "contract-scene-two");
    assert.equal(restored.controlPacket.activeBeat.beatId, "contract-beat-two");
    assert.equal(restored.controlPacket.activeBeatProgress.supportLevel, "CONTEXT_CUE");
    assert.match(restored.controlPacket.activeBeatOverride.overrideId, /^REPLAN_BEAT:/);
    assert.equal(restored.controlPacket.effects[0].sceneId, "contract-scene-one");

    const restoredState = await reader.getState(reviewRunId);
    assert.deepEqual(restoredState.recentTurnEvidence.map((item) => item.turnId), [
        "contract-turn-two",
        "contract-turn-three",
    ]);
    const decodedCheckpoint = JSON.stringify(restoredState);
    assert.doesNotMatch(decodedCheckpoint, new RegExp(meaningOnlyTranscript));
    assert.doesNotMatch(decodedCheckpoint, new RegExp(stuckTranscript));
    assert.doesNotMatch(decodedCheckpoint, /CURRENT REVIEW CONTROL/);
    console.log(JSON.stringify({
        ok: true,
        mode: secondCheckpoint.mode,
        restoredRevision: restored.revision,
        phase: restored.controlPacket.phase,
        activeSceneId: restored.controlPacket.activeScene.sceneId,
        activeBeatId: restored.controlPacket.activeBeat.beatId,
        supportLevel: restored.controlPacket.activeBeatProgress.supportLevel,
        recentEvidenceIds: restoredState.recentTurnEvidence.map((item) => item.turnId),
        pendingEffectCount: restored.controlPacket.effects.length,
        privacyChecked: true,
    }));
} finally {
    if (secondCheckpoint?.checkpointer) {
        await secondCheckpoint.checkpointer.deleteThread(reviewRunId).catch(() => undefined);
    }
    await firstCheckpoint?.close().catch(() => undefined);
    await secondCheckpoint?.close().catch(() => undefined);
}
