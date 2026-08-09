import assert from "node:assert/strict";
import test from "node:test";
import {
    RealtimeResponseArbiter,
    RealtimeTurnBuffer,
} from "../src/utils/realtimeTurnCoordinator.js";

test("turn buffer merges adjacent completed segments after the settle window", () => {
    const timers = [];
    const flushed = [];
    const buffer = new RealtimeTurnBuffer({
        settleMs: 1_000,
        onFlush: (turn) => flushed.push(turn),
        setTimer: (callback) => {
            timers.push(callback);
            return timers.length - 1;
        },
        clearTimer: () => {},
    });

    buffer.add({ itemId: "part-1", transcript: "I was trying to explain", occurredAt: "t1" });
    buffer.markSpeechStarted();
    buffer.markSpeechStopped();
    buffer.add({ itemId: "part-2", transcript: "but I could not find the phrase.", occurredAt: "t2" });
    timers.at(-1)();

    assert.deepEqual(flushed, [{
        itemId: "part-2",
        itemIds: ["part-1", "part-2"],
        transcript: "I was trying to explain but I could not find the phrase.",
        occurredAt: "t2",
        segmentCount: 2,
    }]);
});

test("turn buffer invokes browser host timers with the global receiver", () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const flushed = [];

    globalThis.setTimeout = function browserSetTimeout(callback) {
        assert.equal(this, globalThis);
        callback();
        return 1;
    };
    globalThis.clearTimeout = function browserClearTimeout() {
        assert.equal(this, globalThis);
    };

    try {
        const buffer = new RealtimeTurnBuffer({
            settleMs: 300,
            onFlush: (turn) => flushed.push(turn),
        });
        assert.equal(buffer.add({ itemId: "turn-1", transcript: "Hello there." }), true);
        assert.equal(flushed.length, 1);
        assert.equal(flushed[0].transcript, "Hello there.");
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    }
});

test("latest response wins and new speech interrupts buffered assistant audio", () => {
    const sent = [];
    let interrupts = 0;
    const arbiter = new RealtimeResponseArbiter({
        sendResponse: (request) => sent.push(request.turnId),
        interruptOutput: () => { interrupts += 1; },
    });

    arbiter.registerTurn("turn-1");
    assert.equal(arbiter.isCurrentTurn("turn-1"), true);
    assert.equal(arbiter.request({ turnId: "turn-1" }).dispatched, true);
    arbiter.markResponseCreated();
    arbiter.markAssistantSpeaking(true);
    arbiter.markResponseDone();

    assert.deepEqual(arbiter.beginUserSpeech(), { epoch: 1, interrupted: true });
    assert.equal(interrupts, 1);
    assert.equal(arbiter.isCurrentTurn("turn-1"), false);
    assert.equal(arbiter.request({ turnId: "turn-1" }).reason, "stale_turn");

    arbiter.registerTurn("turn-2");
    assert.equal(arbiter.isCurrentTurn("turn-2"), true);
    assert.equal(arbiter.request({ turnId: "turn-2" }).queued, true);
    arbiter.markAssistantSpeaking(false);
    assert.deepEqual(sent, ["turn-1"]);
    arbiter.endUserSpeech();
    assert.deepEqual(sent, ["turn-1", "turn-2"]);
});

test("queued response is replaced instead of reading every stale reply", () => {
    const sent = [];
    const arbiter = new RealtimeResponseArbiter({ sendResponse: (request) => sent.push(request.turnId) });
    arbiter.markAssistantSpeaking(true);
    arbiter.registerTurn("turn-1");
    arbiter.request({ turnId: "turn-1" });

    arbiter.beginUserSpeech();
    arbiter.registerTurn("turn-2");
    arbiter.request({ turnId: "turn-2" });
    arbiter.endUserSpeech();
    arbiter.markAssistantSpeaking(false);

    assert.deepEqual(sent, ["turn-2"]);
});
