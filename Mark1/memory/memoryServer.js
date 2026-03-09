import express from "express";
import cors from "cors";
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url) });
import { MongoClient } from "mongodb";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { MongoStore } from "./mongoStore.js";
import { createMemoryVectorStore } from "./memoryVectorStore.js";

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();

const memoryDbName =
    process.env.MONGODB_DATABASE ||
    process.env.MONGO_DB_NAME ||
    process.env.MONGODB_ATLAS_DB_NAME ||
    "vocabularydb";
const memoryCollection = process.env.MEMORY_STORE_COLLECTION || "lg_memory";
const authUsersCollectionName = process.env.AUTH_USERS_COLLECTION || "user_accounts";

const store = new MongoStore({
    mongoClient: client,
    dbName: memoryDbName,
    collection: memoryCollection,
});
await store.ensureIndexes();

const authUsersCollection = client
    .db(memoryDbName)
    .collection(authUsersCollectionName);
await authUsersCollection.createIndex({ email: 1 }, { unique: true });

const { addMemoryChunk, semanticSearch } = await createMemoryVectorStore();

function ns(userId, bucket) {
    return [userId, "memory", bucket];
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeName(name, fallbackEmail) {
    const trimmed = String(name || "").trim();
    if (trimmed) return trimmed;
    return (String(fallbackEmail || "").split("@")[0] || "User").slice(0, 80);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, saltBase64, keyLen = 64) {
    return scryptSync(password, Buffer.from(saltBase64, "base64"), keyLen).toString("base64");
}

function safePasswordMatch(password, passwordMeta) {
    const salt = String(passwordMeta?.salt || "");
    const storedHash = String(passwordMeta?.hash || "");
    const keyLen = Number(passwordMeta?.keyLen || 64);
    if (!salt || !storedHash) return false;

    const candidateHash = hashPassword(password, salt, keyLen);
    try {
        return timingSafeEqual(
            Buffer.from(candidateHash, "base64"),
            Buffer.from(storedHash, "base64")
        );
    } catch {
        return false;
    }
}

function toSessionUser(userDoc) {
    const email = normalizeEmail(userDoc?.email || "");
    return {
        id: email,
        email,
        name: String(userDoc?.name || email).trim() || email,
        createdAt: userDoc?.createdAt || new Date().toISOString(),
        lastLoginAt: userDoc?.lastLoginAt || new Date().toISOString(),
    };
}

app.post("/auth/register", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const name = normalizeName(req.body?.name, email);
        const password = String(req.body?.password || "");

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Please enter a valid email address." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters." });
        }

        const existing = await authUsersCollection.findOne({ email }, { projection: { _id: 1 } });
        if (existing) {
            return res.status(409).json({ error: "This email is already registered. Please sign in." });
        }

        const nowIso = new Date().toISOString();
        const salt = randomBytes(16).toString("base64");
        const keyLen = 64;
        const hash = hashPassword(password, salt, keyLen);

        const userDoc = {
            email,
            name,
            createdAt: nowIso,
            lastLoginAt: nowIso,
            password: {
                algorithm: "scrypt",
                salt,
                hash,
                keyLen,
            },
        };

        await authUsersCollection.insertOne(userDoc);
        return res.json({ user: toSessionUser(userDoc) });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ error: "This email is already registered. Please sign in." });
        }
        return next(error);
    }
});

app.post("/auth/signin", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Please enter a valid email address." });
        }
        if (!password) {
            return res.status(400).json({ error: "Password is required." });
        }

        const userDoc = await authUsersCollection.findOne({ email });
        if (!userDoc?.password?.salt || !userDoc?.password?.hash) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        if (!safePasswordMatch(password, userDoc.password)) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const nowIso = new Date().toISOString();
        await authUsersCollection.updateOne(
            { _id: userDoc._id },
            { $set: { lastLoginAt: nowIso } }
        );

        return res.json({
            user: toSessionUser({
                ...userDoc,
                lastLoginAt: nowIso,
            }),
        });
    } catch (error) {
        return next(error);
    }
});

app.get("/memory/bootstrap", async (req, res, next) => {
    try {
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
    } catch (error) {
        next(error);
    }
});

app.post("/memory/update", async (req, res, next) => {
    try {
        const { userId, bucket, value } = req.body;
        // bucket: "semantic" | "episodic" | "procedural"
        await store.put(ns(userId, bucket), "latest", value);
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.post("/memory/semantic/add", async (req, res, next) => {
    try {
        const { userId, text, metadata = {} } = req.body;
        await addMemoryChunk({
            text,
            metadata: { userId, ...metadata },
        });
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.get("/memory/semantic/search", async (req, res, next) => {
    try {
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
    } catch (error) {
        next(error);
    }
});

app.use((err, _req, res, _next) => {
    console.error("[memoryServer] request failed:", err);
    res.status(500).json({
        error: err?.message || "memory server error",
    });
});

const PORT = Number(process.env.PORT || 3003);
app.listen(PORT, () => {
    console.log(
        `Memory server running on ${PORT} (db=${memoryDbName}, collection=${memoryCollection})`
    );
});
