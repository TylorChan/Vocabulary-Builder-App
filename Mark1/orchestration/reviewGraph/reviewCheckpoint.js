import { MemorySaver } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import process from "node:process";

export const REVIEW_CHECKPOINT_MODES = Object.freeze({
    MEMORY: "memory",
    MONGO: "mongo",
});

export const REVIEW_CHECKPOINT_COLLECTION = "review_graph_checkpoints";
export const REVIEW_CHECKPOINT_WRITES_COLLECTION = "review_graph_checkpoint_writes";

function normalizeMode(value) {
    const mode = String(value || REVIEW_CHECKPOINT_MODES.MEMORY).trim().toLowerCase();
    if (!Object.values(REVIEW_CHECKPOINT_MODES).includes(mode)) {
        throw new Error(`Unsupported REVIEW_GRAPH_CHECKPOINTER: ${mode}`);
    }
    return mode;
}

function resolveMongoConfig(overrides = {}) {
    return {
        uri: overrides.uri
            || process.env.REVIEW_GRAPH_MONGODB_URI
            || process.env.MONGODB_ATLAS_URI
            || process.env.MONGO_URI,
        dbName: overrides.dbName
            || process.env.REVIEW_GRAPH_DB_NAME
            || process.env.MONGODB_ATLAS_DB_NAME
            || "mark2",
        checkpointCollectionName: overrides.checkpointCollectionName
            || REVIEW_CHECKPOINT_COLLECTION,
        checkpointWritesCollectionName: overrides.checkpointWritesCollectionName
            || REVIEW_CHECKPOINT_WRITES_COLLECTION,
    };
}

async function ensureCheckpointIndexes(db, {
    checkpointCollectionName,
    checkpointWritesCollectionName,
}) {
    await Promise.all([
        db.collection(checkpointCollectionName).createIndexes([
            {
                key: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
                name: "review_checkpoint_identity",
                unique: true,
            },
            {
                key: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 },
                name: "review_checkpoint_latest",
            },
            {
                key: { upserted_at: 1 },
                name: "review_checkpoint_upserted_at",
            },
        ]),
        db.collection(checkpointWritesCollectionName).createIndexes([
            {
                key: {
                    thread_id: 1,
                    checkpoint_ns: 1,
                    checkpoint_id: 1,
                    task_id: 1,
                    idx: 1,
                },
                name: "review_checkpoint_write_identity",
                unique: true,
            },
            {
                key: { thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
                name: "review_checkpoint_writes_lookup",
            },
            {
                key: { upserted_at: 1 },
                name: "review_checkpoint_writes_upserted_at",
            },
        ]),
    ]);
}

export async function createReviewCheckpoint({
    mode = process.env.REVIEW_GRAPH_CHECKPOINTER || REVIEW_CHECKPOINT_MODES.MEMORY,
    mongo = {},
} = {}) {
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode === REVIEW_CHECKPOINT_MODES.MEMORY) {
        return {
            mode: normalizedMode,
            checkpointer: new MemorySaver(),
            close: async () => {},
        };
    }

    const config = resolveMongoConfig(mongo);
    if (!config.uri) {
        throw new Error(
            "Mongo review checkpoints require REVIEW_GRAPH_MONGODB_URI, MONGODB_ATLAS_URI, or MONGO_URI",
        );
    }

    const client = new MongoClient(config.uri, {
        appName: "mark2-review-graph",
        serverSelectionTimeoutMS: Number(process.env.REVIEW_GRAPH_MONGO_TIMEOUT_MS || 10_000),
    });

    try {
        await client.connect();
        const db = client.db(config.dbName);
        await db.command({ ping: 1 });
        await ensureCheckpointIndexes(db, config);
        const checkpointer = new MongoDBSaver({
            client,
            dbName: config.dbName,
            checkpointCollectionName: config.checkpointCollectionName,
            checkpointWritesCollectionName: config.checkpointWritesCollectionName,
            enableTimestamps: true,
        });
        return {
            mode: normalizedMode,
            checkpointer,
            client,
            dbName: config.dbName,
            collections: {
                checkpoints: config.checkpointCollectionName,
                writes: config.checkpointWritesCollectionName,
            },
            close: async () => client.close(),
        };
    } catch (error) {
        await client.close().catch(() => undefined);
        throw error;
    }
}
