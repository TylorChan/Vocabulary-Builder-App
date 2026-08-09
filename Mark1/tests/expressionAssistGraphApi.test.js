import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { MemorySaver } from "@langchain/langgraph";
import { ExpressionAssistGraphService } from "../orchestration/expressionAssistGraph/expressionAssistGraphService.js";
import { createExpressionAssistGraphRouter } from "../routes/expressionAssistGraphRoutes.js";

async function withServer(callback) {
    const service = new ExpressionAssistGraphService({
        checkpointer: new MemorySaver(),
        decisionService: {
            decide: async () => ({
                action: "REUSE_EXISTING",
                selectedVocabularyId: "word-1",
                expression: "out of the blue",
                definition: "Unexpectedly.",
                usage: "Use it when something happens without warning.",
                recast: "His message came out of the blue.",
            }),
        },
        gapService: {
            enabled: true,
            evaluate: async () => ({
                decision: "CLEAR_GAP",
                gapType: "LEXICAL_GAP",
                intendedMeaning: "A message arrived unexpectedly.",
                communicativeFunction: "Describe an unexpected event.",
                situation: "A casual conversation about receiving a surprising message.",
                confidence: 0.97,
                telemetry: { decision: "CLEAR_GAP", totalMs: 25 },
            }),
        },
    });
    const runtime = { mode: "authority", getService: async () => service };
    const app = express();
    app.use(express.json());
    app.use("/api/expression-assist-runs", createExpressionAssistGraphRouter({ runtime }));
    const server = await new Promise((resolve) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test("serves the Expression Assist graph start and event contract", async () => {
    await withServer(async (baseUrl) => {
        const startResponse = await fetch(`${baseUrl}/api/expression-assist-runs/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "learner@example.com",
                sessionId: "voice-session-1",
                assistRunId: "assist-api-run",
            }),
        });
        assert.equal(startResponse.status, 200);
        const started = await startResponse.json();
        assert.equal(started.featureMode, "authority");
        assert.equal(started.revision, 1);

        const eventResponse = await fetch(
            `${baseUrl}/api/expression-assist-runs/${started.assistRunId}/events`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "learner@example.com",
                    sessionId: "voice-session-1",
                    eventId: "turn-api-1",
                    type: "FREE_CHAT_TURN_COMPLETED",
                    expectedRevision: started.revision,
                    payload: {
                        mode: "FREE_CHAT",
                        turnId: "user-turn-api-1",
                        transcript: "Do you know any phrase I can use when a message arrives without any warning?",
                        contextMessages: [],
                        hasPendingProactiveCard: false,
                    },
                }),
            },
        );
        assert.equal(eventResponse.status, 200);
        const event = await eventResponse.json();
        assert.equal(event.controlPacket.responseDirective.action, "REUSE_EXISTING");
        assert.equal(event.controlPacket.effects[0].payload.metadata.primaryAction, "LEARN_TODAY");
    });
});
