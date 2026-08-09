import { randomUUID } from "node:crypto";
import { EXPRESSION_ASSIST_EVENT_TYPES } from "./expressionAssistConstants.js";
import { buildExpressionAssistControlPacket } from "./expressionAssistControlPacket.js";
import {
    createExpressionAssistEvent,
    findProcessedExpressionAssistEvent,
} from "./expressionAssistEvents.js";
import { createExpressionAssistGraph } from "./expressionAssistGraph.js";
import {
    createInitialExpressionAssistState,
    migrateExpressionAssistState,
} from "./expressionAssistState.js";

export class ExpressionAssistGraphError extends Error {
    constructor(message, { code = "EXPRESSION_ASSIST_GRAPH_ERROR", status = 500, details = null } = {}) {
        super(message);
        this.name = "ExpressionAssistGraphError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function requireText(value, field, maxLength = 320) {
    const text = String(value ?? "").trim();
    if (!text || text.length > maxLength) {
        throw new ExpressionAssistGraphError(`${field} is required`, {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    return text;
}

function graphConfig(assistRunId) {
    return { configurable: { thread_id: assistRunId } };
}

export class ExpressionAssistGraphService {
    constructor({
        checkpointer,
        decisionService,
        gapService = null,
        now = () => new Date(),
        logger = null,
    } = {}) {
        if (!checkpointer) throw new Error("ExpressionAssistGraphService requires a checkpointer");
        if (!decisionService?.decide) throw new Error("ExpressionAssistGraphService requires a decision service");
        this.now = now;
        this.logger = typeof logger === "function" ? logger : null;
        this.queues = new Map();
        this.graph = createExpressionAssistGraph({
            checkpointer,
            decisionService,
            gapService,
            now,
        });
    }

    log(record) {
        try {
            this.logger?.({ component: "expression_assist_graph", ...record });
        } catch {
            // Observability must not affect workflow behavior.
        }
    }

    enqueue(runId, operation) {
        const previous = this.queues.get(runId) || Promise.resolve();
        const next = previous.catch(() => undefined).then(operation);
        this.queues.set(runId, next);
        return next.finally(() => {
            if (this.queues.get(runId) === next) this.queues.delete(runId);
        });
    }

    async getState(assistRunId) {
        const snapshot = await this.graph.getState(graphConfig(assistRunId));
        if (!snapshot?.values || !Object.keys(snapshot.values).length) return null;
        const migrated = migrateExpressionAssistState(snapshot.values);
        if (migrated !== snapshot.values) {
            await this.graph.updateState(graphConfig(assistRunId), migrated);
        }
        return migrated;
    }

    assertOwnership(state, userId, sourceSessionId) {
        if (!state) {
            throw new ExpressionAssistGraphError("Assist run was not found", {
                code: "RUN_NOT_FOUND",
                status: 404,
            });
        }
        if (state.userId !== userId || state.sourceSessionId !== sourceSessionId) {
            throw new ExpressionAssistGraphError("Assist run ownership does not match", {
                code: "RUN_FORBIDDEN",
                status: 403,
            });
        }
    }

    async startRun({
        userId,
        sourceSessionId,
        assistRunId = null,
        restart = false,
        eventId = randomUUID(),
    }) {
        const normalizedUserId = requireText(userId, "userId");
        const normalizedSessionId = requireText(sourceSessionId, "sourceSessionId");
        const requestedRunId = assistRunId ? requireText(assistRunId, "assistRunId") : null;
        if (requestedRunId && !restart) {
            const existing = await this.getState(requestedRunId);
            if (existing) {
                this.assertOwnership(existing, normalizedUserId, normalizedSessionId);
                return {
                    created: false,
                    resumed: true,
                    assistRunId: requestedRunId,
                    revision: Number(existing.revision || 0),
                    controlPacket: buildExpressionAssistControlPacket(existing, { nowMs: this.now().getTime() }),
                };
            }
        }

        const runId = restart || !requestedRunId ? randomUUID() : requestedRunId;
        return this.enqueue(runId, async () => {
            const event = createExpressionAssistEvent({
                eventId,
                type: EXPRESSION_ASSIST_EVENT_TYPES.RUN_STARTED,
                expectedRevision: 0,
                occurredAt: this.now().toISOString(),
            });
            const state = await this.graph.invoke(createInitialExpressionAssistState({
                assistRunId: runId,
                userId: normalizedUserId,
                sourceSessionId: normalizedSessionId,
                event,
            }), graphConfig(runId));
            return {
                created: true,
                resumed: false,
                assistRunId: runId,
                revision: Number(state.revision || 0),
                controlPacket: buildExpressionAssistControlPacket(state, { nowMs: this.now().getTime() }),
            };
        });
    }

    async dispatchEvent({ assistRunId, userId, sourceSessionId, ...eventInput }) {
        const runId = requireText(assistRunId, "assistRunId");
        const normalizedUserId = requireText(userId, "userId");
        const normalizedSessionId = requireText(sourceSessionId, "sourceSessionId");
        return this.enqueue(runId, async () => {
            const startedAt = Date.now();
            const state = await this.getState(runId);
            this.assertOwnership(state, normalizedUserId, normalizedSessionId);
            const prior = findProcessedExpressionAssistEvent(state, String(eventInput.eventId || "").trim());
            if (prior) {
                return {
                    applied: false,
                    duplicate: true,
                    eventId: prior.eventId,
                    revision: Number(state.revision || 0),
                    originalOutcome: prior,
                    controlPacket: buildExpressionAssistControlPacket(state, { nowMs: this.now().getTime() }),
                };
            }
            const event = createExpressionAssistEvent({
                eventId: requireText(eventInput.eventId, "eventId", 128),
                type: requireText(eventInput.type, "type", 80),
                expectedRevision: eventInput.expectedRevision,
                payload: eventInput.payload,
                occurredAt: eventInput.occurredAt || this.now().toISOString(),
            });
            const nextState = await this.graph.invoke({ event }, graphConfig(runId));
            const result = nextState.lastEventResult || {};
            const response = {
                applied: result.applied === true,
                duplicate: result.duplicate === true,
                eventId: event.eventId,
                revision: Number(nextState.revision || 0),
                result,
                controlPacket: buildExpressionAssistControlPacket(nextState, { nowMs: this.now().getTime() }),
            };
            this.log({
                operation: response.applied ? "event_applied" : "event_rejected",
                assistRunId: runId,
                sourceSessionId: normalizedSessionId,
                eventId: event.eventId,
                eventType: event.type,
                revision: response.revision,
                action: response.controlPacket.responseDirective?.action || null,
                gate: response.controlPacket.responseDirective?.gate || result.gate || null,
                semanticDecision: result.semanticDecision || null,
                interventionAction: result.interventionAction || null,
                semanticGateMs: result.semanticGateMs ?? null,
                durationMs: Date.now() - startedAt,
                code: result.code || null,
            });
            if (!response.applied && !response.duplicate) {
                throw new ExpressionAssistGraphError(result.message || "Expression Assist event was rejected", {
                    code: result.code || "EVENT_REJECTED",
                    status: Number(result.status || 409),
                    details: {
                        revision: response.revision,
                        controlPacket: response.controlPacket,
                    },
                });
            }
            return response;
        });
    }

    async getRun({ assistRunId, userId, sourceSessionId }) {
        const runId = requireText(assistRunId, "assistRunId");
        const state = await this.getState(runId);
        this.assertOwnership(
            state,
            requireText(userId, "userId"),
            requireText(sourceSessionId, "sourceSessionId"),
        );
        return {
            assistRunId: runId,
            revision: Number(state.revision || 0),
            controlPacket: buildExpressionAssistControlPacket(state, { nowMs: this.now().getTime() }),
        };
    }
}
