import {
    EXPRESSION_ASSIST_EFFECT_STATUS,
    EXPRESSION_ASSIST_EFFECT_TYPES,
    EXPRESSION_ASSIST_FLOW_VERSION,
    EXPRESSION_ASSIST_STATE_SCHEMA_VERSION,
} from "./expressionAssistConstants.js";
import { isExpressionAssistLeaseExpired } from "./expressionAssistEvents.js";

export function buildExpressionAssistControlPacket(state, { nowMs = Date.now() } = {}) {
    const effects = (Array.isArray(state?.effects) ? state.effects : [])
        .filter((effect) => (
            effect?.type === EXPRESSION_ASSIST_EFFECT_TYPES.PRESENT_EXPRESSION_CARD
            && (
                effect.status === EXPRESSION_ASSIST_EFFECT_STATUS.PENDING
                || isExpressionAssistLeaseExpired(effect, nowMs)
            )
        ))
        .map((effect) => ({
            effectId: effect.effectId,
            type: effect.type,
            status: effect.status,
            sourceTurnId: effect.sourceTurnId,
            sourceTurnRevision: effect.sourceTurnRevision,
            attempts: Number(effect.attempts || 0),
            claimable: true,
            payload: effect.payload,
        }));
    return {
        stateSchemaVersion: Number(state?.stateSchemaVersion || EXPRESSION_ASSIST_STATE_SCHEMA_VERSION),
        flowVersion: Number(state?.flowVersion || EXPRESSION_ASSIST_FLOW_VERSION),
        assistRunId: state?.assistRunId || null,
        sourceSessionId: state?.sourceSessionId || null,
        revision: Number(state?.revision || 0),
        controlRevision: Number(state?.controlRevision || 0),
        lastCompletedTurnId: state?.lastCompletedTurnId || null,
        responseDirective: state?.latestDecision || null,
        effects,
        error: state?.lastError || null,
    };
}
