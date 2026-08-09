import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import OpenAI from "openai";
import { ObjectId } from "mongodb";
import {
    DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
    OPENAI_EXPRESSION_ASSIST_MODEL,
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
} from "../config/aiModels.js";
import {
    EXPRESSION_ASSIST_EVENT_TYPES,
} from "../orchestration/expressionAssistGraph/expressionAssistConstants.js";
import {
    createExpressionAssistCheckpoint,
} from "../orchestration/expressionAssistGraph/expressionAssistCheckpoint.js";
import {
    ExpressionAssistGraphService,
} from "../orchestration/expressionAssistGraph/expressionAssistGraphService.js";
import { createExpressionAssistService } from "../services/expressionAssistService.js";
import { createExpressionGapGateService } from "../services/expressionGapGateService.js";
import { createExpressionRetrievalStore } from "../services/expressionRetrievalStore.js";

if (!process.argv.includes("--confirm-paid-run")) {
    console.error("Refusing real Mongo/model verification without --confirm-paid-run");
    process.exit(2);
}

if (!process.env.OPENAI_API_KEY) {
    console.log("[expression-assist-graph-live] skipped: OPENAI_API_KEY is not configured");
    process.exit(0);
}
if (!process.env.DEEPSEEK_API_KEY) {
    console.log("[expression-assist-graph-live] skipped: DEEPSEEK_API_KEY is not configured");
    process.exit(0);
}

const suffix = crypto.randomUUID();
const userId = `expression-assist-graph-live-${suffix}`;
const sourceSessionId = `expression-assist-session-${suffix}`;
const assistRunId = `expression-assist-run-${suffix}`;
const source = {
    _id: new ObjectId(),
    userId,
    text: "contender",
    definition: "A person with a realistic chance of winning.",
    realLifeDef: "Use it to describe a credible competitor.",
    surroundingText: "Doctor Doom could be a serious contender.",
    example: "Doctor Doom would be a serious contender for the throne.",
    createdAt: new Date(),
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const store = createExpressionRetrievalStore({
    openaiClient: openai,
    embeddingModel: OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
});
const decisionService = createExpressionAssistService({
    openaiClient: openai,
    retrievalStore: store,
    model: OPENAI_EXPRESSION_ASSIST_MODEL,
    reasoningEffort: OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
    enabled: true,
    timeoutMs: Number(process.env.EXPRESSION_ASSIST_LIVE_TIMEOUT_MS || 30_000),
});
const gapService = createExpressionGapGateService({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
    reasoningEffort: DEEPSEEK_EXPRESSION_GAP_GATE_REASONING_EFFORT,
    enabled: true,
    timeoutMs: Number(process.env.EXPRESSION_GAP_GATE_LIVE_TIMEOUT_MS || 10_000),
});

let writerCheckpoint;
let readerCheckpoint;
const startedAt = Date.now();

try {
    await store.connect();
    await store.sourceCollection.insertOne(source);
    await store.ensureVectorSearchIndex();
    await store.upsertSourceEntry(source);
    await store.waitForVectorSearchIndex();

    writerCheckpoint = await createExpressionAssistCheckpoint({ mode: "mongo" });
    const writer = new ExpressionAssistGraphService({
        checkpointer: writerCheckpoint.checkpointer,
        decisionService,
        gapService,
    });
    const started = await writer.startRun({
        assistRunId,
        userId,
        sourceSessionId,
        eventId: `start-${suffix}`,
    });
    const decided = await writer.dispatchEvent({
        assistRunId,
        userId,
        sourceSessionId,
        eventId: `turn-${suffix}`,
        type: EXPRESSION_ASSIST_EVENT_TYPES.FREE_CHAT_TURN_COMPLETED,
        expectedRevision: started.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "user-turn-live-1",
            transcript: "Could you suggest one concise expression for this situation?",
            contextMessages: [
                {
                    messageId: "user-context-live-1",
                    role: "user",
                    text: "Doctor Doom is one of the people who has a realistic chance to win, but I keep explaining it as a whole sentence because I do not know the concise word for this kind of competitor.",
                },
                {
                    messageId: "assistant-turn-live-1",
                    role: "assistant",
                    text: "You are describing someone with a credible chance of winning.",
                },
            ],
            hasPendingProactiveCard: false,
        },
    });
    console.log("[expression-assist-graph-live] reuse decision", JSON.stringify({
        action: decided.controlPacket.responseDirective.action,
        gate: decided.controlPacket.responseDirective.gate,
        expression: decided.controlPacket.responseDirective.expression,
    }));
    assert.equal(decided.controlPacket.responseDirective.action, "REUSE_EXISTING");
    assert.equal(decided.controlPacket.responseDirective.expression, "contender");
    assert.equal(decided.controlPacket.effects.length, 1);
    assert.equal(decided.controlPacket.effects[0].payload.metadata.primaryAction, "LEARN_TODAY");
    const suggested = await writer.dispatchEvent({
        assistRunId,
        userId,
        sourceSessionId,
        eventId: `turn-new-expression-${suffix}`,
        type: EXPRESSION_ASSIST_EVENT_TYPES.FREE_CHAT_TURN_COMPLETED,
        expectedRevision: decided.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "user-turn-live-2",
            transcript: "Could you suggest some new expressions for this situation?",
            contextMessages: [
                {
                    messageId: "user-context-live-2",
                    role: "user",
                    text: "My coworker gets angry whenever someone disagrees with him, so I choose every word extremely carefully because even a small comment might upset him and I cannot speak naturally around him.",
                },
                {
                    messageId: "assistant-turn-live-2",
                    role: "assistant",
                    text: "That sounds exhausting. You are constantly filtering yourself to avoid upsetting him.",
                },
            ],
            hasPendingProactiveCard: true,
        },
    });
    console.log("[expression-assist-graph-live] new-expression decision", JSON.stringify({
        action: suggested.controlPacket.responseDirective.action,
        gate: suggested.controlPacket.responseDirective.gate,
        expression: suggested.controlPacket.responseDirective.expression,
    }));
    assert.equal(suggested.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.notEqual(suggested.controlPacket.responseDirective.expression, "contender");
    assert.equal(suggested.controlPacket.effects.length, 2);
    assert.equal(suggested.controlPacket.effects[1].payload.metadata.primaryAction, "SAVE");
    const writtenRevision = suggested.revision;

    await writerCheckpoint.close();
    writerCheckpoint = null;
    readerCheckpoint = await createExpressionAssistCheckpoint({ mode: "mongo" });
    const reader = new ExpressionAssistGraphService({
        checkpointer: readerCheckpoint.checkpointer,
        decisionService: { decide: async () => ({ action: "NO_ACTION" }) },
        gapService,
    });
    const restored = await reader.getRun({ assistRunId, userId, sourceSessionId });
    assert.equal(restored.revision, writtenRevision);
    assert.equal(restored.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(
        restored.controlPacket.responseDirective.expression,
        suggested.controlPacket.responseDirective.expression,
    );
    assert.equal(restored.controlPacket.effects.length, 2);

    console.log(JSON.stringify({
        ok: true,
        assistRunId,
        restoredRevision: restored.revision,
        reusedExpression: decided.controlPacket.responseDirective.expression,
        newAction: restored.controlPacket.responseDirective.action,
        newExpression: restored.controlPacket.responseDirective.expression,
        pendingEffectCount: restored.controlPacket.effects.length,
        model: OPENAI_EXPRESSION_ASSIST_MODEL,
        gateModel: DEEPSEEK_EXPRESSION_GAP_GATE_MODEL,
        embeddingModel: OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
        durationMs: Date.now() - startedAt,
    }, null, 2));
} finally {
    if (readerCheckpoint?.checkpointer) {
        await readerCheckpoint.checkpointer.deleteThread(assistRunId).catch(() => undefined);
    }
    await writerCheckpoint?.close().catch(() => undefined);
    await readerCheckpoint?.close().catch(() => undefined);
    await store.connect().catch(() => null);
    await store.sourceCollection?.deleteMany({ userId }).catch(() => null);
    await store.derivedCollection?.deleteMany({ userId }).catch(() => null);
    await decisionService.close().catch(() => null);
}
