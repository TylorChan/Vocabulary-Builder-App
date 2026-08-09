import { Annotation } from "@langchain/langgraph";
import {
    EXPRESSION_ASSIST_FLOW_VERSION,
    EXPRESSION_ASSIST_STATE_SCHEMA_VERSION,
} from "./expressionAssistConstants.js";

function replaceValue(_current, next) {
    return next;
}

function replaceAnnotation(defaultFactory) {
    return Annotation({
        reducer: replaceValue,
        default: defaultFactory,
    });
}

export const ExpressionAssistState = Annotation.Root({
    stateSchemaVersion: replaceAnnotation(() => EXPRESSION_ASSIST_STATE_SCHEMA_VERSION),
    flowVersion: replaceAnnotation(() => EXPRESSION_ASSIST_FLOW_VERSION),
    assistRunId: replaceAnnotation(() => null),
    userId: replaceAnnotation(() => null),
    sourceSessionId: replaceAnnotation(() => null),
    revision: replaceAnnotation(() => 0),
    controlRevision: replaceAnnotation(() => 0),
    lastCompletedTurnId: replaceAnnotation(() => null),
    lastCompletedTurnRevision: replaceAnnotation(() => 0),
    lastAttemptHash: replaceAnnotation(() => null),
    previousLearnerAttempt: replaceAnnotation(() => null),
    lastRecommendationAttempt: replaceAnnotation(() => null),
    lastRecommendedExpression: replaceAnnotation(() => null),
    lastRecommendationRevision: replaceAnnotation(() => null),
    lastRecommendationAt: replaceAnnotation(() => null),
    pendingClarification: replaceAnnotation(() => null),
    latestDecision: replaceAnnotation(() => null),
    effects: replaceAnnotation(() => []),
    processedEvents: replaceAnnotation(() => []),
    lastError: replaceAnnotation(() => null),
    event: replaceAnnotation(() => null),
    eventValidation: replaceAnnotation(() => null),
    eventOutcome: replaceAnnotation(() => null),
    lastEventResult: replaceAnnotation(() => null),
});

export function createInitialExpressionAssistState({
    assistRunId,
    userId,
    sourceSessionId,
    event,
}) {
    return {
        stateSchemaVersion: EXPRESSION_ASSIST_STATE_SCHEMA_VERSION,
        flowVersion: EXPRESSION_ASSIST_FLOW_VERSION,
        assistRunId,
        userId,
        sourceSessionId,
        revision: 0,
        controlRevision: 0,
        lastCompletedTurnId: null,
        lastCompletedTurnRevision: 0,
        lastAttemptHash: null,
        previousLearnerAttempt: null,
        lastRecommendationAttempt: null,
        lastRecommendedExpression: null,
        lastRecommendationRevision: null,
        lastRecommendationAt: null,
        pendingClarification: null,
        latestDecision: null,
        effects: [],
        processedEvents: [],
        lastError: null,
        event,
        eventValidation: null,
        eventOutcome: null,
        lastEventResult: null,
    };
}

export function migrateExpressionAssistState(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    if (Number(snapshot.stateSchemaVersion || 0) >= EXPRESSION_ASSIST_STATE_SCHEMA_VERSION) {
        return snapshot;
    }
    return {
        ...snapshot,
        stateSchemaVersion: EXPRESSION_ASSIST_STATE_SCHEMA_VERSION,
        flowVersion: EXPRESSION_ASSIST_FLOW_VERSION,
        lastCompletedTurnRevision: Number(snapshot.lastCompletedTurnRevision || 0),
        lastRecommendationAttempt: snapshot.lastRecommendationAttempt || null,
        lastRecommendedExpression: snapshot.lastRecommendedExpression || null,
        pendingClarification: snapshot.pendingClarification || null,
        effects: Array.isArray(snapshot.effects) ? snapshot.effects : [],
        processedEvents: Array.isArray(snapshot.processedEvents) ? snapshot.processedEvents : [],
    };
}
