import express from "express";
import cors from "cors";
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url) });
import { MongoClient } from "mongodb";
import { MongoStore } from "./mongoStore.js";
import { createMemoryVectorStore } from "./memoryVectorStore.js";

const app = express();
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();

const store = new MongoStore({ mongoClient: client });
const { addMemoryChunk, semanticSearch } = await createMemoryVectorStore();

function ns(userId, bucket) {
    return [userId, "memory", bucket];
}

app.get("/memory/bootstrap", async (req, res) => {
    const { userId } = req.query;
    const semantic = await store.get(ns(userId, "semantic"), "latest");
    const episodic = await store.get(ns(userId, "episodic"), "latest");
    const procedural = await store.get(ns(userId, "procedural"), "latest");

    res.json({
        userId,
        memory: {
            semantic: semantic?.value ?? null,
            episodic: episodic?.value ?? null,
            procedural: procedural?.value ?? null,
        },
    });
});

app.post("/memory/update", async (req, res) => {
    const { userId, bucket, value } = req.body;
    // bucket: "semantic" | "episodic" | "procedural"
    await store.put(ns(userId, bucket), "latest", value);
    res.json({ ok: true });
});

app.post("/memory/semantic/add", async (req, res) => {
    const { userId, text, metadata = {} } = req.body;
    await addMemoryChunk({
        text,
        metadata: { userId, ...metadata },
    });
    res.json({ ok: true });
});

app.get("/memory/semantic/search", async (req, res) => {
    const { userId, query, k = 5 } = req.query;
    const results = await semanticSearch({
        query,
        k: Number(k),
        preFilter: { userId: { $eq: userId } },
    });

    res.json({
        results: results.map((doc) => ({
            text: doc.pageContent,
            metadata: doc.metadata,
        })),
    });
});

app.listen(3003, () => console.log("Memory server running on 3003"));