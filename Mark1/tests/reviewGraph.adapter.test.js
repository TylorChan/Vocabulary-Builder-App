import test from "node:test";
import assert from "node:assert/strict";
import {
    applyReviewPacketToRuntimeContext,
    buildLegacyReviewMirror,
    buildRatingScoreSummary,
    buildReviewControlBreadcrumbs,
    buildReviewSceneEvidence,
    unwrapGlobalReviewProgress,
} from "../src/utils/reviewGraphAdapter.js";

function packet(overrides = {}) {
    return {
        reviewRunId: "run-1",
        revision: 4,
        controlRevision: 3,
        mode: "REVIEW",
        phase: "IN_SCENE",
        currentSceneIndex: 1,
        activeScene: {
            sceneId: "scene-two",
            targetWordIds: ["word-two"],
            targetWords: ["dark horse"],
        },
        targetProgress: {
            "word-two": { id: "word-two", text: "dark horse", status: "unseen" },
        },
        ...overrides,
    };
}

test("unwraps schema-v2 global progress without treating its control packet as legacy authority", () => {
    const legacyMirror = { currentSceneIndex: 1, rolePlayPlan: { scenes: [] } };
    assert.deepEqual(unwrapGlobalReviewProgress({
        schemaVersion: 2,
        activeReviewRunId: "run-1",
        controlPacket: packet(),
        legacyMirror,
    }), {
        reviewRunId: "run-1",
        legacyProgress: legacyMirror,
    });
});

test("applies an authority packet to the UI mirror and records a per-session evidence boundary", () => {
    const context = { agentVoiceProfile: "shimmer" };
    const result = applyReviewPacketToRuntimeContext(context, packet(), {
        authority: true,
        sourceSessionId: "session-a",
        messageCount: 7,
    });

    assert.equal(result.applied, true);
    assert.equal(result.controlChanged, true);
    assert.equal(context.activeReviewRunId, "run-1");
    assert.equal(context.currentSceneStep, "IN_SCENE");
    assert.equal(context.activeSceneId, "scene-two");
    assert.deepEqual(context.reviewSceneEvidenceStarts["scene-two"], {
        sessionId: "session-a",
        messageIndex: 7,
    });
    assert.equal(buildLegacyReviewMirror(context).reviewControlPacket, undefined);
});

test("keeps shadow packets out of legacy workflow fields", () => {
    const context = { currentSceneIndex: 8, currentSceneStep: "RATE_SCENE" };
    applyReviewPacketToRuntimeContext(context, packet(), { authority: false });
    assert.equal(context.currentSceneIndex, 8);
    assert.equal(context.currentSceneStep, "RATE_SCENE");
    assert.equal(context.reviewShadowControlPacket.revision, 4);
});

test("accepts a fresh low revision when reset switches to a new review run", () => {
    const context = {
        rolePlayPlan: { scenes: [{ sceneId: "old-scene" }] },
        currentUserFocus: "old theme",
        reviewSceneEvidenceStarts: { "old-scene": { messageIndex: 2 } },
        reviewControlPacket: packet({
            reviewRunId: "old-run",
            revision: 16,
            controlRevision: 8,
        }),
    };
    const result = applyReviewPacketToRuntimeContext(context, packet({
        reviewRunId: "fresh-run",
        revision: 1,
        controlRevision: 1,
        mode: "MODE_SELECT",
        phase: "CHOOSE_MODE",
        currentSceneIndex: 0,
        activeScene: null,
        targetProgress: {},
    }), { authority: true });

    assert.equal(result.applied, true);
    assert.equal(result.controlChanged, true);
    assert.equal(context.activeReviewRunId, "fresh-run");
    assert.equal(context.rolePlayPlan, null);
    assert.equal(context.currentUserFocus, "");
    assert.deepEqual(context.reviewSceneEvidenceStarts, {});
});

test("announces a review reset when control switches to a fresh run", () => {
    const breadcrumbs = buildReviewControlBreadcrumbs({
        previousPacket: packet({ reviewRunId: "old-run", revision: 16 }),
        packet: packet({
            reviewRunId: "fresh-run",
            revision: 1,
            mode: "MODE_SELECT",
            phase: "CHOOSE_MODE",
            currentSceneIndex: 0,
            activeScene: null,
            targetProgress: {},
        }),
    });

    assert.deepEqual(breadcrumbs, [{
        title: "Wiping the slate",
        data: { kind: "REVIEW_RESET", icon: "RESTORE" },
    }]);
});

test("restores the legacy scene summary breadcrumbs for a new authoritative scene", () => {
    const breadcrumbs = buildReviewControlBreadcrumbs({
        previousPacket: packet({
            phase: "AWAIT_THEME",
            activeScene: null,
            currentSceneIndex: 0,
        }),
        packet: packet({
            currentSceneIndex: 1,
            sceneCount: 3,
            activeScene: {
                sceneId: "scene-two",
                title: "Dog Park Debate",
                targetWordIds: ["word-two"],
                targetWords: ["dark horse"],
            },
        }),
    });

    assert.deepEqual(breadcrumbs, [
        {
            title: "Working on dark horse",
            data: {
                kind: "NOW_REVIEWING",
                icon: "REVIEW",
                sceneId: "scene-two",
                words: ["dark horse"],
            },
        },
        {
            title: "Scene 2 / 3: Dog Park Debate",
            data: {
                kind: "REVIEW_SCENE",
                sceneId: "scene-two",
                sceneIndex: 1,
                sceneCount: 3,
            },
        },
    ]);
});

test("does not repeat scene breadcrumbs for target-progress revisions", () => {
    const current = packet({
        currentSceneIndex: 1,
        sceneCount: 3,
        activeScene: {
            sceneId: "scene-two",
            title: "Dog Park Debate",
            targetWordIds: ["word-two"],
            targetWords: ["dark horse"],
        },
    });
    const breadcrumbs = buildReviewControlBreadcrumbs({
        previousPacket: current,
        packet: { ...current, revision: current.revision + 1 },
        transcriptItems: [{
            type: "BREADCRUMB",
            title: "Scene 2 / 3: Dog Park Debate",
            data: { kind: "REVIEW_SCENE", sceneId: "scene-two" },
        }],
    });

    assert.deepEqual(breadcrumbs, []);
});

test("builds bounded scene evidence from the recorded completed-message boundary", () => {
    const transcriptItems = [
        { type: "MESSAGE", role: "assistant", title: "Old scene" },
        { type: "BREADCRUMB", title: "Scene changed" },
        { type: "MESSAGE", role: "user", title: "Doctor Doom is a dark horse." },
        { type: "MESSAGE", role: "assistant", title: "That fits naturally." },
    ];
    const evidence = buildReviewSceneEvidence({
        transcriptItems,
        sceneStart: { sessionId: "session-a", messageIndex: 1 },
        sourceSessionId: "session-a",
    });

    assert.doesNotMatch(evidence, /Old scene/);
    assert.match(evidence, /USER: Doctor Doom is a dark horse\./);
    assert.match(evidence, /TEACHER: That fits naturally\./);
    assert.deepEqual(buildRatingScoreSummary([{ rating: 2 }, { rating: 4 }]), {
        ratingCount: 2,
        minimum: 2,
        maximum: 4,
        average: 3,
    });
});
