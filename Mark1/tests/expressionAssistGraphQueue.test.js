import assert from "node:assert/strict";
import test from "node:test";
import { ExpressionAssistGraphEventQueue } from "../src/utils/expressionAssistGraphEventQueue.js";

test("serializes events and retries one revision conflict with the server packet", async () => {
    const calls = [];
    const packets = [];
    let firstAttempt = true;
    const queue = new ExpressionAssistGraphEventQueue({
        sendEvent: async (event) => {
            calls.push(event);
            if (firstAttempt) {
                firstAttempt = false;
                const error = new Error("stale revision");
                error.code = "REVISION_CONFLICT";
                error.controlPacket = {
                    assistRunId: "assist-1",
                    revision: 2,
                    controlRevision: 2,
                };
                throw error;
            }
            return {
                revision: 3,
                controlPacket: {
                    assistRunId: "assist-1",
                    revision: 3,
                    controlRevision: 3,
                },
            };
        },
        onPacket: (packet) => packets.push(packet),
    });
    await queue.setRun({
        assistRunId: "assist-1",
        revision: 1,
        controlPacket: { assistRunId: "assist-1", revision: 1, controlRevision: 1 },
    });

    await queue.enqueueTurn({ mode: "FREE_CHAT", turnId: "turn-1", transcript: "Hello" });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].expectedRevision, 1);
    assert.equal(calls[1].expectedRevision, 2);
    assert.equal(queue.revision, 3);
    assert.deepEqual(packets.map((packet) => packet.revision), [1, 2, 3]);
});

test("reports pending work while an authoritative turn is still running", async () => {
    let releaseEvent;
    const queue = new ExpressionAssistGraphEventQueue({
        sendEvent: () => new Promise((resolve) => {
            releaseEvent = () => resolve({
                revision: 2,
                controlPacket: {
                    assistRunId: "assist-1",
                    revision: 2,
                    controlRevision: 2,
                },
            });
        }),
        onPacket() {},
    });
    await queue.setRun({
        assistRunId: "assist-1",
        revision: 1,
        controlPacket: { assistRunId: "assist-1", revision: 1, controlRevision: 1 },
    });

    const pendingTurn = queue.enqueueTurn({
        mode: "FREE_CHAT",
        turnId: "turn-1",
        transcript: "I cannot find the right phrase.",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(queue.hasPendingEvents(), true);
    releaseEvent();
    await pendingTurn;
    assert.equal(queue.hasPendingEvents(), false);
});
