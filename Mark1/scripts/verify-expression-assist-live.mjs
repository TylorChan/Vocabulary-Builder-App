import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import OpenAI from "openai";
import { ObjectId } from "mongodb";
import {
    OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
    OPENAI_EXPRESSION_ASSIST_MODEL,
    OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
} from "../config/aiModels.js";
import { createExpressionAssistService } from "../services/expressionAssistService.js";
import { createExpressionRetrievalStore } from "../services/expressionRetrievalStore.js";

if (!process.argv.includes("--confirm-paid-run")) {
    console.error("Refusing real embedding/model verification without --confirm-paid-run");
    process.exit(2);
}

const suffix = crypto.randomUUID();
const userA = `expression-assist-verify-a-${suffix}`;
const userB = `expression-assist-verify-b-${suffix}`;
const sourceA = {
    _id: new ObjectId(),
    userId: userA,
    text: "contender",
    definition: "A person with a realistic chance of winning.",
    realLifeDef: "Use it to describe a credible competitor.",
    surroundingText: "Doctor Doom could be a serious contender.",
    example: "Doctor Doom would be a serious contender for the throne.",
    createdAt: new Date(),
};
const sourceB = {
    _id: new ObjectId(),
    userId: userB,
    text: "dark horse",
    definition: "An unexpected competitor who may win.",
    realLifeDef: "Use it for a surprising candidate.",
    surroundingText: "A different user's private Expression.",
    createdAt: new Date(),
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const store = createExpressionRetrievalStore({
    openaiClient: openai,
    embeddingModel: OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
});
const service = createExpressionAssistService({
    openaiClient: openai,
    retrievalStore: store,
    model: OPENAI_EXPRESSION_ASSIST_MODEL,
    reasoningEffort: OPENAI_EXPRESSION_ASSIST_REASONING_EFFORT,
    enabled: true,
    timeoutMs: Number(process.env.EXPRESSION_ASSIST_LIVE_TIMEOUT_MS || 30_000),
});

try {
    await store.connect();
    await store.sourceCollection.insertMany([sourceA, sourceB]);
    await store.ensureVectorSearchIndex();
    await Promise.all([
        store.upsertSourceEntry(sourceA),
        store.upsertSourceEntry(sourceB),
    ]);
    await store.waitForVectorSearchIndex();

    const retrieval = await store.search({
        userId: userA,
        query: "Natural spoken English for someone who has a realistic chance to win as a credible competitor.",
        limit: 3,
        overRetrieve: 10,
    });
    assert.equal(retrieval.diagnostics.vectorError, false);
    assert.ok(retrieval.diagnostics.vectorCount > 0, "real vector branch returned no results");
    assert.ok(retrieval.candidates.some((item) => item.vocabularyId === String(sourceA._id)));
    assert.ok(retrieval.candidates.every((item) => item.vocabularyId !== String(sourceB._id)));

    const decision = await service.decide({
        assistRequestId: `assist-${suffix}`,
        userId: userA,
        sessionId: `session-${suffix}`,
        turnId: "user-turn-2",
        turnRevision: 2,
        mode: "FREE_CHAT",
        trigger: {
            reasonCode: "CIRCUMLOCUTION",
            intendedMeaning: "Doctor Doom is a serious candidate who could win.",
            communicativeFunction: "Describe someone as a credible competitor.",
            situation: "A casual Marvel discussion comparing likely winners.",
        },
        context: {
            messages: [
                { messageId: "assistant-turn-1", role: "assistant", text: "Who actually has a shot at winning?" },
                {
                    messageId: "user-turn-2",
                    role: "user",
                    text: "Doctor Doom is one of the people who really has a chance and can compete for it.",
                },
            ],
        },
    });
    assert.equal(decision.action, "REUSE_EXISTING");
    assert.equal(decision.selectedVocabularyId, String(sourceA._id));
    console.log("[ExpressionAssistLive] passed", {
        vectorCount: retrieval.diagnostics.vectorCount,
        candidateCount: retrieval.candidates.length,
        action: decision.action,
        model: OPENAI_EXPRESSION_ASSIST_MODEL,
    });
} finally {
    await store.connect().catch(() => null);
    await store.sourceCollection?.deleteMany({ userId: { $in: [userA, userB] } }).catch(() => null);
    await store.derivedCollection?.deleteMany({ userId: { $in: [userA, userB] } }).catch(() => null);
    await service.close().catch(() => null);
}
