import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCompanionIntentRouter } from "../routes/companionIntentRoutes.js";

async function withServer(service, callback) {
    const app = express();
    app.use(express.json());
    app.use("/api/companion-intent", createCompanionIntentRouter({ service }));
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

test("serves the companion intent contract", async () => {
    await withServer({
        evaluate: async (request) => ({
            intent: request.active ? "DISABLE" : "ENABLE",
            reason: request.active ? "EXPLICIT_STOP_REQUEST" : "EXPLICIT_WEB_CONTEXT_REQUEST",
            confidence: 0.96,
        }),
    }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/companion-intent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sessionId: "session-1",
                turnId: "turn-1",
                transcript: "Please read the page on the left with me.",
                active: false,
                contextMessages: [],
            }),
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.intent, "ENABLE");
    });
});
