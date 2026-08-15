import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCompanionIntentPrompt,
    CompanionIntentService,
    validateCompanionIntentResult,
} from "../services/companionIntentService.js";

function providerResponse(result) {
    return {
        ok: true,
        json: async () => ({
            id: "companion-response-1",
            output_text: JSON.stringify(result),
            usage: { input_tokens: 40, output_tokens: 12, total_tokens: 52 },
        }),
    };
}

test("prompt defines multilingual enable and strict hard-negative behavior", () => {
    const prompt = buildCompanionIntentPrompt({
        turnId: "turn-1",
        transcript: "左边先唤醒吧",
        active: false,
        contextMessages: [{ role: "assistant", text: "What would you like to do?" }],
    });
    assert.match(prompt, /左边先唤醒吧/);
    assert.match(prompt, /discussion about how the feature works/);
    assert.match(prompt, /companionCurrentlyActive/);
});

test("high-confidence actions pass while low-confidence or redundant actions become NO_ACTION", () => {
    assert.equal(validateCompanionIntentResult({
        intent: "ENABLE",
        reason: "EXPLICIT_WEB_CONTEXT_REQUEST",
        confidence: 0.94,
    }, { active: false }).intent, "ENABLE");
    assert.equal(validateCompanionIntentResult({
        intent: "ENABLE",
        reason: "EXPLICIT_WEB_CONTEXT_REQUEST",
        confidence: 0.7,
    }, { active: false }).intent, "NO_ACTION");
    assert.equal(validateCompanionIntentResult({
        intent: "DISABLE",
        reason: "EXPLICIT_STOP_REQUEST",
        confidence: 0.97,
    }, { active: false }).intent, "NO_ACTION");
});

test("service sends the bounded DeepSeek structured-output request", async () => {
    let providerRequest = null;
    const service = new CompanionIntentService({
        apiKey: "test-key",
        enabled: true,
        fetchImpl: async (_url, options) => {
            providerRequest = JSON.parse(options.body);
            return providerResponse({
                intent: "DISABLE",
                reason: "EXPLICIT_STOP_REQUEST",
                confidence: 0.96,
            });
        },
    });
    const result = await service.evaluate({
        turnId: "turn-2",
        transcript: "I can read this page myself now, so stop using the left page.",
        active: true,
        contextMessages: [],
    });
    assert.equal(result.intent, "DISABLE");
    assert.equal(providerRequest.model, "deepseek-v4-flash");
    assert.equal(providerRequest.reasoning.effort, "none");
    assert.equal(providerRequest.text.format.name, "companion_intent_gate");
    assert.equal(providerRequest.max_output_tokens, 120);
});
