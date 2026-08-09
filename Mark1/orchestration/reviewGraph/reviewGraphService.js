import { randomUUID } from "node:crypto";
import { buildReviewControlPacket } from "./reviewControlPacket.js";
import {
    REVIEW_EVENT_TYPES,
    REVIEW_MAX_TURN_CHARS,
    REVIEW_TURN_OUTCOMES,
} from "./reviewConstants.js";
import { createReviewEvent, findProcessedEvent, validateReviewEvent } from "./reviewEvents.js";
import { createReviewGraph } from "./reviewGraph.js";
import {
    createInitialReviewState,
    getActiveSceneFromState,
    migrateReviewState,
} from "./reviewState.js";
import { getActiveBeatFromState } from "./reviewTeaching.js";
import {
    buildDeterministicTurnEvidence,
    matchReviewTurn,
} from "./reviewTurnMatcher.js";

export class ReviewGraphError extends Error {
    constructor(message, { code = "REVIEW_GRAPH_ERROR", status = 500, details = null } = {}) {
        super(message);
        this.name = "ReviewGraphError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function requireText(value, field, maxLength = 320) {
    const text = String(value ?? "").trim();
    if (!text) {
        throw new ReviewGraphError(`${field} is required`, {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    if (text.length > maxLength) {
        throw new ReviewGraphError(`${field} is too long`, {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    return text;
}

function configForRun(reviewRunId) {
    return { configurable: { thread_id: reviewRunId } };
}

export class ReviewGraphService {
    constructor({
        checkpointer,
        planBuilder,
        turnEvidenceBuilder = null,
        replanBuilder = null,
        now = () => new Date(),
        maxPlanningAttempts = 2,
        retryDelayMs = 150,
        logger = null,
    } = {}) {
        if (!checkpointer) {
            throw new Error("ReviewGraphService requires a checkpointer");
        }
        this.now = now;
        this.logger = typeof logger === "function" ? logger : null;
        this.turnEvidenceBuilder = typeof turnEvidenceBuilder === "function" ? turnEvidenceBuilder : null;
        this.queues = new Map();
        this.graph = createReviewGraph({
            checkpointer,
            planBuilder,
            replanBuilder,
            now,
            maxPlanningAttempts,
            retryDelayMs,
        });
    }

    log(record) {
        try {
            this.logger?.({ component: "review_graph", ...record });
        } catch {
            // Observability must never change workflow behavior.
        }
    }

    enqueue(reviewRunId, operation) {
        const previous = this.queues.get(reviewRunId) || Promise.resolve();
        const next = previous.catch(() => undefined).then(operation);
        this.queues.set(reviewRunId, next);
        return next.finally(() => {
            if (this.queues.get(reviewRunId) === next) {
                this.queues.delete(reviewRunId);
            }
        });
    }

    async getState(reviewRunId) {
        const snapshot = await this.graph.getState(configForRun(reviewRunId));
        if (!snapshot?.values || !Object.keys(snapshot.values).length) return null;
        const migrated = migrateReviewState(snapshot.values);
        if (migrated !== snapshot.values) {
            await this.graph.updateState(configForRun(reviewRunId), migrated);
        }
        return migrated;
    }

    assertOwnership(state, userId) {
        if (!state) {
            throw new ReviewGraphError("Review run was not found", {
                code: "RUN_NOT_FOUND",
                status: 404,
            });
        }
        if (state.userId !== userId) {
            throw new ReviewGraphError("Review run does not belong to this user", {
                code: "RUN_FORBIDDEN",
                status: 403,
            });
        }
    }

    async startRun({
        userId,
        sourceSessionId = null,
        dueWords = [],
        legacyProgress = null,
        reviewRunId = null,
        restart = false,
        eventId = randomUUID(),
    }) {
        const normalizedUserId = requireText(userId, "userId", 320);
        const normalizedSessionId = sourceSessionId ? requireText(sourceSessionId, "sourceSessionId", 320) : null;
        const requestedRunId = reviewRunId ? requireText(reviewRunId, "reviewRunId", 320) : null;

        if (requestedRunId && !restart) {
            const existing = await this.getState(requestedRunId);
            if (existing) {
                this.assertOwnership(existing, normalizedUserId);
                this.log({
                    operation: "run_resume",
                    reviewRunId: requestedRunId,
                    sourceSessionId: existing.sourceSessionId || normalizedSessionId,
                    phaseAfter: existing.phase,
                    revision: Number(existing.revision || 0),
                });
                return {
                    created: false,
                    resumed: true,
                    reviewRunId: requestedRunId,
                    revision: Number(existing.revision || 0),
                    controlPacket: buildReviewControlPacket(existing, { nowMs: this.now().getTime() }),
                };
            }
        }

        const nextRunId = restart || !requestedRunId ? randomUUID() : requestedRunId;
        return this.enqueue(nextRunId, async () => {
            const event = createReviewEvent({
                eventId,
                type: REVIEW_EVENT_TYPES.RUN_STARTED,
                expectedRevision: 0,
                payload: {},
                occurredAt: this.now().toISOString(),
            });
            const initialState = createInitialReviewState({
                reviewRunId: nextRunId,
                userId: normalizedUserId,
                sourceSessionId: normalizedSessionId,
                dueWords,
                legacyProgress,
                event,
                now: this.now().toISOString(),
            });
            const state = await this.graph.invoke(initialState, configForRun(nextRunId));
            this.log({
                operation: "run_start",
                reviewRunId: nextRunId,
                sourceSessionId: normalizedSessionId,
                eventId,
                eventType: REVIEW_EVENT_TYPES.RUN_STARTED,
                phaseAfter: state.phase,
                revision: Number(state.revision || 0),
            });
            return {
                created: true,
                resumed: false,
                reviewRunId: nextRunId,
                revision: Number(state.revision || 0),
                controlPacket: buildReviewControlPacket(state, { nowMs: this.now().getTime() }),
            };
        });
    }

    async sanitizeEventForGraph(state, input) {
        const event = createReviewEvent({
            eventId: requireText(input?.eventId, "eventId", 128),
            type: requireText(input?.type, "type", 80),
            expectedRevision: input?.expectedRevision,
            payload: input?.payload,
            occurredAt: input?.occurredAt || this.now().toISOString(),
        });

        if (event.type !== REVIEW_EVENT_TYPES.USER_TURN_COMPLETED) return event;
        const transcript = String(input?.payload?.transcript ?? "");
        if (!transcript.trim()) {
            throw new ReviewGraphError("transcript is required", {
                code: "INVALID_REQUEST",
                status: 400,
            });
        }
        if (transcript.length > REVIEW_MAX_TURN_CHARS * 2) {
            throw new ReviewGraphError("transcript is too long", {
                code: "INVALID_REQUEST",
                status: 400,
            });
        }
        const activeScene = getActiveSceneFromState(state);
        const activeBeat = getActiveBeatFromState(state);
        const observation = matchReviewTurn({ transcript, activeScene });
        let turnEvidence = activeBeat
            ? buildDeterministicTurnEvidence({
                observation,
                activeBeat,
                noProgressTurns: state.noProgressTurns,
            })
            : null;
        const turnId = requireText(input?.payload?.turnId || event.eventId, "turnId", 160);
        const deterministicEvent = {
            ...event,
            payload: {
                ...observation,
                turnId,
                ...(turnEvidence ? { turnEvidence } : {}),
            },
        };
        const validation = validateReviewEvent(state, deterministicEvent, {
            nowMs: this.now().getTime(),
        });
        if (!validation.ok) return deterministicEvent;
        if (state.recentTurnEvidence?.some((item) => item?.turnId === turnId)) {
            return deterministicEvent;
        }

        if (activeBeat && this.turnEvidenceBuilder) {
            try {
                const semanticEvidence = await this.turnEvidenceBuilder({
                    transcript,
                    activeScene,
                    activeBeat,
                    observation,
                    targetProgress: state.targetProgress,
                    beatProgress: state.beatProgress?.[activeBeat.beatId] || null,
                });
                if (!Object.values(REVIEW_TURN_OUTCOMES).includes(semanticEvidence?.outcome)
                    || !Array.isArray(semanticEvidence?.targetEvidence)) {
                    const error = new Error("Semantic turn evidence did not match the required contract");
                    error.code = "INVALID_TURN_EVIDENCE";
                    throw error;
                }
                turnEvidence = semanticEvidence;
            } catch (error) {
                this.log({
                    operation: "turn_evidence_fallback",
                    reviewRunId: state.reviewRunId,
                    sourceSessionId: state.sourceSessionId || null,
                    eventId: event.eventId,
                    eventType: event.type,
                    phaseBefore: state.phase,
                    revision: Number(state.revision || 0),
                    errorClass: error?.code || "TURN_EVIDENCE_FAILED",
                });
            }
        }
        return {
            ...event,
            payload: {
                ...observation,
                turnId,
                ...(turnEvidence ? { turnEvidence } : {}),
            },
        };
    }

    async dispatchEvent({ reviewRunId, userId, sourceSessionId = null, ...eventInput }) {
        const normalizedRunId = requireText(reviewRunId, "reviewRunId", 320);
        const normalizedUserId = requireText(userId, "userId", 320);
        if (sourceSessionId) requireText(sourceSessionId, "sourceSessionId", 320);
        return this.enqueue(normalizedRunId, async () => {
            const startedAt = Date.now();
            const state = await this.getState(normalizedRunId);
            this.assertOwnership(state, normalizedUserId);
            const phaseBefore = state.phase;

            const prior = findProcessedEvent(state, String(eventInput?.eventId || "").trim());
            if (prior) {
                this.log({
                    operation: "event_duplicate",
                    reviewRunId: normalizedRunId,
                    sourceSessionId: state.sourceSessionId || sourceSessionId,
                    eventId: prior.eventId,
                    eventType: eventInput?.type || null,
                    phaseBefore,
                    phaseAfter: state.phase,
                    revision: Number(state.revision || 0),
                    durationMs: Date.now() - startedAt,
                });
                return {
                    applied: false,
                    duplicate: true,
                    eventId: prior.eventId,
                    revision: Number(state.revision || 0),
                    originalOutcome: prior,
                    controlPacket: buildReviewControlPacket(state, { nowMs: this.now().getTime() }),
                };
            }

            if (eventInput?.type === REVIEW_EVENT_TYPES.USER_TURN_COMPLETED) {
                const turnId = String(eventInput?.payload?.turnId || eventInput?.eventId || "").trim();
                const priorTurn = turnId
                    ? state.recentTurnEvidence?.find((item) => item?.turnId === turnId)
                    : null;
                if (priorTurn) {
                    this.log({
                        operation: "turn_evidence_duplicate",
                        reviewRunId: normalizedRunId,
                        sourceSessionId: state.sourceSessionId || sourceSessionId,
                        eventId: eventInput?.eventId || null,
                        eventType: eventInput?.type,
                        phaseBefore,
                        phaseAfter: state.phase,
                        revision: Number(state.revision || 0),
                        durationMs: Date.now() - startedAt,
                    });
                    return {
                        applied: false,
                        duplicate: true,
                        eventId: eventInput?.eventId || null,
                        duplicateTurnId: turnId,
                        revision: Number(state.revision || 0),
                        originalEvidence: {
                            eventId: priorTurn.eventId || null,
                            turnId: priorTurn.turnId,
                            outcome: priorTurn.outcome,
                        },
                        controlPacket: buildReviewControlPacket(state, { nowMs: this.now().getTime() }),
                    };
                }
            }

            const event = await this.sanitizeEventForGraph(state, eventInput);
            const nextState = await this.graph.invoke({ event }, configForRun(normalizedRunId));
            const stateUpdatedAt = Date.now();
            const result = nextState.lastEventResult || {};
            const response = {
                applied: result.applied === true,
                duplicate: result.duplicate === true,
                eventId: event.eventId,
                revision: Number(nextState.revision || 0),
                result,
                controlPacket: buildReviewControlPacket(nextState, { nowMs: this.now().getTime() }),
            };
            this.log({
                operation: response.applied ? "event_applied" : "event_rejected",
                reviewRunId: normalizedRunId,
                sourceSessionId: nextState.sourceSessionId || state.sourceSessionId || sourceSessionId,
                eventId: event.eventId,
                eventType: event.type,
                phaseBefore,
                phaseAfter: nextState.phase,
                revision: response.revision,
                node: result.code || null,
                effectId: event.payload?.effectId || result.effectId || null,
                durationMs: Date.now() - startedAt,
                errorClass: response.applied ? null : result.code || "EVENT_REJECTED",
            });
            if (event.type === REVIEW_EVENT_TYPES.USER_TURN_COMPLETED) {
                const speechStoppedAt = Date.parse(event.occurredAt || "");
                this.log({
                    operation: "turn_review_latency",
                    reviewRunId: normalizedRunId,
                    sourceSessionId: nextState.sourceSessionId || state.sourceSessionId || sourceSessionId,
                    turnId: event.payload?.turnId || null,
                    revision: response.revision,
                    speechEndToStateMs: Number.isFinite(speechStoppedAt)
                        ? Math.max(0, stateUpdatedAt - speechStoppedAt)
                        : null,
                });
            }
            if (!response.applied && !response.duplicate) {
                throw new ReviewGraphError(result.message || "Review event was rejected", {
                    code: result.code || "EVENT_REJECTED",
                    status: Number(result.status || 409),
                    details: response,
                });
            }
            return response;
        });
    }

    async getRun({ reviewRunId, userId, sourceSessionId = null }) {
        const normalizedRunId = requireText(reviewRunId, "reviewRunId", 320);
        const normalizedUserId = requireText(userId, "userId", 320);
        if (sourceSessionId) requireText(sourceSessionId, "sourceSessionId", 320);
        const state = await this.getState(normalizedRunId);
        this.assertOwnership(state, normalizedUserId);
        return {
            reviewRunId: normalizedRunId,
            revision: Number(state.revision || 0),
            controlPacket: buildReviewControlPacket(state, { nowMs: this.now().getTime() }),
        };
    }
}
