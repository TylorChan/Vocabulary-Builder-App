import test from "node:test";
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";
import {
    REVIEW_BEAT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_TURN_OUTCOMES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import {
    ReviewGraphError,
    ReviewGraphService,
} from "../orchestration/reviewGraph/reviewGraphService.js";
import {
    createTargetProgress,
    migrateReviewState,
} from "../orchestration/reviewGraph/reviewState.js";
import {
    createBeatProgress,
    normalizeTurnEvidence,
} from "../orchestration/reviewGraph/reviewTeaching.js";
import {
    validateScenePlanTeachingBeats,
} from "../services/rolePlayPlanningService.js";
import {
    createTestService,
    makeEvent,
    makeTeachingBeat,
    startReview,
    TEST_PLAN,
    TEST_USER_ID,
} from "./reviewGraphTestUtils.js";

async function enterReview(service, options = {}) {
    const started = await startReview(service, options);
    const selected = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, started.revision, {
            mode: REVIEW_MODES.REVIEW,
        }),
    });
    const planned = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.THEME_SUBMITTED, selected.revision, {
            userFocus: "a focused speaking review",
        }),
    });
    return { started, planned };
}

test("persists bounded Beat evidence without transcripts and ignores duplicate turn IDs", async () => {
    const service = createTestService();
    const { started, planned } = await enterReview(service);

    assert.equal(planned.controlPacket.activeBeat.beatId, "contender-elicit");
    assert.equal(planned.controlPacket.activeBeatProgress.status, REVIEW_BEAT_STATUS.ACTIVE);
    assert.equal(planned.controlPacket.nextAction, "ELICIT");

    const partialTranscript = "Doctor Doom could plausibly win, but I need a better word.";
    const partial = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: partialTranscript,
            turnId: "turn-partial",
        }),
    });
    assert.equal(partial.controlPacket.nextAction, "DEEPEN");
    assert.equal(partial.controlPacket.targetProgress["word-contender"].status, "attempted");
    assert.equal(partial.controlPacket.activeBeatProgress.turns, 1);
    assert.equal(partial.controlPacket.activeBeatProgress.lastOutcome, REVIEW_TURN_OUTCOMES.PARTIAL);

    const duplicateTurn = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, partial.revision, {
            transcript: "A second delivery of the same completed turn.",
            turnId: "turn-partial",
        }),
    });
    assert.equal(duplicateTurn.duplicate, true);
    assert.equal(duplicateTurn.duplicateTurnId, "turn-partial");
    assert.equal(duplicateTurn.revision, partial.revision);
    assert.equal(duplicateTurn.controlPacket.activeBeatProgress.turns, 1);
    assert.equal(duplicateTurn.controlPacket.targetProgress["word-contender"].attempts, 1);
    assert.equal(duplicateTurn.controlPacket.nextAction, "DEEPEN");

    const asr = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, duplicateTurn.revision, {
            transcript: "[inaudible]",
            turnId: "turn-asr",
        }),
    });
    assert.equal(asr.controlPacket.nextAction, "CLARIFY_WITHOUT_PENALTY");
    assert.equal(asr.controlPacket.activeBeatProgress.turns, 1);
    assert.equal(asr.controlPacket.targetProgress["word-contender"].attempts, 1);

    const achieved = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, asr.revision, {
            transcript: "Doctor Doom is a serious contender.",
            turnId: "turn-achieved",
        }),
    });
    assert.equal(achieved.controlPacket.targetProgress["word-contender"].status, "used_unprompted");
    assert.equal(achieved.controlPacket.activeBeat, null);
    assert.equal(achieved.controlPacket.nextAction, "REQUEST_COMPLETION_WHEN_NATURAL");

    const state = await service.getState(started.reviewRunId);
    const serialized = JSON.stringify(state);
    assert.doesNotMatch(serialized, new RegExp(partialTranscript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(serialized, /CURRENT REVIEW CONTROL/);
    assert.equal(state.recentTurnEvidence.length, 3);
    assert.deepEqual(state.recentTurnEvidence.map((item) => item.turnId), [
        "turn-partial",
        "turn-asr",
        "turn-achieved",
    ]);
});

test("replans only after support exhaustion and never loops on the same Beat", async () => {
    const plan = {
        mode: "role-play",
        scenes: [{
            sceneId: "scene-replan",
            title: "Replan scene",
            goal: "Use contender naturally.",
            targetWordIds: ["word-contender"],
            targetWords: ["contender"],
            teachingBeats: [makeTeachingBeat({
                beatId: "contender-replan",
                targetId: "word-contender",
                expression: "contender",
                supportLadder: ["CONTEXT_CUE"],
                maxTurns: 2,
            })],
        }],
    };
    let classifierCalls = 0;
    let replanCalls = 0;
    const service = new ReviewGraphService({
        checkpointer: new MemorySaver(),
        retryDelayMs: 0,
        planBuilder: async () => plan,
        turnEvidenceBuilder: async ({ activeBeat, transcript }) => {
            classifierCalls += 1;
            return {
                outcome: transcript.includes("meaning")
                    ? REVIEW_TURN_OUTCOMES.MEANING_OK_TARGET_MISSING
                    : REVIEW_TURN_OUTCOMES.STUCK,
                targetEvidence: activeBeat.targetIds.map((targetId) => ({
                    targetId,
                    meaningFit: transcript.includes("meaning"),
                    contextFit: true,
                    usageMode: "PARAPHRASED",
                    matched: false,
                })),
                asrUncertain: false,
                confidence: 0.9,
            };
        },
        replanBuilder: async ({ activeBeat, overrideId }) => {
            replanCalls += 1;
            return {
                overrideId,
                reasonCode: "SUPPORT_EXHAUSTED",
                targetIds: activeBeat.targetIds,
                questionIntent: "Ask for a comparison with a different plausible candidate.",
                communicativeGoal: "Create a fresh reason to describe a serious candidate.",
                supportLevel: "CONTEXT_CUE",
                constraints: {
                    endWithQuestion: true,
                    maxTeacherSentences: 2,
                    doNotRequireExactSentence: true,
                    doNotReopenCompletedTargets: true,
                },
                overrideRevision: 1,
            };
        },
    });
    const { started, planned } = await enterReview(service, {
        dueWords: [{ id: "word-contender", text: "contender" }],
    });

    const hinted = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: "I communicated the meaning without the expression.",
            turnId: "turn-hint",
        }),
    });
    assert.equal(hinted.controlPacket.nextAction, "HINT");
    assert.equal(hinted.controlPacket.activeBeatProgress.supportLevel, "CONTEXT_CUE");
    assert.equal(replanCalls, 0);

    const replanEvent = makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, hinted.revision, {
        transcript: "I am still stuck.",
        turnId: "turn-replan",
    }, "event-replan-once");
    const replanned = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...replanEvent,
    });
    assert.equal(replanned.result.code, "BEAT_REPLANNED");
    assert.equal(replanned.controlPacket.nextAction, "FOLLOW_BEAT_OVERRIDE");
    assert.equal(replanned.controlPacket.activeBeatProgress.replanAttempts, 1);
    assert.match(replanned.controlPacket.activeBeatOverride.overrideId, /^REPLAN_BEAT:/);
    assert.equal(replanCalls, 1);

    const replayed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...replanEvent,
    });
    assert.equal(replayed.duplicate, true);
    assert.equal(replanCalls, 1);

    const exhausted = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, replanned.revision, {
            transcript: "I am still stuck after the alternative.",
            turnId: "turn-exhausted",
        }),
    });
    assert.equal(exhausted.result.code, "SCENE_BEATS_COMPLETE");
    assert.equal(exhausted.controlPacket.activeBeat, null);
    assert.equal(exhausted.controlPacket.nextAction, "REQUEST_COMPLETION_WHEN_NATURAL");
    assert.equal(replanCalls, 1);
    assert.equal(classifierCalls, 3);

    const state = await service.getState(started.reviewRunId);
    assert.equal(state.beatProgress["contender-replan"].status, REVIEW_BEAT_STATUS.EXHAUSTED);
    assert.equal(state.activeBeatOverride, null);

    const completed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED, exhausted.revision, {
            sceneId: "scene-replan",
        }),
    });
    assert.equal(completed.controlPacket.phase, REVIEW_PHASES.DONE);
});

test("normalizes invalid state values and requires every Beat target for semantic achievement", () => {
    const scene = TEST_PLAN.scenes[0];
    const targetProgress = createTargetProgress(scene, {
        "word-contender": { status: "invented-status" },
    });
    const beatProgress = createBeatProgress(scene, {
        "contender-elicit": { status: "invented-status" },
    }, null);
    assert.equal(targetProgress["word-contender"].status, "unseen");
    assert.equal(beatProgress["contender-elicit"].status, REVIEW_BEAT_STATUS.PENDING);

    const multiTargetBeat = {
        ...makeTeachingBeat({ beatId: "multi", targetId: "one", expression: "one" }),
        targetIds: ["one", "two"],
    };
    const normalized = normalizeTurnEvidence({
        outcome: REVIEW_TURN_OUTCOMES.ACHIEVED,
        targetEvidence: [{
            targetId: "one",
            meaningFit: true,
            contextFit: true,
            usageMode: "EXACT_LEXICAL",
            matched: true,
        }],
        confidence: Number.NaN,
    }, { activeBeat: multiTargetBeat, turnId: "turn-multi" });
    assert.equal(normalized.outcome, REVIEW_TURN_OUTCOMES.PARTIAL);
    assert.equal(normalized.confidence, 0);

    const migrated = migrateReviewState({
        stateSchemaVersion: 1,
        flowVersion: 1,
        revision: 9,
        currentSceneIndex: 1,
        targetProgress: { one: { status: "invented-status" } },
        beatProgress: { multi: { status: "invented-status" } },
        recentTurnEvidence: [{ turnId: "old-turn", outcome: "invented-outcome" }],
        effects: [{ effectId: "keep-me" }],
    });
    assert.equal(migrated.stateSchemaVersion, 2);
    assert.equal(migrated.revision, 9);
    assert.equal(migrated.currentSceneIndex, 1);
    assert.equal(migrated.targetProgress.one.status, "unseen");
    assert.equal(migrated.beatProgress.multi.status, REVIEW_BEAT_STATUS.PENDING);
    assert.equal(migrated.recentTurnEvidence[0].outcome, REVIEW_TURN_OUTCOMES.PARTIAL);
    assert.equal(migrated.effects[0].effectId, "keep-me");
});

test("rejects impossible Teaching Beat contracts before graph execution", () => {
    const invalidPlan = structuredClone(TEST_PLAN);
    invalidPlan.scenes[0].teachingBeats[0].successCriteria.exactSentenceRequired = true;
    invalidPlan.scenes[0].teachingBeats[0].limits.maxTurns = 8;

    assert.throws(
        () => validateScenePlanTeachingBeats(invalidPlan, [
            { id: "word-contender", text: "contender" },
            { id: "word-blue", text: "out of the blue" },
        ]),
        (error) => error?.code === "INVALID_TEACHING_BEATS"
            && /exact sentence/.test(error.message)
            && /maxTurns/.test(error.message),
    );
});

test("keeps a V1 plan without Teaching Beats on the legacy matcher path", async () => {
    const legacyPlan = {
        scenes: [{
            sceneId: "legacy-scene",
            title: "Legacy scene",
            goal: "Use contender.",
            targetWordIds: ["legacy-word"],
            targetWords: ["contender"],
        }],
    };
    const service = createTestService({ planBuilder: async () => legacyPlan });
    const { started, planned } = await enterReview(service, {
        dueWords: [{ id: "legacy-word", text: "contender" }],
    });
    assert.equal(planned.controlPacket.activeBeat, null);

    const observed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: "She is a serious contender.",
            turnId: "legacy-turn",
        }),
    });
    assert.equal(observed.controlPacket.targetProgress["legacy-word"].status, "mentioned");

    const completed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED, observed.revision, {
            sceneId: "legacy-scene",
        }),
    });
    assert.equal(completed.controlPacket.phase, REVIEW_PHASES.DONE);
});

test("rejects a stale review turn before calling the optional semantic classifier", async () => {
    let classifierCalls = 0;
    const service = createTestService({
        turnEvidenceBuilder: async () => {
            classifierCalls += 1;
            throw new Error("A stale event must never reach this classifier");
        },
    });
    const { started, planned } = await enterReview(service);

    await assert.rejects(
        service.dispatchEvent({
            reviewRunId: started.reviewRunId,
            userId: TEST_USER_ID,
            ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision - 1, {
                transcript: "This stale event says contender.",
                turnId: "stale-turn",
            }),
        }),
        (error) => error instanceof ReviewGraphError && error.code === "REVISION_CONFLICT",
    );
    assert.equal(classifierCalls, 0);
});

test("re-anchors an off-topic turn without consuming support or calling the replanner", async () => {
    let replanCalls = 0;
    const service = createTestService({
        turnEvidenceBuilder: async ({ activeBeat }) => ({
            outcome: REVIEW_TURN_OUTCOMES.OFF_TOPIC,
            targetEvidence: activeBeat.targetIds.map((targetId) => ({
                targetId,
                meaningFit: false,
                contextFit: false,
                usageMode: "NOT_USED",
                matched: false,
            })),
            asrUncertain: false,
            confidence: 0.95,
        }),
        replanBuilder: async () => {
            replanCalls += 1;
            return null;
        },
    });
    const { started, planned } = await enterReview(service);
    const offTopic = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: "Let us discuss tomorrow's weather instead.",
            turnId: "off-topic-turn",
        }),
    });

    assert.equal(offTopic.controlPacket.nextAction, "REANCHOR");
    assert.equal(offTopic.controlPacket.activeBeatProgress.supportLevel, "NONE");
    assert.equal(offTopic.controlPacket.activeBeatProgress.turns, 1);
    assert.equal(replanCalls, 0);
});

test("does not reclassify duplicate turn IDs and falls back from malformed semantic evidence", async () => {
    let classifierCalls = 0;
    const service = createTestService({
        turnEvidenceBuilder: async () => {
            classifierCalls += 1;
            return {
                outcome: "NOT_A_REAL_OUTCOME",
                targetEvidence: [],
            };
        },
    });
    const { started, planned } = await enterReview(service);
    const observed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: "Doctor Doom is a serious contender.",
            turnId: "semantic-fallback-turn",
        }),
    });
    assert.equal(classifierCalls, 1);
    assert.equal(observed.controlPacket.targetProgress["word-contender"].status, "used_unprompted");

    const duplicateTurn = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, observed.revision, {
            transcript: "This duplicate should not reach the classifier.",
            turnId: "semantic-fallback-turn",
        }),
    });
    assert.equal(duplicateTurn.duplicate, true);
    assert.equal(duplicateTurn.duplicateTurnId, "semantic-fallback-turn");
    assert.equal(classifierCalls, 1);
});
