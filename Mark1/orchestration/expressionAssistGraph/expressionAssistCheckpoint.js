import process from "node:process";
import { MemorySaver } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

const CHECKPOINT_COLLECTION = "expression_assist_graph_checkpoints";
const WRITES_COLLECTION = "expression_assist_graph_checkpoint_writes";

export async function createExpressionAssistCheckpoint({
    mode = process.env.EXPRESSION_ASSIST_GRAPH_CHECKPOINTER
        || (process.env.NODE_ENV === "production" ? "mongo" : "memory"),
} = {}) {
    const normalizedMode = String(mode || "memory").trim().toLowerCase();
    if (normalizedMode === "memory") {
        return { mode: normalizedMode, checkpointer: new MemorySaver(), close: async () => {} };
    }
    if (normalizedMode !== "mongo") {
        throw new Error(`Unsupported EXPRESSION_ASSIST_GRAPH_CHECKPOINTER: ${normalizedMode}`);
    }

    const uri = process.env.EXPRESSION_ASSIST_GRAPH_MONGODB_URI
        || process.env.REVIEW_GRAPH_MONGODB_URI
        || process.env.MONGODB_ATLAS_URI
        || process.env.MONGO_URI;
    if (!uri) throw new Error("Mongo Expression Assist checkpoints require a MongoDB URI");
    const dbName = process.env.EXPRESSION_ASSIST_GRAPH_DB_NAME
        || process.env.REVIEW_GRAPH_DB_NAME
        || process.env.MONGODB_ATLAS_DB_NAME
        || "mark2";
    const client = new MongoClient(uri, {
        appName: "mark2-expression-assist-graph",
        serverSelectionTimeoutMS: Number(process.env.EXPRESSION_ASSIST_GRAPH_MONGO_TIMEOUT_MS || 10_000),
    });
    try {
        await client.connect();
        const db = client.db(dbName);
        await db.command({ ping: 1 });
        await Promise.all([
            db.collection(CHECKPOINT_COLLECTION).createIndexes([
                {
                    key: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
                    name: "expression_assist_checkpoint_identity",
                    unique: true,
                },
                {
                    key: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 },
                    name: "expression_assist_checkpoint_latest",
                },
            ]),
            db.collection(WRITES_COLLECTION).createIndexes([
                {
                    key: {
                        thread_id: 1,
                        checkpoint_ns: 1,
                        checkpoint_id: 1,
                        task_id: 1,
                        idx: 1,
                    },
                    name: "expression_assist_checkpoint_write_identity",
                    unique: true,
                },
            ]),
        ]);
        return {
            mode: normalizedMode,
            checkpointer: new MongoDBSaver({
                client,
                dbName,
                checkpointCollectionName: CHECKPOINT_COLLECTION,
                checkpointWritesCollectionName: WRITES_COLLECTION,
                enableTimestamps: true,
            }),
            close: async () => client.close(),
        };
    } catch (error) {
        await client.close().catch(() => undefined);
        throw error;
    }
}
