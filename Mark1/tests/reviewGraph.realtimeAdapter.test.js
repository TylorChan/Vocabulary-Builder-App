import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_PHASES, REVIEW_TOOL_NAMES } from "../orchestration/reviewGraph/reviewConstants.js";
import { getAllowedReviewTools } from "../orchestration/reviewGraph/reviewControlPacket.js";
import { ReviewGraphEventQueue } from "../src/utils/reviewGraphEventQueue.js";
import { createReviewGraphTools } from "../src/utils/reviewTools.js";

function packet(revision, overrides = {}) {
    return {
        reviewRunId: "run-1",
        revision,
        controlRevision: revision,
        phase: "IN_SCENE",
        nextAction: "CONTINUE_SCENE",
        allowedTools: ["request_scene_completion"],
        ...overrides,
    };
}

test("ignores an older control packet after a newer revision was applied", async () => {
    const applied = [];
    const queue = new ReviewGraphEventQueue({
        sendEvent: async () => { throw new Error("not used"); },
        onPacket: async (value) => applied.push(value.revision),
    });
    await queue.setRun({ reviewRunId: "run-1", revision: 3, controlPacket: packet(3) });
    const accepted = await queue.applyResponse({ revision: 2, controlPacket: packet(2) });

    assert.equal(accepted, false);
    assert.equal(queue.revision, 3);
    assert.deepEqual(applied, [3]);
});

test("drains transcript observations before a scene-completion tool event", async () => {
    const order = [];
    const queue = new ReviewGraphEventQueue({
        sendEvent: async (event) => {
            order.push(`send:${event.type}:${event.expectedRevision}`);
            await new Promise((resolve) => setTimeout(resolve, event.type === "USER_TURN_COMPLETED" ? 15 : 0));
            const revision = event.expectedRevision + 1;
            return { applied: true, revision, controlPacket: packet(revision) };
        },
        onPacket: async (value) => order.push(`apply:${value.revision}`),
    });
    await queue.setRun({ reviewRunId: "run-1", revision: 1, controlPacket: packet(1) });
    const observation = queue.enqueueObservation("I used contender naturally.");
    const tools = createReviewGraphTools({
        dispatchEvent: (...args) => queue.enqueue(...args),
        activeSceneId: "scene-one",
    });
    const completion = tools.requestSceneCompletion.invoke(
        { context: {} },
        "{}",
    );
    await Promise.all([observation, completion]);

    assert.deepEqual(order.slice(1), [
        "send:USER_TURN_COMPLETED:1",
        "apply:2",
        "send:SCENE_COMPLETION_REQUESTED:2",
        "apply:3",
    ]);
});

test("forwards the speech-stop timestamp with a completed transcript observation", async () => {
    let sentEvent = null;
    const queue = new ReviewGraphEventQueue({
        sendEvent: async (event) => {
            sentEvent = event;
            const revision = event.expectedRevision + 1;
            return { applied: true, revision, controlPacket: packet(revision) };
        },
    });
    await queue.setRun({ reviewRunId: "run-1", revision: 1, controlPacket: packet(1) });
    const occurredAt = "2026-08-04T10:00:00.000Z";

    await queue.enqueueObservation("I used contender naturally.", { occurredAt });

    assert.equal(sentEvent.occurredAt, occurredAt);
});

test("binds scene identity outside model-generated tool arguments", async () => {
    const dispatched = [];
    const tools = createReviewGraphTools({
        activeSceneId: "scene-one",
        dispatchEvent: async (type, payload) => {
            dispatched.push({ type, payload });
            return {
                applied: true,
                revision: 2,
                controlPacket: packet(2, {
                    activeScene: { sceneId: "scene-two" },
                }),
            };
        },
    });

    await tools.requestSceneCompletion.invoke({ context: {} }, "{}");

    assert.deepEqual(dispatched, [{
        type: "SCENE_COMPLETION_REQUESTED",
        payload: { sceneId: "scene-one" },
    }]);
});

test("delegates an explicit scene-review reset without model arguments", async () => {
    let resetCalls = 0;
    const tools = createReviewGraphTools({
        dispatchEvent: async () => { throw new Error("not used"); },
        resetReview: async () => {
            resetCalls += 1;
            return {
                created: true,
                revision: 1,
                controlPacket: packet(1, {
                    reviewRunId: "fresh-run",
                    mode: "MODE_SELECT",
                    phase: "CHOOSE_MODE",
                    nextAction: "ASK_MODE",
                    activeScene: null,
                }),
            };
        },
    });

    const result = await tools.resetSceneReview.invoke({ context: {} }, "{}");

    assert.equal(resetCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.phase, "CHOOSE_MODE");
    assert.equal(result.nextAction, "ASK_MODE");
});

test("keeps explicit review reset available in every controller phase", () => {
    Object.values(REVIEW_PHASES).forEach((phase) => {
        assert.equal(
            getAllowedReviewTools({ phase }).includes(REVIEW_TOOL_NAMES.RESET),
            true,
            `reset tool missing in ${phase}`,
        );
    });
});

test("awaits packet application before a graph-backed tool returns", async () => {
    const order = [];
    const queue = new ReviewGraphEventQueue({
        sendEvent: async () => {
            order.push("server-response");
            return { applied: true, revision: 2, controlPacket: packet(2) };
        },
        onPacket: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push("agent-updated");
        },
    });
    await queue.setRun({ reviewRunId: "run-1", revision: 1, controlPacket: packet(1) });
    order.length = 0;
    const tools = createReviewGraphTools({ dispatchEvent: (...args) => queue.enqueue(...args) });
    await tools.pauseReviewMode.invoke({ context: {} }, "{}");
    order.push("tool-returned");

    assert.deepEqual(order, ["server-response", "agent-updated", "tool-returned"]);
});
