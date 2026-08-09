import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { MemorySaver } from "@langchain/langgraph";
import { ReviewGraphService } from "../orchestration/reviewGraph/reviewGraphService.js";
import { REVIEW_EVENT_TYPES, REVIEW_MODES } from "../orchestration/reviewGraph/reviewConstants.js";
import { createReviewGraphRouter } from "../routes/reviewGraphRoutes.js";

async function withServer(runtime, callback) {
    const app = express();
    app.use(express.json());
    app.use("/api/review-runs", createReviewGraphRouter({ runtime }));
    const server = await new Promise((resolve) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = server.address();
    try {
        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function makeRuntime(mode = "authority") {
    const service = new ReviewGraphService({
        checkpointer: new MemorySaver(),
        retryDelayMs: 0,
        planBuilder: async () => ({
            scenes: [{
                sceneId: "api-scene",
                title: "API scene",
                goal: "Use contender.",
                targetWordIds: ["word-1"],
                targetWords: ["contender"],
            }],
        }),
    });
    return { mode, getService: async () => service };
}

test("starts and mutates a review run through the public HTTP contract", async () => {
    await withServer(makeRuntime(), async (baseUrl) => {
        const startedResponse = await fetch(`${baseUrl}/api/review-runs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "api-user@example.com",
                sessionId: "session-api",
                dueWords: [{ id: "word-1", text: "contender" }],
            }),
        });
        assert.equal(startedResponse.status, 200);
        const started = await startedResponse.json();
        assert.equal(started.featureMode, "authority");
        assert.equal(started.revision, 1);

        const selectedResponse = await fetch(`${baseUrl}/api/review-runs/${started.reviewRunId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "api-user@example.com",
                sessionId: "session-api",
                eventId: "api-select-review",
                type: REVIEW_EVENT_TYPES.MODE_SELECTED,
                expectedRevision: started.revision,
                payload: { mode: REVIEW_MODES.REVIEW },
            }),
        });
        assert.equal(selectedResponse.status, 200);
        const selected = await selectedResponse.json();
        assert.equal(selected.revision, 2);

        const readResponse = await fetch(
            `${baseUrl}/api/review-runs/${started.reviewRunId}?userId=api-user%40example.com&sessionId=session-api`,
        );
        assert.equal(readResponse.status, 200);
        const read = await readResponse.json();
        assert.equal(read.revision, 2);
        assert.equal(read.controlPacket.reviewRunId, started.reviewRunId);
    });
});

test("rejects stale revisions and permits the same user to resume from another voice session", async () => {
    await withServer(makeRuntime(), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/review-runs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "api-user@example.com",
                sessionId: "session-api",
                dueWords: [{ id: "word-1", text: "contender" }],
            }),
        });
        const started = await response.json();
        const staleResponse = await fetch(`${baseUrl}/api/review-runs/${started.reviewRunId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "api-user@example.com",
                sessionId: "session-api",
                eventId: "stale-event",
                type: REVIEW_EVENT_TYPES.MODE_SELECTED,
                expectedRevision: 0,
                payload: { mode: REVIEW_MODES.REVIEW },
            }),
        });
        assert.equal(staleResponse.status, 409);
        assert.equal((await staleResponse.json()).code, "REVISION_CONFLICT");

        const resumedResponse = await fetch(
            `${baseUrl}/api/review-runs/${started.reviewRunId}?userId=api-user%40example.com&sessionId=wrong-session`,
        );
        assert.equal(resumedResponse.status, 200);
        assert.equal((await resumedResponse.json()).reviewRunId, started.reviewRunId);

        const wrongUserResponse = await fetch(
            `${baseUrl}/api/review-runs/${started.reviewRunId}?userId=other%40example.com&sessionId=another-session`,
        );
        assert.equal(wrongUserResponse.status, 403);
        assert.equal((await wrongUserResponse.json()).code, "RUN_FORBIDDEN");
    });
});
