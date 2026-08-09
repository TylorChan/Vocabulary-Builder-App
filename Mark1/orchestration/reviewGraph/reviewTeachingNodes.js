import {
    REVIEW_BEAT_STATUS,
    REVIEW_BEAT_TYPES,
    REVIEW_SUPPORT_LEVELS,
    REVIEW_TARGET_STATUS,
    REVIEW_TURN_OUTCOMES,
} from "./reviewConstants.js";
import { getActiveSceneFromState } from "./reviewState.js";
import {
    appendRecentTurnEvidence,
    createBeatProgress,
    getActiveBeatFromState,
    getNextPendingBeatId,
    getNextSupportLevel,
    normalizeBeatOverride,
    normalizeTurnEvidence,
} from "./reviewTeaching.js";

function acceptedOutcome(code, extra = {}) {
    return { applied: true, code, ...extra };
}

function compactError(error) {
    return String(error?.message || error || "Beat replanning failed")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
}

function outcomeTargetStatus({ beat, supportLevel }) {
    if (beat?.type === REVIEW_BEAT_TYPES.TRANSFER) return REVIEW_TARGET_STATUS.TRANSFERRED;
    return supportLevel && supportLevel !== REVIEW_SUPPORT_LEVELS.NONE
        ? REVIEW_TARGET_STATUS.USED_WITH_HINT
        : REVIEW_TARGET_STATUS.USED_UNPROMPTED;
}

function successfulTargetIds(evidence, fallbackIds = []) {
    const successful = (evidence?.targetEvidence || [])
        .filter((item) => item?.meaningFit && item?.contextFit && item?.matched)
        .map((item) => item.targetId);
    return [...new Set(successful.length ? successful : fallbackIds)];
}

export function createReviewTeachingNodes({
    replanBuilder = null,
    now = () => new Date(),
} = {}) {
    function classifyTurnEvidenceNode(state) {
        const activeBeat = getActiveBeatFromState(state);
        const payload = state.event?.payload || {};
        const evidence = normalizeTurnEvidence(payload.turnEvidence, {
            eventId: state.event?.eventId,
            turnId: payload.turnId || state.event?.eventId,
            activeBeat,
            matchedTargetIds: payload.matchedTargetIds,
            recordedAt: state.event?.occurredAt || now().toISOString(),
        });
        return {
            eventOutcome: acceptedOutcome("TURN_EVIDENCE_CLASSIFIED", {
                turnEvidence: evidence,
            }),
        };
    }

    function updateTeachingProgressNode(state) {
        const scene = getActiveSceneFromState(state);
        const beat = getActiveBeatFromState(state);
        const evidence = state.eventOutcome?.turnEvidence;
        if (!scene || !beat || !evidence) {
            return {
                eventOutcome: acceptedOutcome("TEACHING_STATE_UNAVAILABLE", {
                    controlChanged: false,
                    teachingRoute: "FINALIZE",
                }),
            };
        }

        if (evidence.turnId && (state.recentTurnEvidence || [])
            .some((item) => item?.turnId === evidence.turnId)) {
            return {
                eventOutcome: acceptedOutcome("DUPLICATE_TURN_EVIDENCE_IGNORED", {
                    controlChanged: false,
                    teachingRoute: "FINALIZE",
                    nextAction: state.lastEventResult?.nextAction || "ELICIT",
                    activeBeatId: beat.beatId,
                }),
            };
        }

        const currentBeatProgress = state.beatProgress?.[beat.beatId] || {};
        const supportLevel = currentBeatProgress.supportLevel || REVIEW_SUPPORT_LEVELS.NONE;
        const isAsrUncertain = evidence.outcome === REVIEW_TURN_OUTCOMES.ASR_UNCERTAIN;
        const nextTurns = Number(currentBeatProgress.turns || 0) + (isAsrUncertain ? 0 : 1);
        const maxTurns = Math.max(1, Number(beat?.limits?.maxTurns || 4));
        const nextSupportLevel = getNextSupportLevel(beat, supportLevel);
        const targetIds = successfulTargetIds(evidence, state.event?.payload?.matchedTargetIds || []);
        let teachingRoute = "FINALIZE";
        let code = "TURN_PARTIAL";
        let nextAction = "DEEPEN";
        let nextBeatStatus = REVIEW_BEAT_STATUS.ACTIVE;
        let resolvedSupportLevel = supportLevel;
        let repairAttempts = Number(currentBeatProgress.repairAttempts || 0);
        let replanAttempts = Number(currentBeatProgress.replanAttempts || 0);
        const requestReplanOrExhaust = () => {
            if (replanAttempts >= 1) {
                code = "BEAT_EXHAUSTED";
                nextAction = "ADVANCE_BEAT";
                nextBeatStatus = REVIEW_BEAT_STATUS.EXHAUSTED;
                teachingRoute = "ADVANCE_BEAT";
                return;
            }
            code = "SUPPORT_EXHAUSTED";
            nextAction = "REPLAN_BEAT";
            teachingRoute = "REPLAN_BEAT";
            replanAttempts += 1;
        };

        switch (evidence.outcome) {
            case REVIEW_TURN_OUTCOMES.ACHIEVED:
                code = "BEAT_ACHIEVED";
                nextAction = "ADVANCE_BEAT";
                nextBeatStatus = REVIEW_BEAT_STATUS.ACHIEVED;
                teachingRoute = "ADVANCE_BEAT";
                break;
            case REVIEW_TURN_OUTCOMES.MEANING_OK_TARGET_MISSING:
                if (nextSupportLevel && nextTurns < maxTurns) {
                    code = "SUPPORT_RAISED";
                    nextAction = "HINT";
                    resolvedSupportLevel = nextSupportLevel;
                    repairAttempts += 1;
                } else {
                    requestReplanOrExhaust();
                }
                break;
            case REVIEW_TURN_OUTCOMES.STUCK:
                if (nextSupportLevel && nextTurns < maxTurns) {
                    code = "SUPPORT_RAISED";
                    nextAction = "HINT";
                    resolvedSupportLevel = nextSupportLevel;
                    repairAttempts += 1;
                } else {
                    requestReplanOrExhaust();
                }
                break;
            case REVIEW_TURN_OUTCOMES.OFF_TOPIC:
                if (nextTurns >= maxTurns) {
                    requestReplanOrExhaust();
                } else {
                    code = "BEAT_REANCHOR";
                    nextAction = "REANCHOR";
                }
                break;
            case REVIEW_TURN_OUTCOMES.ASR_UNCERTAIN:
                code = "ASR_UNCERTAIN";
                nextAction = "CLARIFY_WITHOUT_PENALTY";
                break;
            case REVIEW_TURN_OUTCOMES.PARTIAL:
            default:
                if (nextTurns >= maxTurns) {
                    requestReplanOrExhaust();
                }
                break;
        }

        const beatProgress = {
            ...createBeatProgress(scene, state.beatProgress, state.activeBeatId),
            [beat.beatId]: {
                ...currentBeatProgress,
                status: nextBeatStatus,
                turns: nextTurns,
                supportLevel: resolvedSupportLevel,
                repairAttempts,
                replanAttempts,
                lastOutcome: evidence.outcome,
                lastEvidenceTurnId: evidence.turnId,
            },
        };
        const attemptedTargetIds = new Set(beat.targetIds);
        const successfulIds = new Set(targetIds);
        const targetProgress = Object.fromEntries(Object.entries(state.targetProgress || {}).map(([id, item]) => {
            if (!attemptedTargetIds.has(id) || isAsrUncertain) return [id, item];
            const usedSuccessfully = successfulIds.has(id);
            return [id, {
                ...item,
                status: usedSuccessfully
                    ? outcomeTargetStatus({ beat, supportLevel })
                    : (item?.status === REVIEW_TARGET_STATUS.UNSEEN ? REVIEW_TARGET_STATUS.ATTEMPTED : item?.status),
                mentions: Number(item?.mentions || 0) + (usedSuccessfully ? 1 : 0),
                attempts: Number(item?.attempts || 0) + 1,
                hintsUsed: Number(item?.hintsUsed || 0) + (
                    usedSuccessfully && supportLevel !== REVIEW_SUPPORT_LEVELS.NONE ? 1 : 0
                ),
                successfulUses: Number(item?.successfulUses || 0) + (usedSuccessfully ? 1 : 0),
                transferUses: Number(item?.transferUses || 0) + (
                    usedSuccessfully && beat.type === REVIEW_BEAT_TYPES.TRANSFER ? 1 : 0
                ),
                lastBeatId: beat.beatId,
                lastEvidenceTurnId: evidence.turnId,
            }];
        }));
        const noProgress = successfulIds.size === 0 && [
            REVIEW_TURN_OUTCOMES.STUCK,
            REVIEW_TURN_OUTCOMES.OFF_TOPIC,
            REVIEW_TURN_OUTCOMES.PARTIAL,
        ].includes(evidence.outcome);

        return {
            targetProgress,
            beatProgress,
            recentTurnEvidence: appendRecentTurnEvidence(state.recentTurnEvidence, evidence),
            activeBeatOverride: null,
            turnsInScene: Number(state.turnsInScene || 0) + 1,
            noProgressTurns: isAsrUncertain
                ? Number(state.noProgressTurns || 0)
                : (noProgress ? Number(state.noProgressTurns || 0) + 1 : 0),
            eventOutcome: acceptedOutcome(code, {
                controlChanged: true,
                teachingRoute,
                nextAction,
                turnEvidence: evidence,
                activeBeatId: beat.beatId,
            }),
        };
    }

    function advanceBeatNode(state) {
        const scene = getActiveSceneFromState(state);
        const nextBeatId = getNextPendingBeatId(scene, state.beatProgress, state.activeBeatId);
        const beatProgress = createBeatProgress(scene, state.beatProgress, nextBeatId);
        if (nextBeatId && beatProgress[nextBeatId]) {
            beatProgress[nextBeatId] = {
                ...beatProgress[nextBeatId],
                status: REVIEW_BEAT_STATUS.ACTIVE,
            };
        }
        return {
            activeBeatId: nextBeatId,
            beatProgress,
            activeBeatOverride: null,
            eventOutcome: acceptedOutcome(nextBeatId ? "BEAT_ADVANCED" : "SCENE_BEATS_COMPLETE", {
                controlChanged: true,
                nextAction: nextBeatId ? "ELICIT" : "REQUEST_COMPLETION_WHEN_NATURAL",
                activeBeatId: nextBeatId,
            }),
        };
    }

    async function maybeReplanBeatNode(state) {
        const beat = getActiveBeatFromState(state);
        const currentProgress = state.beatProgress?.[beat?.beatId] || null;
        const fallbackId = beat
            ? `REPLAN_BEAT:${state.reviewRunId}:${beat.beatId}:${currentProgress?.supportLevel}:${currentProgress?.lastEvidenceTurnId}`
            : null;
        if (beat && typeof replanBuilder === "function") {
            try {
                const result = await replanBuilder({
                    reviewRunId: state.reviewRunId,
                    activeScene: getActiveSceneFromState(state),
                    activeBeat: beat,
                    targetProgress: state.targetProgress,
                    beatProgress: currentProgress,
                    recentTurnEvidence: state.recentTurnEvidence,
                    planRevision: state.planRevision,
                    overrideId: fallbackId,
                });
                const override = normalizeBeatOverride(result, {
                    beat,
                    planRevision: state.planRevision,
                    fallbackId,
                });
                if (override) {
                    return {
                        activeBeatOverride: override,
                        planRevision: Number(state.planRevision || 0) + 1,
                        eventOutcome: acceptedOutcome("BEAT_REPLANNED", {
                            controlChanged: true,
                            teachingRoute: "FINALIZE",
                            nextAction: "FOLLOW_BEAT_OVERRIDE",
                            activeBeatId: beat.beatId,
                        }),
                    };
                }
            } catch (error) {
                return exhaustBeat(state, beat, `Replanner unavailable: ${compactError(error)}`);
            }
        }
        return exhaustBeat(state, beat, "No validated alternative teaching move was available.");
    }

    function exhaustBeat(state, beat, hint) {
        if (!beat) {
            return {
                eventOutcome: acceptedOutcome("BEAT_REPLAN_SKIPPED", {
                    controlChanged: false,
                    teachingRoute: "FINALIZE",
                }),
            };
        }
        return {
            beatProgress: {
                ...state.beatProgress,
                [beat.beatId]: {
                    ...state.beatProgress?.[beat.beatId],
                    status: REVIEW_BEAT_STATUS.EXHAUSTED,
                },
            },
            activeBeatOverride: null,
            eventOutcome: acceptedOutcome("BEAT_EXHAUSTED", {
                controlChanged: true,
                teachingRoute: "ADVANCE_BEAT",
                nextAction: "ADVANCE_BEAT",
                hint,
            }),
        };
    }

    return {
        classifyTurnEvidenceNode,
        updateTeachingProgressNode,
        advanceBeatNode,
        maybeReplanBeatNode,
    };
}

export function routeAfterTeachingUpdate(state) {
    return state?.eventOutcome?.teachingRoute || "FINALIZE";
}

export function routeAfterBeatReplan(state) {
    return state?.eventOutcome?.teachingRoute || "FINALIZE";
}
