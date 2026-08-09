import assert from "node:assert/strict";
import test from "node:test";
import {
    EXPRESSION_GAP_DECISIONS,
    EXPRESSION_GAP_EVIDENCE,
    EXPRESSION_GAP_TYPES,
    ExpressionGapGateService,
    buildExpressionGapGatePrompt,
} from "../services/expressionGapGateService.js";

function request() {
    return {
        turnId: "turn-1",
        transcript: "He appeared with no warning, and I did not know any short phrase for it.",
        contextMessages: [{
            messageId: "assistant-1",
            role: "assistant",
            text: "What happened at the restaurant?",
        }],
    };
}

function providerResponse(payload) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            id: "gate-response-1",
            output: [{
                content: [{
                    type: "output_text",
                    text: JSON.stringify(payload),
                }],
            }],
            usage: {
                input_tokens: 120,
                output_tokens: 40,
                total_tokens: 160,
                output_tokens_details: { reasoning_tokens: 0 },
            },
        }),
    };
}

function createService(fetchImpl) {
    return new ExpressionGapGateService({
        fetchImpl,
        apiKey: "test-key",
        enabled: true,
        timeoutMs: 900,
        logger: { info() {}, warn() {} },
    });
}

test("returns a bounded semantic projection for a clear expression gap", async () => {
    let providerBody = null;
    const service = createService(async (_url, init) => {
        providerBody = JSON.parse(init.body);
        return providerResponse({
            decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP,
            gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
            meaningClear: true,
            materialGain: true,
            evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
            intendedMeaning: "Someone appeared unexpectedly.",
            communicativeFunction: "Describe an unexpected appearance.",
            situation: "A casual story about a surprising encounter.",
            confidence: 0.96,
        });
    });

    const result = await service.evaluate(request());

    assert.equal(result.decision, EXPRESSION_GAP_DECISIONS.CLEAR_GAP);
    assert.equal(result.gapType, EXPRESSION_GAP_TYPES.LEXICAL_GAP);
    assert.equal(result.meaningClear, true);
    assert.equal(result.materialGain, true);
    assert.deepEqual(result.evidence, [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE]);
    assert.equal(result.telemetry.model, "deepseek-v4-flash");
    assert.equal(result.telemetry.usage.reasoningTokens, 0);
    assert.equal(providerBody.reasoning.effort, "none");
    assert.equal(providerBody.text.format.name, "expression_gap_gate");
    assert.equal(providerBody.text.format.schema.required.includes("materialGain"), true);
    assert.match(providerBody.input, /Length, fillers, or formality alone are not gaps/);
    assert.equal(providerBody.input.split(request().transcript).length - 1, 1);
});

test("normalizes a NO_GAP result to an empty semantic projection", async () => {
    const service = createService(async () => providerResponse({
        decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
        gapType: EXPRESSION_GAP_TYPES.NONE,
        meaningClear: true,
        materialGain: false,
        evidence: [],
        intendedMeaning: null,
        communicativeFunction: null,
        situation: null,
        confidence: 0.91,
    }));

    const result = await service.evaluate(request());

    assert.equal(result.decision, EXPRESSION_GAP_DECISIONS.NO_GAP);
    assert.equal(result.intendedMeaning, null);
    assert.equal(result.communicativeFunction, null);
    assert.equal(result.situation, null);
});

test("timeoutMs zero leaves the provider request without a deadline signal", async () => {
    let requestSignal = "not-called";
    const service = new ExpressionGapGateService({
        fetchImpl: async (_url, init) => {
            requestSignal = init.signal;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return providerResponse({
                decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
                gapType: EXPRESSION_GAP_TYPES.NONE,
                meaningClear: true,
                materialGain: false,
                evidence: [],
                intendedMeaning: null,
                communicativeFunction: null,
                situation: null,
                confidence: 0.91,
            });
        },
        apiKey: "test-key",
        enabled: true,
        timeoutMs: 0,
        logger: { info() {}, warn() {} },
    });

    const result = await service.evaluate(request());

    assert.equal(requestSignal, undefined);
    assert.equal(result.decision, EXPRESSION_GAP_DECISIONS.NO_GAP);
});

test("rejects contradictory structured output instead of routing it downstream", async () => {
    const service = createService(async () => providerResponse({
        decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
        gapType: EXPRESSION_GAP_TYPES.CIRCUMLOCUTION,
        meaningClear: true,
        materialGain: false,
        evidence: [],
        intendedMeaning: null,
        communicativeFunction: null,
        situation: null,
        confidence: 0.9,
    }));

    await assert.rejects(
        service.evaluate(request()),
        (error) => error.code === "invalid_structured_output",
    );
});

test("accepts a minor form observation without semantic projection", async () => {
    const service = createService(async () => providerResponse({
        decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
        gapType: EXPRESSION_GAP_TYPES.MINOR_FORM_ISSUE,
        meaningClear: true,
        materialGain: false,
        evidence: [EXPRESSION_GAP_EVIDENCE.MINOR_FORM_ERROR],
        intendedMeaning: null,
        communicativeFunction: null,
        situation: null,
        confidence: 0.88,
    }));

    const result = await service.evaluate(request());

    assert.equal(result.gapType, EXPRESSION_GAP_TYPES.MINOR_FORM_ISSUE);
    assert.equal(result.intendedMeaning, null);
    assert.equal(result.materialGain, false);
});

test("keeps likely ASR corruption on the no-intervention path", async () => {
    const service = createService(async () => providerResponse({
        decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
        gapType: EXPRESSION_GAP_TYPES.NONE,
        meaningClear: false,
        materialGain: false,
        evidence: [EXPRESSION_GAP_EVIDENCE.ASR_UNCERTAIN],
        intendedMeaning: null,
        communicativeFunction: null,
        situation: null,
        confidence: 0.84,
    }));

    const result = await service.evaluate(request());

    assert.equal(result.meaningClear, false);
    assert.deepEqual(result.evidence, [EXPRESSION_GAP_EVIDENCE.ASR_UNCERTAIN]);
});

test("deduplicates the original attempt when resolving pending clarification", () => {
    const originalAttempt = "The clock is uneven because one side is lower.";
    const prompt = buildExpressionGapGatePrompt({
        turnId: "confirmation-turn",
        transcript: "Yes, that is exactly what I mean.",
        contextMessages: [
            { messageId: "source-turn", role: "user", text: originalAttempt },
            { messageId: "clarify-turn", role: "assistant", text: "Do you mean it tilts to one side?" },
        ],
        pendingClarification: {
            sourceTurnId: "source-turn",
            originalAttempt,
            intendedMeaning: "The clock tilts so one side is lower.",
            gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
            communicativeFunction: "Describe an object tilted to one side.",
            situation: "Describing a badly hung clock.",
            evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
        },
    });

    assert.equal(prompt.split(originalAttempt).length - 1, 1);
    assert.match(prompt, /Do you mean it tilts to one side/);
    assert.match(prompt, /Yes, that is exactly what I mean/);
});

test("classifies provider timeouts as a fail-open error", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    const service = createService(async () => {
        throw timeout;
    });

    await assert.rejects(
        service.evaluate(request()),
        (error) => error.code === "provider_timeout" && error.status === 504,
    );
});
