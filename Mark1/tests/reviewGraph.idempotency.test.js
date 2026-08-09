import test from "node:test";
import assert from "node:assert/strict";
import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import { ReviewGraphError } from "../orchestration/reviewGraph/reviewGraphService.js";
import {
    createTestService,
    makeEvent,
    startReview,
    TEST_USER_ID,
} from "./reviewGraphTestUtils.js";

async function completeFirstScene(service) {
    const started = await startReview(service);
    const selected = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, started.revision, { mode: REVIEW_MODES.REVIEW }),
    });
    const planned = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.THEME_SUBMITTED, selected.revision),
    });
    const observed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.USER_TURN_COMPLETED, planned.revision, {
            transcript: "The rookie is a real contender.",
        }),
    });
    const completionEvent = makeEvent(
        REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
        observed.revision,
        { sceneId: "scene-one" },
        "complete-scene-one",
    );
    const completed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...completionEvent,
    });
    return { started, completed, completionEvent };
}

test("replaying one event does not increment revision or duplicate the rating effect", async () => {
    const service = createTestService();
    const { started, completed, completionEvent } = await completeFirstScene(service);
    const replayed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...completionEvent,
    });

    assert.equal(replayed.applied, false);
    assert.equal(replayed.duplicate, true);
    assert.equal(replayed.revision, completed.revision);
    assert.equal(replayed.controlPacket.currentSceneIndex, 1);
    assert.equal(replayed.controlPacket.effects.length, 1);
});

test("rejects stale revisions and invalid phase transitions without changing state", async () => {
    const service = createTestService();
    const started = await startReview(service);

    await assert.rejects(
        service.dispatchEvent({
            reviewRunId: started.reviewRunId,
            userId: TEST_USER_ID,
            ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, 0, { mode: REVIEW_MODES.REVIEW }),
        }),
        (error) => error instanceof ReviewGraphError && error.code === "REVISION_CONFLICT",
    );
    await assert.rejects(
        service.dispatchEvent({
            reviewRunId: started.reviewRunId,
            userId: TEST_USER_ID,
            ...makeEvent(REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED, started.revision, {
                sceneId: "scene-one",
            }),
        }),
        (error) => error instanceof ReviewGraphError && error.code === "INVALID_TRANSITION",
    );

    const current = await service.getRun({ reviewRunId: started.reviewRunId, userId: TEST_USER_ID });
    assert.equal(current.revision, started.revision);
    assert.equal(current.controlPacket.currentSceneIndex, 0);
});

test("claims and acknowledges a persisted rating effect without touching scene progress", async () => {
    const service = createTestService();
    const { started, completed } = await completeFirstScene(service);
    const effectId = completed.controlPacket.effects[0].effectId;
    const claimed = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.RATING_CLAIMED, completed.revision, { effectId }),
    });
    assert.equal(claimed.controlPacket.effects.length, 0);
    const claimedState = await service.getState(started.reviewRunId);
    assert.equal(claimedState.effects[0].status, REVIEW_EFFECT_STATUS.IN_PROGRESS);
    assert.equal(claimedState.currentSceneIndex, 1);

    const acknowledged = await service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.RATING_COMPLETED, claimed.revision, {
            effectId,
            scoreSummary: { average: 3 },
        }),
    });
    const finalState = await service.getState(started.reviewRunId);
    assert.equal(acknowledged.controlPacket.effects.length, 0);
    assert.equal(finalState.effects[0].status, REVIEW_EFFECT_STATUS.COMPLETE);
    assert.equal(finalState.currentSceneIndex, 1);
});

test("serializes concurrent writes so only one caller can consume a revision", async () => {
    const service = createTestService();
    const started = await startReview(service);
    const first = service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, started.revision, { mode: REVIEW_MODES.REVIEW }),
    });
    const second = service.dispatchEvent({
        reviewRunId: started.reviewRunId,
        userId: TEST_USER_ID,
        ...makeEvent(REVIEW_EVENT_TYPES.MODE_SELECTED, started.revision, { mode: REVIEW_MODES.FREE_CHAT }),
    });
    const results = await Promise.allSettled([first, second]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "REVISION_CONFLICT");
});
