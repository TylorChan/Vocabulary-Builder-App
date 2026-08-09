import assert from "node:assert/strict";
import test from "node:test";
import {
    EXPRESSION_GAP_DECISIONS,
    EXPRESSION_GAP_EVIDENCE,
    EXPRESSION_GAP_TYPES,
} from "../services/expressionGapGateService.js";
import { EXPRESSION_INTERVENTION_ACTIONS } from "../orchestration/expressionAssistGraph/expressionAssistConstants.js";
import { selectDefaultExpressionIntervention } from "../orchestration/expressionAssistGraph/expressionInterventionPolicy.js";

function observation(overrides = {}) {
    return {
        decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
        gapType: EXPRESSION_GAP_TYPES.NONE,
        meaningClear: true,
        materialGain: false,
        evidence: [],
        intendedMeaning: null,
        ...overrides,
    };
}

test("Default stays silent for adequate speech even when a shorter idiom exists", () => {
    const result = selectDefaultExpressionIntervention(observation());
    assert.equal(result.action, EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION);
});

test("Default soft-recasts one minor form issue without creating a card candidate", () => {
    const result = selectDefaultExpressionIntervention(observation({
        decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
        gapType: EXPRESSION_GAP_TYPES.MINOR_FORM_ISSUE,
        evidence: [EXPRESSION_GAP_EVIDENCE.MINOR_FORM_ERROR],
    }));
    assert.equal(result.action, EXPRESSION_INTERVENTION_ACTIONS.SOFT_RECAST);
});

test("Default clarifies a plausible but uncertain intended meaning once", () => {
    const unclear = observation({
        decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
        gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
        meaningClear: false,
        materialGain: true,
        evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
        intendedMeaning: "The clock tilts so one side is lower.",
    });
    assert.equal(
        selectDefaultExpressionIntervention(unclear).action,
        EXPRESSION_INTERVENTION_ACTIONS.CLARIFY,
    );
    assert.equal(
        selectDefaultExpressionIntervention(unclear, { resolvingClarification: true }).action,
        EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION,
    );
});

test("Default retrieves only for a clear gap with material teaching gain", () => {
    const result = selectDefaultExpressionIntervention(observation({
        decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP,
        gapType: EXPRESSION_GAP_TYPES.CIRCUMLOCUTION,
        materialGain: true,
        evidence: [EXPRESSION_GAP_EVIDENCE.CIRCUMLOCUTION],
        intendedMeaning: "Avoid answering the main question directly.",
    }));
    assert.equal(result.action, EXPRESSION_INTERVENTION_ACTIONS.EXPRESSION_CARD);
});

test("Default ignores likely ASR corruption", () => {
    const result = selectDefaultExpressionIntervention(observation({
        meaningClear: false,
        evidence: [EXPRESSION_GAP_EVIDENCE.ASR_UNCERTAIN],
    }));
    assert.equal(result.action, EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION);
});
