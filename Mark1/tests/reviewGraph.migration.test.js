import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_PHASES } from "../orchestration/reviewGraph/reviewConstants.js";
import {
    createTestService,
    startReview,
    TEST_PLAN,
    TEST_USER_ID,
} from "./reviewGraphTestUtils.js";

test("imports legacy progress only when creating a checkpoint and resumes it unchanged", async () => {
    const service = createTestService();
    const reviewRunId = "legacy-review-run";
    const legacyProgress = {
        rolePlayPlan: TEST_PLAN,
        currentSceneIndex: 1,
        currentUserFocus: "surprising stories",
        targetProgress: {
            "word-blue": {
                id: "word-blue",
                text: "out of the blue",
                status: "mentioned",
                mentions: 1,
                completionAttempts: 0,
            },
        },
        turnsInScene: 2,
        noProgressTurns: 1,
    };
    const created = await startReview(service, { reviewRunId, legacyProgress });

    assert.equal(created.created, true);
    assert.equal(created.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.equal(created.controlPacket.currentSceneIndex, 1);
    assert.equal(created.controlPacket.targetProgress["word-blue"].status, "mentioned");

    const resumed = await service.startRun({
        userId: TEST_USER_ID,
        reviewRunId,
        legacyProgress: {
            ...legacyProgress,
            currentSceneIndex: 0,
        },
    });
    assert.equal(resumed.created, false);
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.controlPacket.currentSceneIndex, 1);
});

test("restart creates a new review run without overwriting prior history", async () => {
    const service = createTestService();
    const original = await startReview(service, { reviewRunId: "original-review-run" });
    const restarted = await service.startRun({
        userId: TEST_USER_ID,
        reviewRunId: original.reviewRunId,
        restart: true,
    });

    assert.notEqual(restarted.reviewRunId, original.reviewRunId);
    const prior = await service.getRun({ reviewRunId: original.reviewRunId, userId: TEST_USER_ID });
    assert.equal(prior.revision, original.revision);
});
