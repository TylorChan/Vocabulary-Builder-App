import assert from "node:assert/strict";
import test from "node:test";

import {buildRealtimeKeyboardTurn} from "../src/utils/realtimeKeyboardTurn.js";

test("builds one completed keyboard turn and one Realtime input_text item", () => {
    const turn = buildRealtimeKeyboardTurn({
        message: "  I want to practice out of the blue.  ",
        itemId: "keyboard-turn-1",
        eventId: "keyboard-event-1",
        occurredAt: "2026-08-11T12:00:00.000Z",
    });

    assert.deepEqual(turn.completedTurn, {
        itemId: "keyboard-turn-1",
        transcript: "I want to practice out of the blue.",
        occurredAt: "2026-08-11T12:00:00.000Z",
    });
    assert.deepEqual(turn.eventData, {
        event_id: "keyboard-event-1",
        item: {
            id: "keyboard-turn-1",
            type: "message",
            role: "user",
            content: [{
                type: "input_text",
                text: "I want to practice out of the blue.",
            }],
        },
    });
});

test("rejects incomplete keyboard turns before they reach the transport", () => {
    assert.throws(
        () => buildRealtimeKeyboardTurn({
            message: "   ",
            itemId: "keyboard-turn-2",
            eventId: "keyboard-event-2",
            occurredAt: "2026-08-11T12:00:00.000Z",
        }),
        /message is required/i,
    );
});
