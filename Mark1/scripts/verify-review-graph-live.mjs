import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createReviewCheckpoint } from "../orchestration/reviewGraph/reviewCheckpoint.js";
import {
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_TURN_OUTCOMES,
} from "../orchestration/reviewGraph/reviewConstants.js";
import { ReviewGraphService } from "../orchestration/reviewGraph/reviewGraphService.js";
import { getActiveBeatFromState } from "../orchestration/reviewGraph/reviewTeaching.js";
import { matchReviewTurn } from "../orchestration/reviewGraph/reviewTurnMatcher.js";
import { createRolePlayPlanningService } from "../services/rolePlayPlanningService.js";
import { createReviewMemoryService } from "../services/reviewMemoryService.js";
import { createReviewTeachingService } from "../services/reviewTeachingService.js";

if (!process.env.OPENAI_API_KEY) {
    console.log("[review-graph-live] skipped: OPENAI_API_KEY is not configured");
    process.exit(0);
}

const userId = process.env.REVIEW_GRAPH_LIVE_USER_ID || "review-graph-live@mark2.local";
const reviewRunId = `live-${randomUUID()}`;
const dueWords = [
    {
        id: "live-contender",
        text: "contender",
        definition: "A person with a serious chance of winning or succeeding.",
        realLifeDef: "Use it to identify a credible candidate or challenger.",
        surroundingText: "A discussion comparing possible major villains in a superhero story.",
        videoTitle: "Character debate",
        fsrsCard: { state: "LEARNING", reps: 1, dueDate: new Date().toISOString() },
    },
    {
        id: "live-dark-horse",
        text: "dark horse",
        definition: "A less expected person who may still succeed.",
        realLifeDef: "Use it for a surprising candidate whose chances are underestimated.",
        surroundingText: "Friends debate an unexpected candidate who could win.",
        videoTitle: "Character debate",
        fsrsCard: { state: "REVIEW", reps: 2, dueDate: new Date().toISOString() },
    },
];

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const planningService = createRolePlayPlanningService({ openaiClient });
const teachingService = createReviewTeachingService({ openaiClient });
const rawMemoryService = createReviewMemoryService({
    timeoutMs: Number(process.env.REVIEW_GRAPH_LIVE_MEMORY_TIMEOUT_MS || 20_000),
});
const retrievalStats = { bootstrapCalls: 0, semanticSearchCalls: 0, resultCount: 0 };
const memoryService = {
    async loadBootstrap(requestUserId) {
        retrievalStats.bootstrapCalls += 1;
        return rawMemoryService.loadBootstrap(requestUserId);
    },
    async searchSemantic(input) {
        retrievalStats.semanticSearchCalls += 1;
        const response = await rawMemoryService.searchSemantic(input);
        retrievalStats.resultCount += Array.isArray(response?.results) ? response.results.length : 0;
        return response;
    },
};

const checkpoint = await createReviewCheckpoint({ mode: "memory" });
const service = new ReviewGraphService({
    checkpointer: checkpoint.checkpointer,
    planBuilder: (input) => planningService.buildReviewPlan({ ...input, memoryService }),
});
const startedAt = Date.now();

try {
    const started = await service.startRun({
        reviewRunId,
        userId,
        sourceSessionId: "review-graph-live-session",
        dueWords,
    });
    const selected = await service.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.MODE_SELECTED,
        expectedRevision: started.revision,
        payload: { mode: REVIEW_MODES.REVIEW },
    });
    const planned = await service.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.THEME_SUBMITTED,
        expectedRevision: selected.revision,
        payload: { userFocus: "a casual debate about surprising fictional contenders" },
    });
    const state = await service.getState(reviewRunId);
    const plannedIds = new Set(
        (state?.rolePlayPlan?.scenes || []).flatMap((scene) => scene?.targetWordIds || [])
    );

    if (planned.controlPacket.phase === REVIEW_PHASES.ERROR) {
        console.error("[review-graph-live] planning failed", JSON.stringify({
            lastError: state?.lastError || null,
            retrievalStats,
            durationMs: Date.now() - startedAt,
        }, null, 2));
    }

    assert.equal(planned.controlPacket.phase, REVIEW_PHASES.IN_SCENE);
    assert.ok(retrievalStats.bootstrapCalls >= 1, "Memory bootstrap was not called");
    assert.ok(retrievalStats.semanticSearchCalls >= 1, "Semantic vector search was not called");
    dueWords.forEach((word) => {
        assert.ok(plannedIds.has(word.id), `Scene Planner omitted target ${word.id}`);
    });
    const activeBeat = planned.controlPacket.activeBeat;
    assert.ok(activeBeat?.beatId, "Scene Planner did not produce an active Teaching Beat");
    activeBeat.targetIds.forEach((targetId) => {
        assert.ok(plannedIds.has(targetId), `Teaching Beat references unknown target ${targetId}`);
    });
    const activeScene = state.rolePlayPlan.scenes[planned.controlPacket.currentSceneIndex];
    const targetTextById = new Map((activeScene.targetWordIds || [])
        .map((targetId, index) => [targetId, activeScene.targetWords?.[index]]));
    const spokenTargets = activeBeat.targetIds.map((targetId) => targetTextById.get(targetId)).filter(Boolean);
    assert.ok(spokenTargets.length > 0, "Active Teaching Beat has no resolvable target text");
    const activeBeatRaw = getActiveBeatFromState(state);
    const semanticTranscript = `I think ${spokenTargets.join(" and ")} fits this situation.`;
    const semanticEvidence = await teachingService.classifyTurnEvidence({
        transcript: semanticTranscript,
        activeScene,
        activeBeat: activeBeatRaw,
        observation: matchReviewTurn({ transcript: semanticTranscript, activeScene }),
        targetProgress: state.targetProgress,
        beatProgress: state.beatProgress[activeBeatRaw.beatId],
    });
    assert.ok(Object.values(REVIEW_TURN_OUTCOMES).includes(semanticEvidence.outcome));
    assert.ok(Array.isArray(semanticEvidence.targetEvidence));

    const liveOverrideId = `REPLAN_BEAT:${reviewRunId}:${activeBeatRaw.beatId}:live-verification`;
    const liveOverride = await teachingService.replanTeachingBeat({
        activeScene,
        activeBeat: activeBeatRaw,
        targetProgress: state.targetProgress,
        beatProgress: {
            ...state.beatProgress[activeBeatRaw.beatId],
            turns: activeBeatRaw.limits.maxTurns,
            supportLevel: activeBeatRaw.supportLadder.at(-1) || "NONE",
            lastOutcome: REVIEW_TURN_OUTCOMES.STUCK,
        },
        recentTurnEvidence: [{
            eventId: "live-evidence-event",
            turnId: "live-evidence-turn",
            outcome: REVIEW_TURN_OUTCOMES.STUCK,
            targetEvidence: [],
            asrUncertain: false,
            confidence: 0.9,
        }],
        overrideId: liveOverrideId,
    });
    assert.equal(liveOverride.overrideId, liveOverrideId);
    assert.ok(liveOverride.questionIntent);
    assert.ok(liveOverride.communicativeGoal);

    const observed = await service.dispatchEvent({
        reviewRunId,
        userId,
        eventId: randomUUID(),
        type: REVIEW_EVENT_TYPES.USER_TURN_COMPLETED,
        expectedRevision: planned.revision,
        payload: {
            transcript: `I can use ${spokenTargets.join(" and ")} naturally in this answer.`,
            turnId: "live-teaching-turn",
        },
    });
    const observedState = await service.getState(reviewRunId);
    assert.ok(observedState.recentTurnEvidence.some((item) => item.turnId === "live-teaching-turn"));
    assert.doesNotMatch(JSON.stringify(observedState), /I can use .* naturally in this answer/);

    console.log(JSON.stringify({
        ok: true,
        reviewRunId,
        phase: planned.controlPacket.phase,
        revision: observed.revision,
        sceneCount: state.rolePlayPlan.scenes.length,
        activeBeatId: activeBeat.beatId,
        semanticEvidenceOutcome: semanticEvidence.outcome,
        beatReplannerVerified: true,
        targetCoverage: `${plannedIds.size}/${dueWords.length}`,
        retrievalStats,
        durationMs: Date.now() - startedAt,
    }, null, 2));
} finally {
    await checkpoint.close();
}
