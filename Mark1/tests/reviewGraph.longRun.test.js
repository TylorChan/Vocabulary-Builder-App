import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph";
import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import { ReviewGraphService } from "../orchestration/reviewGraph/reviewGraphService.js";
import { makeTeachingBeat } from "./reviewGraphTestUtils.js";

const userId = "review-long-run@example.com";
const sceneCount = 25;
const dueWords = Array.from({ length: sceneCount }, (_, index) => ({
    id: `word-${index + 1}`,
    text: `target ${index + 1}`,
}));
const plan = {
    title: "Long-run review",
    scenes: dueWords.map((word, index) => ({
        sceneId: `scene-${index + 1}`,
        title: `Scene ${index + 1}`,
        goal: `Use ${word.text} naturally.`,
        targetWordIds: [word.id],
        targetWords: [word.text],
        teachingBeats: [makeTeachingBeat({
            beatId: `beat-${index + 1}`,
            targetId: word.id,
            expression: word.text,
        })],
    })),
};

function serviceFor(checkpointer) {
    return new ReviewGraphService({
        checkpointer,
        retryDelayMs: 0,
        planBuilder: async () => plan,
    });
}

async function dispatch(service, reviewRunId, revision, type, payload = {}, eventId = randomUUID(), sessionId = "session-a") {
    return service.dispatchEvent({
        reviewRunId,
        userId,
        sourceSessionId: sessionId,
        eventId,
        type,
        expectedRevision: revision,
        payload,
    });
}

test("replays more than 100 review events without skipped scenes or duplicate effects", async () => {
    const checkpointer = new MemorySaver();
    let service = serviceFor(checkpointer);
    const started = await service.startRun({
        userId,
        sourceSessionId: "session-a",
        dueWords,
    });
    const reviewRunId = started.reviewRunId;
    let response = await dispatch(
        service,
        reviewRunId,
        started.revision,
        REVIEW_EVENT_TYPES.MODE_SELECTED,
        { mode: REVIEW_MODES.REVIEW },
    );
    response = await dispatch(
        service,
        reviewRunId,
        response.revision,
        REVIEW_EVENT_TYPES.THEME_SUBMITTED,
        { userFocus: "long-run reliability" },
    );

    let requestCount = 3;
    for (let index = 0; index < sceneCount; index += 1) {
        const sceneId = `scene-${index + 1}`;
        const sessionId = index % 2 === 0 ? "session-a" : "session-b";

        if (index > 0 && index % 4 === 0) {
            service = serviceFor(checkpointer);
            const restored = await service.getRun({ reviewRunId, userId, sourceSessionId: sessionId });
            assert.equal(restored.revision, response.revision);
            assert.equal(restored.controlPacket.activeScene.sceneId, sceneId);
            assert.equal(restored.controlPacket.activeBeat.beatId, `beat-${index + 1}`);
        }

        if (index % 5 === 0) {
            response = await dispatch(
                service,
                reviewRunId,
                response.revision,
                REVIEW_EVENT_TYPES.PAUSE_REQUESTED,
                {},
                randomUUID(),
                sessionId,
            );
            response = await dispatch(
                service,
                reviewRunId,
                response.revision,
                REVIEW_EVENT_TYPES.RESUME_REQUESTED,
                {},
                randomUUID(),
                sessionId,
            );
            requestCount += 2;
        }

        response = await dispatch(
            service,
            reviewRunId,
            response.revision,
            REVIEW_EVENT_TYPES.USER_TURN_COMPLETED,
            { transcript: `I can use target ${index + 1} in this answer.` },
            randomUUID(),
            sessionId,
        );
        requestCount += 1;

        const completionEventId = randomUUID();
        const completionRevision = response.revision;
        response = await dispatch(
            service,
            reviewRunId,
            completionRevision,
            REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
            { sceneId },
            completionEventId,
            sessionId,
        );
        requestCount += 1;
        const effect = response.controlPacket.effects.find((item) => item.sceneId === sceneId);
        assert.ok(effect, `Missing rating effect for ${sceneId}`);

        const duplicate = await dispatch(
            service,
            reviewRunId,
            completionRevision,
            REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
            { sceneId },
            completionEventId,
            sessionId,
        );
        requestCount += 1;
        assert.equal(duplicate.duplicate, true);
        assert.equal(duplicate.revision, response.revision);

        response = await dispatch(
            service,
            reviewRunId,
            response.revision,
            REVIEW_EVENT_TYPES.RATING_CLAIMED,
            { effectId: effect.effectId },
            randomUUID(),
            sessionId,
        );
        requestCount += 1;

        if (index % 7 === 0) {
            response = await dispatch(
                service,
                reviewRunId,
                response.revision,
                REVIEW_EVENT_TYPES.RATING_FAILED,
                { effectId: effect.effectId, error: "transient test failure" },
                randomUUID(),
                sessionId,
            );
            response = await dispatch(
                service,
                reviewRunId,
                response.revision,
                REVIEW_EVENT_TYPES.RATING_CLAIMED,
                { effectId: effect.effectId },
                randomUUID(),
                sessionId,
            );
            requestCount += 2;
        }

        response = await dispatch(
            service,
            reviewRunId,
            response.revision,
            REVIEW_EVENT_TYPES.RATING_COMPLETED,
            { effectId: effect.effectId, scoreSummary: { ratingCount: 1 } },
            randomUUID(),
            sessionId,
        );
        requestCount += 1;
    }

    const finalState = await service.getState(reviewRunId);
    const effectIds = finalState.effects.map((effect) => effect.effectId);
    assert.ok(requestCount > 100);
    assert.equal(finalState.phase, REVIEW_PHASES.DONE);
    assert.equal(finalState.currentSceneIndex, sceneCount);
    assert.equal(finalState.effects.length, sceneCount);
    assert.equal(new Set(effectIds).size, sceneCount);
    assert.ok(finalState.effects.every((effect) => effect.status === REVIEW_EFFECT_STATUS.COMPLETE));
    assert.equal(response.controlPacket.completedTargetIds.length, sceneCount);
    assert.equal(finalState.processedEvents.length, 100);
});
