import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EFFECT_TYPES,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_NO_PROGRESS_TURN_LIMIT,
    REVIEW_PHASES,
    REVIEW_PROCESSED_EVENT_LIMIT,
    REVIEW_RATING_LEASE_MS,
    REVIEW_RATING_MAX_ATTEMPTS,
    REVIEW_TARGET_STATUS,
} from "./reviewConstants.js";
import { validateReviewEvent } from "./reviewEvents.js";
import {
    activateSceneState,
    getActiveSceneFromState,
    getSceneId,
} from "./reviewState.js";
import {
    areSceneBeatsSettled,
    getActiveBeatFromState,
    getSceneTeachingBeats,
    isTargetSettled,
} from "./reviewTeaching.js";

function compactError(error) {
    return {
        code: String(error?.code || "PLANNING_FAILED").slice(0, 80),
        message: String(error?.message || error || "Planning failed").replace(/\s+/g, " ").trim().slice(0, 320),
        retryable: error?.retryable !== false,
    };
}

function acceptedOutcome(code, extra = {}) {
    return { applied: true, code, ...extra };
}

function shouldRetryPlanning(error) {
    if (error?.retryable === false) return false;
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
        return false;
    }
    return true;
}

async function wait(ms) {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildPlanWithRetry(planBuilder, input, { maxAttempts, retryDelayMs }) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await planBuilder(input);
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !shouldRetryPlanning(error)) break;
            const jitter = Math.round(Math.random() * Math.max(25, retryDelayMs / 2));
            await wait(retryDelayMs * attempt + jitter);
        }
    }
    throw lastError;
}

export function createReviewNodes({
    planBuilder,
    now = () => new Date(),
    maxPlanningAttempts = 2,
    retryDelayMs = 150,
} = {}) {
    const buildPlan = typeof planBuilder === "function"
        ? planBuilder
        : async () => {
            const error = new Error("Review planner is unavailable");
            error.retryable = false;
            throw error;
        };

    function validateEventNode(state) {
        return { eventValidation: validateReviewEvent(state, state?.event, { nowMs: now().getTime() }) };
    }

    function startRunNode() {
        return {
            eventOutcome: acceptedOutcome("RUN_STARTED"),
            lastError: null,
        };
    }

    function chooseModeNode(state) {
        const mode = state.event?.payload?.mode;
        if (mode === REVIEW_MODES.FREE_CHAT) {
            return {
                mode: REVIEW_MODES.FREE_CHAT,
                phase: REVIEW_PHASES.FREE_CHAT,
                eventOutcome: acceptedOutcome("FREE_CHAT_SELECTED"),
                lastError: null,
            };
        }

        if (Array.isArray(state?.rolePlayPlan?.scenes) && state.rolePlayPlan.scenes.length > 0) {
            return {
                ...activateSceneState(state),
                eventOutcome: acceptedOutcome("REVIEW_RESUMED"),
                lastError: null,
            };
        }

        return {
            mode: REVIEW_MODES.REVIEW,
            phase: REVIEW_PHASES.AWAIT_THEME,
            eventOutcome: acceptedOutcome("REVIEW_SELECTED_NEEDS_THEME"),
            lastError: null,
        };
    }

    function beginPlanningNode(state) {
        const userFocus = String(state.event?.payload?.userFocus || "").replace(/\s+/g, " ").trim().slice(0, 160);
        return {
            mode: REVIEW_MODES.REVIEW,
            phase: REVIEW_PHASES.PLANNING,
            currentUserFocus: userFocus,
            lastError: null,
            eventOutcome: acceptedOutcome("PLANNING_STARTED"),
        };
    }

    async function preparePlanNode(state) {
        try {
            const result = await buildPlanWithRetry(buildPlan, {
                reviewRunId: state.reviewRunId,
                userId: state.userId,
                sourceSessionId: state.sourceSessionId,
                dueWords: state.dueWords,
                currentUserFocus: state.currentUserFocus,
            }, {
                maxAttempts: maxPlanningAttempts,
                retryDelayMs,
            });
            const rolePlayPlan = result?.rolePlayPlan || result?.plan || result;
            if (!Array.isArray(rolePlayPlan?.scenes) || rolePlayPlan.scenes.length === 0) {
                const error = new Error("Scene Planner returned no scenes");
                error.retryable = false;
                throw error;
            }
            return {
                rolePlayPlan,
                planRevision: Number(state.planRevision || 0) + 1,
                currentSceneIndex: 0,
                activeSceneId: null,
                activeBeatId: null,
                targetProgress: {},
                beatProgress: {},
                recentTurnEvidence: [],
                activeBeatOverride: null,
                turnsInScene: 0,
                noProgressTurns: 0,
                eventOutcome: acceptedOutcome("PLAN_READY", {
                    sceneCount: rolePlayPlan.scenes.length,
                }),
                lastError: null,
            };
        } catch (error) {
            return {
                phase: REVIEW_PHASES.ERROR,
                eventOutcome: acceptedOutcome("PLAN_FAILED"),
                lastError: compactError(error),
            };
        }
    }

    function activateSceneNode(state) {
        const update = activateSceneState(state);
        const scene = getActiveSceneFromState({ ...state, ...update });
        return {
            ...update,
            eventOutcome: acceptedOutcome(scene ? "SCENE_ACTIVATED" : "REVIEW_DONE", {
                sceneId: scene ? getSceneId(scene, update.currentSceneIndex) : null,
            }),
        };
    }

    function recordUserTurnNode(state) {
        const matchedTargetIds = new Set(state.event?.payload?.matchedTargetIds || []);
        const nextProgress = Object.fromEntries(Object.entries(state.targetProgress || {}).map(([id, item]) => {
            if (!matchedTargetIds.has(id)) return [id, item];
            return [id, {
                ...item,
                status: REVIEW_TARGET_STATUS.MENTIONED,
                mentions: Number(item?.mentions || 0) + 1,
            }];
        }));
        const previousMentioned = Object.values(state.targetProgress || {})
            .filter((item) => item?.status === REVIEW_TARGET_STATUS.MENTIONED).length;
        const nextMentioned = Object.values(nextProgress)
            .filter((item) => item?.status === REVIEW_TARGET_STATUS.MENTIONED).length;
        const madeProgress = nextMentioned > previousMentioned;
        const noProgressTurns = madeProgress ? 0 : Number(state.noProgressTurns || 0) + 1;
        const shouldRefocus = noProgressTurns >= REVIEW_NO_PROGRESS_TURN_LIMIT;
        const remaining = Object.values(nextProgress).filter((item) => item?.status !== REVIEW_TARGET_STATUS.MENTIONED);

        return {
            targetProgress: nextProgress,
            turnsInScene: Number(state.turnsInScene || 0) + 1,
            noProgressTurns: shouldRefocus ? 0 : noProgressTurns,
            eventOutcome: acceptedOutcome(shouldRefocus ? "REFOCUS" : "TURN_RECORDED", {
                controlChanged: madeProgress || shouldRefocus,
                matchedTargetIds: [...matchedTargetIds],
                hint: shouldRefocus && remaining.length
                    ? `Create one natural opening for ${remaining[0].text}.`
                    : null,
            }),
        };
    }

    function completionGuardNode(state) {
        const scene = getActiveSceneFromState(state);
        const teachingBeats = getSceneTeachingBeats(scene);
        if (teachingBeats.length > 0) {
            if (areSceneBeatsSettled(scene, state.beatProgress)) {
                return {
                    eventOutcome: acceptedOutcome("COMPLETION_ACCEPTED", {
                        completionAccepted: true,
                    }),
                };
            }
            const activeBeat = getActiveBeatFromState(state);
            return {
                eventOutcome: acceptedOutcome("COMPLETION_REJECTED", {
                    completionAccepted: false,
                    controlChanged: true,
                    missingTargetIds: activeBeat?.targetIds || [],
                    hint: activeBeat?.teacherMove?.intent
                        || "Keep the current teaching beat going with one concise question.",
                }),
            };
        }

        const progressEntries = Object.entries(state.targetProgress || {});
        const missing = progressEntries.filter(([, item]) => !isTargetSettled(item));
        if (missing.length === 0) {
            return {
                eventOutcome: acceptedOutcome("COMPLETION_ACCEPTED", {
                    completionAccepted: true,
                }),
            };
        }

        const nextProgress = Object.fromEntries(progressEntries.map(([id, item]) => (
            isTargetSettled(item)
                ? [id, item]
                : [id, {
                    ...item,
                    status: REVIEW_TARGET_STATUS.COMPLETION_ATTEMPTED,
                    completionAttempts: Number(item?.completionAttempts || 0) + 1,
                }]
        )));
        return {
            targetProgress: nextProgress,
            eventOutcome: acceptedOutcome("COMPLETION_REJECTED", {
                completionAccepted: false,
                controlChanged: true,
                missingTargetIds: missing.map(([id]) => id),
                hint: `Keep this scene going and create one natural opening for ${missing[0][1]?.text}.`,
            }),
        };
    }

    function enqueueRatingNode(state) {
        const scene = getActiveSceneFromState(state);
        const sceneId = state.activeSceneId || getSceneId(scene, state.currentSceneIndex);
        const effectId = `${REVIEW_EFFECT_TYPES.RATE_SCENE}:${state.reviewRunId}:${sceneId}`;
        const existing = (state.effects || []).some((effect) => effect?.effectId === effectId);
        const effects = existing ? state.effects : [...(state.effects || []), {
            effectId,
            type: REVIEW_EFFECT_TYPES.RATE_SCENE,
            status: REVIEW_EFFECT_STATUS.PENDING,
            sceneId,
            sceneIndex: Number(state.currentSceneIndex || 0),
            attempts: 0,
            createdAt: now().toISOString(),
            leaseUntil: null,
            lastError: null,
        }];
        return {
            effects,
            eventOutcome: acceptedOutcome("RATING_QUEUED", { effectId }),
        };
    }

    function advanceSceneNode(state) {
        const scenes = Array.isArray(state?.rolePlayPlan?.scenes) ? state.rolePlayPlan.scenes : [];
        const nextIndex = Number(state.currentSceneIndex || 0) + 1;
        if (nextIndex >= scenes.length) {
            return {
                mode: REVIEW_MODES.REVIEW,
                phase: REVIEW_PHASES.DONE,
                currentSceneIndex: scenes.length,
                activeSceneId: null,
                activeBeatId: null,
                targetProgress: {},
                beatProgress: {},
                recentTurnEvidence: [],
                activeBeatOverride: null,
                turnsInScene: 0,
                noProgressTurns: 0,
                eventOutcome: acceptedOutcome("REVIEW_DONE", { controlChanged: true }),
            };
        }
        return {
            currentSceneIndex: nextIndex,
            activeSceneId: null,
            activeBeatId: null,
            targetProgress: {},
            beatProgress: {},
            recentTurnEvidence: [],
            activeBeatOverride: null,
            turnsInScene: 0,
            noProgressTurns: 0,
            eventOutcome: acceptedOutcome("SCENE_ADVANCED", { controlChanged: true }),
        };
    }

    function pauseReviewNode() {
        return {
            mode: REVIEW_MODES.FREE_CHAT,
            phase: REVIEW_PHASES.PAUSED,
            eventOutcome: acceptedOutcome("REVIEW_PAUSED", { controlChanged: true }),
        };
    }

    function resumeReviewNode(state) {
        return {
            ...activateSceneState(state),
            eventOutcome: acceptedOutcome("REVIEW_RESUMED", { controlChanged: true }),
        };
    }

    function claimRatingNode(state) {
        const effectId = state.event?.payload?.effectId;
        const claimedAt = now();
        const leaseUntil = new Date(claimedAt.getTime() + REVIEW_RATING_LEASE_MS).toISOString();
        return {
            effects: (state.effects || []).map((effect) => effect?.effectId === effectId
                ? {
                    ...effect,
                    status: REVIEW_EFFECT_STATUS.IN_PROGRESS,
                    attempts: Number(effect.attempts || 0) + 1,
                    claimedAt: claimedAt.toISOString(),
                    leaseUntil,
                    lastError: null,
                }
                : effect),
            eventOutcome: acceptedOutcome("RATING_CLAIMED", { effectId }),
        };
    }

    function applyRatingResultNode(state) {
        const effectId = state.event?.payload?.effectId;
        const failed = state.event?.type === REVIEW_EVENT_TYPES.RATING_FAILED;
        let outcomeCode = failed ? "RATING_RETRY_QUEUED" : "RATING_COMPLETED";
        const effects = (state.effects || []).map((effect) => {
            if (effect?.effectId !== effectId) return effect;
            if (!failed) {
                return {
                    ...effect,
                    status: REVIEW_EFFECT_STATUS.COMPLETE,
                    completedAt: now().toISOString(),
                    leaseUntil: null,
                    lastError: null,
                };
            }
            const retryable = Number(effect.attempts || 0) < REVIEW_RATING_MAX_ATTEMPTS;
            outcomeCode = retryable ? "RATING_RETRY_QUEUED" : "RATING_FAILED";
            return {
                ...effect,
                status: retryable ? REVIEW_EFFECT_STATUS.PENDING : REVIEW_EFFECT_STATUS.FAILED,
                leaseUntil: null,
                lastError: String(state.event?.payload?.error || "Rating failed").slice(0, 240),
            };
        });
        return {
            effects,
            eventOutcome: acceptedOutcome(outcomeCode, { effectId }),
        };
    }

    function finalizeAcceptedEventNode(state) {
        const event = state.event;
        const revision = Number(state.revision || 0) + 1;
        const controlChanged = [
            REVIEW_EVENT_TYPES.RUN_STARTED,
            REVIEW_EVENT_TYPES.MODE_SELECTED,
            REVIEW_EVENT_TYPES.THEME_SUBMITTED,
            REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
            REVIEW_EVENT_TYPES.PAUSE_REQUESTED,
            REVIEW_EVENT_TYPES.RESUME_REQUESTED,
        ].includes(event?.type) || state.eventOutcome?.controlChanged === true;
        const result = {
            applied: true,
            duplicate: false,
            eventId: event?.eventId,
            eventType: event?.type,
            revision,
            code: state.eventOutcome?.code || "APPLIED",
            ...state.eventOutcome,
        };
        const processedEvents = [...(state.processedEvents || []), {
            eventId: event?.eventId,
            appliedRevision: revision,
            outcomeCode: result.code,
        }].slice(-REVIEW_PROCESSED_EVENT_LIMIT);

        return {
            revision,
            controlRevision: Number(state.controlRevision || 0) + (controlChanged ? 1 : 0),
            processedEvents,
            lastEventResult: result,
            event: null,
            eventValidation: null,
            eventOutcome: null,
        };
    }

    function rejectEventNode(state) {
        const validation = state.eventValidation || {};
        return {
            lastEventResult: {
                applied: false,
                duplicate: Boolean(validation.duplicate),
                eventId: state.event?.eventId || null,
                revision: Number(state.revision || 0),
                code: validation.code || "INVALID_EVENT",
                message: validation.message || "Event was rejected",
                status: Number(validation.status || 409),
                processed: validation.processed || null,
            },
            event: null,
            eventValidation: null,
            eventOutcome: null,
        };
    }

    return {
        validateEventNode,
        startRunNode,
        chooseModeNode,
        beginPlanningNode,
        preparePlanNode,
        activateSceneNode,
        recordUserTurnNode,
        completionGuardNode,
        enqueueRatingNode,
        advanceSceneNode,
        pauseReviewNode,
        resumeReviewNode,
        claimRatingNode,
        applyRatingResultNode,
        finalizeAcceptedEventNode,
        rejectEventNode,
    };
}

export function routeValidatedEvent(state) {
    if (!state?.eventValidation?.ok) return "reject_event";
    switch (state?.event?.type) {
        case REVIEW_EVENT_TYPES.RUN_STARTED:
            return "start_run";
        case REVIEW_EVENT_TYPES.MODE_SELECTED:
            return "choose_mode";
        case REVIEW_EVENT_TYPES.THEME_SUBMITTED:
            return "begin_planning";
        case REVIEW_EVENT_TYPES.USER_TURN_COMPLETED:
            return getActiveBeatFromState(state) ? "classify_turn_evidence" : "record_user_turn";
        case REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED:
            return "completion_guard";
        case REVIEW_EVENT_TYPES.PAUSE_REQUESTED:
            return "pause_review";
        case REVIEW_EVENT_TYPES.RESUME_REQUESTED:
            return "resume_review";
        case REVIEW_EVENT_TYPES.RATING_CLAIMED:
            return "claim_rating";
        case REVIEW_EVENT_TYPES.RATING_COMPLETED:
        case REVIEW_EVENT_TYPES.RATING_FAILED:
            return "apply_rating_result";
        default:
            return "reject_event";
    }
}

export function routePlanResult(state) {
    return state?.phase === REVIEW_PHASES.ERROR ? "finalize_event" : "activate_scene";
}

export function routeCompletionResult(state) {
    return state?.eventOutcome?.completionAccepted ? "enqueue_rating" : "finalize_event";
}

export function routeAfterAdvance(state) {
    return state?.phase === REVIEW_PHASES.DONE ? "finalize_event" : "activate_scene";
}
