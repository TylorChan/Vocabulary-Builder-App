import assert from "node:assert/strict";
import test from "node:test";
import {
    normalizeTranscriptReviewRequest,
} from "../services/transcriptReviewContract.js";
import {
    createTranscriptReviewBenchmarkService,
} from "../services/transcriptReviewBenchmarkService.js";

const REVIEW_RESULT = {
    outcome: "ACHIEVED",
    targetEvidence: [{
        targetId: "target-imax-environment",
        meaningFit: true,
        contextFit: true,
        usageMode: "unprompted",
        matched: true,
    }],
    asrUncertain: false,
    confidence: 0.92,
};

function createRequest() {
    return normalizeTranscriptReviewRequest({
        currentTurn: {
            turnId: "turn-6",
            text: "I prefer IMAX because it can show more of the environment.",
        },
        conversationContext: {
            rollingSummary: "The learner and teacher are comparing regular cinema screens with IMAX.",
            summaryVersion: 1,
            coversThroughTurnId: "turn-2",
            recentTurns: [
                { turnId: "turn-3", role: "assistant", text: "What does IMAX add to a space scene?" },
                { turnId: "turn-4", role: "user", text: "It feels bigger." },
                { turnId: "turn-5", role: "assistant", text: "Can you explain what viewers can see?" },
                { turnId: "turn-6", role: "user", text: "Duplicate current turn should be removed." },
            ],
        },
        reviewContract: {
            activeScene: { sceneId: "scene-imax", title: "Cinema lobby debate" },
            activeBeat: {
                beatId: "beat-environment",
                targetIds: ["target-imax-environment"],
                communicativeGoal: "Explain one visual advantage of IMAX.",
            },
            observation: { matchedTargetIds: ["target-imax-environment"] },
            targetProgress: { "target-imax-environment": "active" },
            beatProgress: { attempts: 1 },
        },
    });
}

test("Gemini benchmark uses the official generateContent contract and common result shape", async () => {
    let capturedUrl;
    let capturedInit;
    const service = createTranscriptReviewBenchmarkService({
        geminiApiKey: "test-gemini-key",
        fetchImpl: async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response(JSON.stringify({
                responseId: "gemini-response-1",
                candidates: [{ content: { parts: [{ text: JSON.stringify(REVIEW_RESULT) }] } }],
                usageMetadata: {
                    promptTokenCount: 210,
                    candidatesTokenCount: 55,
                    thoughtsTokenCount: 8,
                    totalTokenCount: 273,
                },
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        },
    });

    const result = await service.reviewWithGemini(createRequest());
    const body = JSON.parse(capturedInit.body);

    assert.match(capturedUrl, /gemini-3\.6-flash:generateContent$/);
    assert.equal(capturedInit.headers["x-goog-api-key"], "test-gemini-key");
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
    assert.equal(body.generationConfig.responseFormat.text.schema.properties.outcome.type, "string");
    assert.match(body.contents[0].parts[0].text, /Evaluate ONLY the CURRENT LEARNER TURN/);
    assert.match(body.contents[0].parts[0].text, /Prefer PARTIAL over OFF_TOPIC/);
    assert.match(body.contents[0].parts[0].text, /Do not return or repeat JSON Schema metadata/);
    assert.match(body.contents[0].parts[0].text, /I prefer IMAX because it can show more of the environment/);
    assert.doesNotMatch(body.contents[0].parts[0].text, /Duplicate current turn should be removed/);
    assert.equal(result.provider, "gemini");
    assert.equal(result.contextStats.recentTurnCount, 3);
    assert.deepEqual(result.review, REVIEW_RESULT);
    assert.equal(result.usage.reasoningTokens, 8);
});

test("DeepSeek benchmark uses the Responses API with reasoning disabled", async () => {
    let capturedUrl;
    let capturedInit;
    const service = createTranscriptReviewBenchmarkService({
        deepseekApiKey: "test-deepseek-key",
        fetchImpl: async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response(JSON.stringify({
                id: "deepseek-response-1",
                output: [{
                    type: "message",
                    content: [{ type: "output_text", text: JSON.stringify(REVIEW_RESULT) }],
                }],
                usage: {
                    input_tokens: 205,
                    output_tokens: 50,
                    output_tokens_details: { reasoning_tokens: 0 },
                    total_tokens: 255,
                },
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        },
    });

    const result = await service.reviewWithDeepSeek(createRequest());
    const body = JSON.parse(capturedInit.body);

    assert.equal(capturedUrl, "https://api.deepseek.com/responses");
    assert.equal(capturedInit.headers.Authorization, "Bearer test-deepseek-key");
    assert.equal(body.model, "deepseek-v4-flash");
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.schema.properties.outcome.type, "string");
    assert.match(body.input, /Evaluate ONLY the CURRENT LEARNER TURN/);
    assert.equal(result.provider, "deepseek");
    assert.deepEqual(result.review, REVIEW_RESULT);
    assert.equal(result.usage.reasoningTokens, 0);
});

test("OpenAI benchmark uses Responses structured output with a per-request model and effort", async () => {
    let capturedUrl;
    let capturedInit;
    const service = createTranscriptReviewBenchmarkService({
        openaiApiKey: "test-openai-key",
        fetchImpl: async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response(JSON.stringify({
                id: "openai-response-1",
                output: [{
                    type: "message",
                    content: [{ type: "output_text", text: JSON.stringify(REVIEW_RESULT) }],
                }],
                usage: {
                    input_tokens: 200,
                    output_tokens: 60,
                    output_tokens_details: { reasoning_tokens: 10 },
                    total_tokens: 260,
                },
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        },
    });

    const result = await service.reviewWithOpenAI(createRequest(), {
        model: "gpt-5.6-luna",
        reasoningEffort: "high",
    });
    const body = JSON.parse(capturedInit.body);

    assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
    assert.equal(capturedInit.headers.Authorization, "Bearer test-openai-key");
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.reasoning.effort, "high");
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.store, false);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-5.6-luna");
    assert.equal(result.inferenceMode, "high");
    assert.deepEqual(result.review, REVIEW_RESULT);
    assert.equal(result.usage.reasoningTokens, 10);
});

test("Gemini and DeepSeek accept request-scoped effort overrides", async () => {
    const capturedBodies = [];
    const service = createTranscriptReviewBenchmarkService({
        geminiApiKey: "test-gemini-key",
        deepseekApiKey: "test-deepseek-key",
        fetchImpl: async (url, init) => {
            capturedBodies.push({ url, body: JSON.parse(init.body) });
            const payload = url.includes("googleapis.com")
                ? {
                    candidates: [{ content: { parts: [{ text: JSON.stringify(REVIEW_RESULT) }] } }],
                }
                : {
                    output_text: JSON.stringify(REVIEW_RESULT),
                };
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        },
    });

    await service.reviewWithGemini(createRequest(), { thinkingLevel: "low" });
    await service.reviewWithDeepSeek(createRequest(), { reasoningEffort: "medium" });

    assert.equal(capturedBodies[0].body.generationConfig.thinkingConfig.thinkingLevel, "low");
    assert.equal(capturedBodies[1].body.reasoning.effort, "medium");
});

test("provider adapter fails fast when its API key is missing", async () => {
    const service = createTranscriptReviewBenchmarkService({
        geminiApiKey: "",
        deepseekApiKey: "",
        openaiApiKey: "",
        fetchImpl: async () => {
            throw new Error("fetch should not run");
        },
    });

    await assert.rejects(
        service.reviewWithGemini(createRequest()),
        (error) => error.status === 503 && error.code === "missing_api_key",
    );
    await assert.rejects(
        service.reviewWithDeepSeek(createRequest()),
        (error) => error.status === 503 && error.code === "missing_api_key",
    );
    await assert.rejects(
        service.reviewWithOpenAI(createRequest()),
        (error) => error.status === 503 && error.code === "missing_api_key",
    );
});
