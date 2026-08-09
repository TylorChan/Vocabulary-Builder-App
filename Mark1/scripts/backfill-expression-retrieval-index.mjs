import "dotenv/config";
import OpenAI from "openai";
import { OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL } from "../config/aiModels.js";
import { createExpressionRetrievalStore } from "../services/expressionRetrievalStore.js";

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

if (!process.argv.includes("--confirm-paid-run")) {
    console.error("Refusing to create paid embeddings without --confirm-paid-run");
    process.exit(2);
}

const userId = readArg("--user-id");
const limit = Number(readArg("--limit") || 0);
const prune = process.argv.includes("--prune");
const ensureVectorIndex = process.argv.includes("--ensure-vector-index");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const store = createExpressionRetrievalStore({
    openaiClient: openai,
    embeddingModel: OPENAI_EXPRESSION_ASSIST_EMBEDDING_MODEL,
});

try {
    if (ensureVectorIndex) {
        const vectorIndex = await store.ensureVectorSearchIndex();
        console.log("[ExpressionIndex] vector index", vectorIndex);
    }
    const result = await store.reconcile({ userId, prune, limit });
    console.log("[ExpressionIndex] reconciliation complete", result);
} finally {
    await store.close();
}
