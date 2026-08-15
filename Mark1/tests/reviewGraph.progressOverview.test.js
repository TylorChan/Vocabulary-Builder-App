import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewControlPacket } from "../orchestration/reviewGraph/reviewControlPacket.js";
import { makeTeachingBeat, TEST_PLAN } from "./reviewGraphTestUtils.js";

function buildState(overrides = {}) {
    return {
        mode: "REVIEW",
        phase: "IN_SCENE",
        currentSceneIndex: 1,
        rolePlayPlan: TEST_PLAN,
        dueWords: [
            { id: "word-contender", text: "contender", definition: "A person with a real chance to win." },
            { id: "word-blue", text: "out of the blue", definition: "Without warning." },
        ],
        activeBeatId: "blue-transfer",
        targetProgress: {
            "word-blue": { id: "word-blue", text: "out of the blue", status: "unseen" },
        },
        beatProgress: {
            "blue-transfer": { status: "ACTIVE", turns: 0, supportLevel: "NONE" },
        },
        effects: [],
        ...overrides,
    };
}

test("projects Scene and Expression status from authoritative Review Graph state", () => {
    const packet = buildReviewControlPacket(buildState());
    const [completedScene, activeScene] = packet.progressOverview.scenes;

    assert.equal(packet.progressOverview.sceneCount, 2);
    assert.equal(completedScene.status, "COMPLETED");
    assert.equal(completedScene.expressions[0].status, "COMPLETED");
    assert.equal(activeScene.status, "ACTIVE");
    assert.equal(activeScene.expressions[0].status, "ACTIVE");
    assert.equal(activeScene.expressions[0].definition, "Without warning.");
});

test("marks only active Teaching Beat targets active and settled targets completed", () => {
    const scene = {
        sceneId: "scene-pair",
        title: "Two-expression scene",
        abstract: "Explain an unexpected challenger and defend your opinion.",
        targetWordIds: ["word-contender", "word-blue"],
        targetWords: ["contender", "out of the blue"],
        teachingBeats: [
            makeTeachingBeat({
                beatId: "contender-elicit",
                targetId: "word-contender",
                expression: "contender",
            }),
            makeTeachingBeat({
                beatId: "blue-transfer",
                targetId: "word-blue",
                expression: "out of the blue",
            }),
        ],
    };
    const packet = buildReviewControlPacket(buildState({
        currentSceneIndex: 0,
        rolePlayPlan: { mode: "role-play", scenes: [scene] },
        activeBeatId: "blue-transfer",
        targetProgress: {
            "word-contender": { status: "used_unprompted" },
            "word-blue": { status: "attempted" },
        },
        beatProgress: {
            "contender-elicit": { status: "ACHIEVED" },
            "blue-transfer": { status: "ACTIVE" },
        },
    }));
    const [contender, blue] = packet.progressOverview.scenes[0].expressions;

    assert.equal(contender.status, "COMPLETED");
    assert.equal(blue.status, "ACTIVE");
});

test("uses a legacy Scene goal when abstract is unavailable", () => {
    const packet = buildReviewControlPacket(buildState());
    assert.equal(packet.progressOverview.scenes[1].abstract, TEST_PLAN.scenes[1].goal);
});

test("marks all Scenes and Expressions completed when the Review Graph is done", () => {
    const packet = buildReviewControlPacket(buildState({
        phase: "DONE",
        currentSceneIndex: TEST_PLAN.scenes.length,
        activeBeatId: null,
        targetProgress: {},
        beatProgress: {},
    }));

    assert.ok(packet.progressOverview.scenes.every((scene) => scene.status === "COMPLETED"));
    assert.ok(packet.progressOverview.scenes
        .flatMap((scene) => scene.expressions)
        .every((expression) => expression.status === "COMPLETED"));
});
