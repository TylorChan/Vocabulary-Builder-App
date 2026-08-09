import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_MAX_TURN_CHARS } from "../orchestration/reviewGraph/reviewConstants.js";
import { matchReviewTurn } from "../orchestration/reviewGraph/reviewTurnMatcher.js";

const activeScene = {
    targetWordIds: ["single", "phrase"],
    targetWords: ["contender", "out of the blue"],
};

test("matches bounded exact phrases and simple single-word inflections", () => {
    const result = matchReviewTurn({
        transcript: "The contenders appeared out of the blue.",
        activeScene,
    });

    assert.deepEqual(result.matchedTargetIds, ["single", "phrase"]);
    assert.equal(result.truncated, false);
    assert.match(result.transcriptDigest, /^[a-f0-9]{64}$/);
});

test("does not count a target hidden inside another word", () => {
    const result = matchReviewTurn({
        transcript: "The uncontendered label is synthetic.",
        activeScene,
    });
    assert.deepEqual(result.matchedTargetIds, []);
});

test("bounds raw transcripts before deriving checkpoint-safe observations", () => {
    const result = matchReviewTurn({
        transcript: `contender ${"x".repeat(REVIEW_MAX_TURN_CHARS + 50)}`,
        activeScene,
    });
    assert.equal(result.characterCount, REVIEW_MAX_TURN_CHARS);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.matchedTargetIds, ["single"]);
    assert.equal("transcript" in result, false);
});
