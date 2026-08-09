import {
    EXPRESSION_GAP_DECISIONS,
    EXPRESSION_GAP_EVIDENCE,
    EXPRESSION_GAP_TYPES,
} from "../../services/expressionGapGateService.js";
import { EXPRESSION_INTERVENTION_ACTIONS } from "./expressionAssistConstants.js";

function outcome(action, reason) {
    return { action, reason };
}

export function selectDefaultExpressionIntervention(
    observation,
    { resolvingClarification = false } = {},
) {
    const evidence = new Set(Array.isArray(observation?.evidence) ? observation.evidence : []);
    if (evidence.has(EXPRESSION_GAP_EVIDENCE.ASR_UNCERTAIN)) {
        return outcome(EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION, "asr_uncertain");
    }
    if (observation?.decision === EXPRESSION_GAP_DECISIONS.NO_GAP) {
        return outcome(EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION, "semantic_no_gap");
    }
    if (observation?.gapType === EXPRESSION_GAP_TYPES.MINOR_FORM_ISSUE
        && observation?.meaningClear === true) {
        return outcome(EXPRESSION_INTERVENTION_ACTIONS.SOFT_RECAST, "minor_form_issue");
    }

    if (observation?.decision === EXPRESSION_GAP_DECISIONS.CLEAR_GAP
        && observation?.meaningClear === true
        && observation?.materialGain === true) {
        return outcome(EXPRESSION_INTERVENTION_ACTIONS.EXPRESSION_CARD, "clear_material_gap");
    }

    if (!resolvingClarification
        && observation?.meaningClear === false
        && observation?.intendedMeaning) {
        return outcome(EXPRESSION_INTERVENTION_ACTIONS.CLARIFY, "meaning_needs_confirmation");
    }

    return outcome(
        EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION,
        resolvingClarification ? "clarification_exhausted" : "insufficient_material_gain",
    );
}
