import test from "node:test";
import assert from "node:assert/strict";
import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import {
    createTestService,
    makeEvent,
    startReview,
    TEST_USER_ID,
} from "./reviewGraphTestUtils.js";

async function enterFirstScene(service) {
    const started = await startReview(service);
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
            userFocus: "basketball and surprising news",
        }),
    });
    return { started, selected, planned };
}

test("plans review and activates scene zero through one accepted event", async () => {
    const service = createTestService();
    const { started, selected, planned } = await enterFirstScene(service);

    assert.equal(started.revision, 1);
    assert.equal(started.controlPacket.phase, REVIEW_PHASES.CHOOSE_MODE);
    assert.equal(selected.revision, 2);
    assert.equal(selected.controlPacket.phase, REVIEW_PHASES.AWAIT_THEME);
    assert.equal(planned.revision, 3);
    assert.equal(planned.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(planned.controlPacket.currentSceneIndex, 0);
    assert.equal(planned.controlPacket.activeScene.sceneId, "scene-one");
    assert.deepEqual(planned.controlPacket.remainingTargets.map((item) => item.id), ["word-contender"]);
});

test("rejects completion until teaching beats settle, then advances exactly once", async () => {
    const service = createTestService();
    const { planned } = await enterFirstScene(service);
    const rejected = await service.dispatchEvent({
        reviewRunId: planned.controlPacket.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED, planned.revision, {
            sceneId: "scene-one",
        }),
    });

    assert.equal(rejected.revision, 4);
    assert.equal(rejected.result.code, "COMPLETION_REJECTED");
    assert.equal(rejected.controlPacket.currentSceneIndex, 0);
    assert.equal(rejected.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(rejected.controlPacket.nextAction, "ELICIT");
    assert.match(rejected.controlPacket.promptCheckpoint, /Teaching beat: contender-elicit/i);
    assert.equal(rejected.controlPacket.targetProgress["word-contender"].status, "unseen");
    assert.equal(rejected.controlPacket.effects.length, 0);

    const observed = await service.dispatchEvent({
        reviewRunId: planned.controlPacket.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, rejected.revision, {
            transcript: "I think Doctor Doom is the strongest contender.",
        }),
    });
    assert.equal(observed.controlPacket.targetProgress["word-contender"].status, "used_unprompted");
    assert.equal(observed.controlPacket.teachingProgress.settledBeatCount, 1);
    assert.ok(observed.controlPacket.controlRevision > rejected.controlPacket.controlRevision);

    const completed = await service.dispatchEvent({
        reviewRunId: planned.controlPacket.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED, observed.revision, {
            sceneId: "scene-one",
        }),
    });
    assert.equal(completed.revision, 6);
    assert.equal(completed.controlPacket.currentSceneIndex, 1);
    assert.equal(completed.controlPacket.activeScene.sceneId, "scene-two");
    assert.deepEqual(completed.controlPacket.completedTargetIds, ["word-contender"]);
    assert.equal(completed.controlPacket.effects.length, 1);
    assert.equal(completed.controlPacket.effects[0].status, REVIEW_EFFECT_STATUS.PENDING);
});

test("pauses and resumes the same authoritative scene", async () => {
    const service = createTestService();
    const { planned } = await enterFirstScene(service);
    const paused = await service.dispatchEvent({
        reviewRunId: planned.controlPacket.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.PAUSE_REQUESTED, planned.revision),
    });
    assert.equal(paused.controlPacket.mode, REVIEW_MODES.FREE_CHAT);
    assert.equal(paused.controlPacket.phase, REVIEW_PHASES.PAUSED);
    assert.equal(paused.controlPacket.activeScene.sceneId, "scene-one");

    const resumed = await service.dispatchEvent({
        reviewRunId: planned.controlPacket.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.RESUME_REQUESTED, paused.revision),
    });
    assert.equal(resumed.controlPacket.mode, REVIEW_MODES.REVIEW);
    assert.equal(resumed.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(resumed.controlPacket.activeScene.sceneId, "scene-one");
});

test("moves planning failures to ERROR without inventing a fallback scene", async () => {
    const service = createTestService({
        planBuilder: async () => {
            const error = new Error("planner schema mismatch");
            error.retryable = false;
            throw error;
        },
    });
    const started = await startReview(service);
    const selected = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, started.revision, { mode: REVIEW_MODES.REVIEW }),
    });
    const failed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.THEME_SUBMITTED, selected.revision, { userFocus: "Marvel" }),
    });

    assert.equal(failed.result.code, "PLAN_FAILED");
    assert.equal(failed.controlPacket.phase, REVIEW_PHASES.ERROR);
    assert.equal(failed.controlPacket.activeScene, null);
    assert.match(failed.controlPacket.error.message, /schema mismatch/);
});
