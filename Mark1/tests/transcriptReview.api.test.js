import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createTranscriptReviewRouter } from "../routes/transcriptReviewRoutes.js";

function createLogger() {
    return { info() {}, error() {} };
}

async function withServer(service, run) {
    const app = express();
    app.use(express.json());
    app.use("/api/transcript-review", createTranscriptReviewRouter({ service, logger: createLogger() }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    try {
        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("benchmark endpoint rejects a request without an active review target", async () => {
    let providerCalled = false;
    const service = {
        async reviewWithGemini() {
            providerCalled = true;
        },
        async reviewWithDeepSeek() {
            providerCalled = true;
        },
    };

    await withServer(service, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/transcript-review/gemini`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentTurn: "I used the phrase." }),
        });
        const payload = await response.json();

        assert.equal(response.status, 400);
        assert.equal(payload.error, "TranscriptReviewRequestError");
        assert.equal(providerCalled, false);
    });
});

test("benchmark endpoint reports API and provider latency separately", async () => {
    const service = {
        async reviewWithGemini(request) {
            return {
                provider: "gemini",
                model: "gemini-3.6-flash",
                inferenceMode: "minimal",
                latencyMs: { provider: 12.5 },
                contextStats: {
                    recentTurnCount: request.conversationContext.recentTurns.length,
                    hasRollingSummary: false,
                    inputChars: 100,
                },
                usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 0, totalTokens: 15 },
                review: {
                    outcome: "PARTIAL",
                    targetEvidence: [],
                    asrUncertain: false,
                    confidence: 0.7,
                },
                providerRequestId: "response-1",
            };
        },
        async reviewWithDeepSeek() {
            throw new Error("not used");
        },
    };

    await withServer(service, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/transcript-review/gemini`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                currentTurn: "It gives us a wider view.",
                reviewContract: {
                    activeBeat: { targetIds: ["target-1"] },
                },
            }),
        });
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.latencyMs.provider, 12.5);
        assert.equal(typeof payload.latencyMs.apiBeforeResponse, "number");
    });
});
