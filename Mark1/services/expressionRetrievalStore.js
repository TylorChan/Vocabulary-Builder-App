import crypto from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";

const DEFAULT_DERIVED_COLLECTION = "expression_retrieval_documents";
const DEFAULT_SOURCE_COLLECTION = "vocabulary_entries";
const DEFAULT_VECTOR_INDEX = "expression_vector_index";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_OPERATION_TIMEOUT_MS = 6_000;
const DEFAULT_RETRIEVAL_DEADLINE_MS = 20_000;
const DEFAULT_MAX_READ_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const RRF_K = 60;
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "for", "from", "how", "i", "in",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with",
]);

function readEnv(name) {
    return globalThis.process?.env?.[name] || "";
}

export function resolveExpressionRetrievalTimeoutMs(
    value = readEnv("EXPRESSION_RETRIEVAL_TIMEOUT_MS"),
) {
    const parsed = Number(String(value ?? "").trim() || DEFAULT_OPERATION_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.max(1_000, Math.min(30_000, parsed))
        : DEFAULT_OPERATION_TIMEOUT_MS;
}

export function resolveExpressionRetrievalDeadlineMs(
    value = readEnv("EXPRESSION_RETRIEVAL_DEADLINE_MS"),
) {
    const parsed = Number(String(value ?? "").trim() || DEFAULT_RETRIEVAL_DEADLINE_MS);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.max(3_000, Math.min(30_000, parsed))
        : DEFAULT_RETRIEVAL_DEADLINE_MS;
}

export function resolveExpressionRetrievalMaxAttempts(
    value = readEnv("EXPRESSION_RETRIEVAL_MAX_ATTEMPTS"),
) {
    const parsed = Number(String(value ?? "").trim() || DEFAULT_MAX_READ_ATTEMPTS);
    return Number.isInteger(parsed)
        ? Math.max(1, Math.min(3, parsed))
        : DEFAULT_MAX_READ_ATTEMPTS;
}

export function resolveMongoSocksProxyOptions(
    proxyUrl = readEnv("MONGODB_SOCKS_PROXY"),
) {
    const value = String(proxyUrl || "").trim();
    if (!value) return {};

    const parsed = new URL(value.includes("://") ? value : `socks5://${value}`);
    if (!["socks:", "socks5:", "socks5h:"].includes(parsed.protocol)) {
        throw new Error("MONGODB_SOCKS_PROXY must use a SOCKS5 URL");
    }
    const proxyPort = Number(parsed.port || 1080);
    if (!parsed.hostname || !Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65_535) {
        throw new Error("MONGODB_SOCKS_PROXY must include a valid host and port");
    }
    const proxyUsername = decodeURIComponent(parsed.username || "");
    const proxyPassword = decodeURIComponent(parsed.password || "");
    if (Boolean(proxyUsername) !== Boolean(proxyPassword)) {
        throw new Error("MONGODB_SOCKS_PROXY must provide both username and password or neither");
    }

    return {
        proxyHost: parsed.hostname,
        proxyPort,
        ...(proxyUsername ? { proxyUsername, proxyPassword } : {}),
    };
}

const RETRYABLE_MONGO_ERROR_NAMES = new Set([
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoPoolClearedError",
    "MongoServerSelectionError",
    "MongoTopologyClosedError",
]);
const RETRYABLE_NETWORK_CODES = new Set([
    "EAI_AGAIN",
    "ECONNABORTED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETDOWN",
    "ENETUNREACH",
    "EPIPE",
    "ETIMEDOUT",
]);

export function isRetryableMongoReadError(error) {
    const name = String(error?.name || "");
    const code = String(error?.code || error?.cause?.code || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    if (RETRYABLE_MONGO_ERROR_NAMES.has(name) || RETRYABLE_NETWORK_CODES.has(code)) return true;
    if (error?.hasErrorLabel?.("RetryableReadError")) return true;
    return /socket read|server selection|connection (?:closed|reset)|pool (?:cleared|closed)|timed out waiting for (?:a )?connection/u.test(message);
}

function retrievalDeadlineError(stage) {
    const error = new Error(`Expression retrieval deadline exceeded during ${stage}`);
    error.name = "ExpressionRetrievalDeadlineError";
    error.code = "EXPRESSION_RETRIEVAL_DEADLINE";
    error.retrievalStage = stage;
    error.retryable = false;
    return error;
}

function annotateRetrievalError(error, { stage, attempt, retryable }) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    normalized.retrievalStage = stage;
    normalized.retrievalAttempt = attempt;
    normalized.retryable = retryable;
    return normalized;
}

function waitWithSignal(delayMs, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason || new Error("Operation aborted"));
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timerId);
            reject(signal.reason || new Error("Operation aborted"));
        };
        const timerId = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export async function executeMongoReadWithRetry(operation, {
    stage,
    maxAttempts = DEFAULT_MAX_READ_ATTEMPTS,
    operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
    deadlineAt = Date.now() + DEFAULT_RETRIEVAL_DEADLINE_MS,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    signal = null,
    logger = console,
    now = () => Date.now(),
    random = Math.random,
    sleep = waitWithSignal,
} = {}) {
    const boundedAttempts = resolveExpressionRetrievalMaxAttempts(maxAttempts);
    const boundedOperationTimeout = resolveExpressionRetrievalTimeoutMs(operationTimeoutMs);
    for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
        if (signal?.aborted) throw signal.reason || new Error("Operation aborted");
        const remainingMs = deadlineAt - now();
        if (remainingMs <= 0) throw retrievalDeadlineError(stage);
        const attemptsRemaining = boundedAttempts - attempt + 1;
        const attemptTimeoutMs = Math.max(
            250,
            Math.min(boundedOperationTimeout, Math.floor(remainingMs / attemptsRemaining)),
        );
        const startedAt = now();
        try {
            const result = await operation({ attempt, signal, timeoutMS: attemptTimeoutMs });
            logger.info?.("[ExpressionRetrieval] mongo read", {
                stage,
                attempt,
                maxAttempts: boundedAttempts,
                durationMs: Math.max(0, now() - startedAt),
                outcome: "success",
            });
            return result;
        } catch (error) {
            if (signal?.aborted) throw signal.reason || error;
            const retryable = isRetryableMongoReadError(error);
            const delayCeiling = Math.min(1_000, retryBaseDelayMs * (2 ** (attempt - 1)));
            const backoffMs = delayCeiling + Math.floor(random() * retryBaseDelayMs);
            const canRetry = retryable
                && attempt < boundedAttempts
                && now() + backoffMs < deadlineAt;
            logger.warn?.("[ExpressionRetrieval] mongo read", {
                stage,
                attempt,
                maxAttempts: boundedAttempts,
                durationMs: Math.max(0, now() - startedAt),
                outcome: canRetry ? "retrying" : "failed",
                retryable,
                backoffMs: canRetry ? backoffMs : null,
                errorName: String(error?.name || "Error").slice(0, 80),
                errorCode: String(error?.code || error?.cause?.code || "UNKNOWN").slice(0, 80),
            });
            if (!canRetry) {
                throw annotateRetrievalError(error, { stage, attempt, retryable });
            }
            await sleep(backoffMs, signal);
        }
    }
    throw retrievalDeadlineError(stage);
}

function compactText(value, maxChars = 600) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

export function normalizeExpressionText(value) {
    return compactText(value, 400)
        .normalize("NFKC")
        .replace(/[’]/g, "'")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}'\s-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function tokenizeRetrievalText(value, limit = 80) {
    const tokens = normalizeExpressionText(value)
        .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
    return [...new Set(tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token)))]
        .slice(0, limit);
}

export function buildExpressionRetrievalText(entry = {}) {
    const learningContext = entry.learningContext || {};
    const meaning = learningContext.meaning || {};
    const origin = learningContext.origin || {};
    const gap = learningContext.gap || {};
    const parts = [
        compactText(entry.text, 160),
        compactText(meaning.senseDefinition || entry.definition, 180),
        compactText(meaning.communicativeFunction || entry.realLifeDef, 180),
        compactText(meaning.usagePattern, 180),
        "Natural spoken English.",
        compactText(origin.situationSummary || entry.surroundingText, 220),
        compactText(gap.suggestedRecast || entry.example, 220),
    ].filter(Boolean);
    return compactText(parts.join(" "), 1_000);
}

function sourceSignature(entry, retrievalText) {
    return crypto.createHash("sha256")
        .update(JSON.stringify({
            text: entry?.text || "",
            definition: entry?.definition || "",
            realLifeDef: entry?.realLifeDef || "",
            learningContext: entry?.learningContext || null,
            retrievalText,
        }))
        .digest("hex");
}

export function reciprocalRankFuse(rankedLists = [], { k = RRF_K } = {}) {
    const fused = new Map();
    rankedLists.forEach((list, listIndex) => {
        (Array.isArray(list) ? list : []).forEach((item, rank) => {
            const vocabularyId = String(item?.vocabularyId || "").trim();
            if (!vocabularyId) return;
            const existing = fused.get(vocabularyId) || {
                ...item,
                vocabularyId,
                rrfScore: 0,
                rankSources: [],
            };
            existing.rrfScore += 1 / (k + rank + 1);
            existing.rankSources.push({ listIndex, rank: rank + 1 });
            fused.set(vocabularyId, existing);
        });
    });
    return [...fused.values()].sort((left, right) => (
        right.rrfScore - left.rrfScore
        || left.vocabularyId.localeCompare(right.vocabularyId)
    ));
}

function toMongoIds(vocabularyIds) {
    return vocabularyIds.flatMap((value) => {
        const id = String(value || "").trim();
        if (!id) return [];
        return ObjectId.isValid(id) ? [new ObjectId(id), id] : [id];
    });
}

function toCandidate(source, derived, fused) {
    const learningContext = source.learningContext || null;
    return {
        vocabularyId: String(source._id),
        expression: compactText(source.text, 160),
        definition: compactText(
            learningContext?.meaning?.senseDefinition || source.definition,
            260,
        ),
        usage: compactText(
            learningContext?.meaning?.communicativeFunction || source.realLifeDef,
            260,
        ),
        usagePattern: compactText(
            learningContext?.meaning?.usagePattern || source.example,
            220,
        ),
        situationSummary: compactText(
            learningContext?.origin?.situationSummary || source.surroundingText,
            220,
        ),
        retrievalText: compactText(derived?.retrievalText, 1_000),
        retrieval: {
            rrfScore: Number(fused?.rrfScore || 0),
            sources: fused?.rankSources || [],
        },
    };
}

export class ExpressionRetrievalStore {
    constructor({
        uri = readEnv("MONGODB_ATLAS_URI") || readEnv("MONGO_URI"),
        dbName = readEnv("MONGODB_ATLAS_DB_NAME") || "vocabulary_builder",
        sourceCollectionName = readEnv("VOCABULARY_COLLECTION_NAME") || DEFAULT_SOURCE_COLLECTION,
        derivedCollectionName = readEnv("EXPRESSION_RETRIEVAL_COLLECTION") || DEFAULT_DERIVED_COLLECTION,
        vectorIndexName = readEnv("EXPRESSION_RETRIEVAL_VECTOR_INDEX") || DEFAULT_VECTOR_INDEX,
        embeddingModel = DEFAULT_EMBEDDING_MODEL,
        embeddingDimensions = DEFAULT_EMBEDDING_DIMENSIONS,
        operationTimeoutMs = resolveExpressionRetrievalTimeoutMs(),
        retrievalDeadlineMs = resolveExpressionRetrievalDeadlineMs(),
        maxReadAttempts = resolveExpressionRetrievalMaxAttempts(),
        openaiClient,
        logger = console,
    } = {}) {
        if (!uri) throw new Error("Expression retrieval requires MONGODB_ATLAS_URI or MONGO_URI");
        if (!openaiClient?.embeddings?.create) {
            throw new Error("Expression retrieval requires an OpenAI client");
        }
        this.operationTimeoutMs = resolveExpressionRetrievalTimeoutMs(operationTimeoutMs);
        this.retrievalDeadlineMs = resolveExpressionRetrievalDeadlineMs(retrievalDeadlineMs);
        this.maxReadAttempts = resolveExpressionRetrievalMaxAttempts(maxReadAttempts);
        this.client = new MongoClient(uri, {
            timeoutMS: this.operationTimeoutMs,
            serverSelectionTimeoutMS: this.operationTimeoutMs,
            connectTimeoutMS: this.operationTimeoutMs,
            socketTimeoutMS: this.operationTimeoutMs,
            waitQueueTimeoutMS: Math.min(2_000, this.operationTimeoutMs),
            ...resolveMongoSocksProxyOptions(),
        });
        this.dbName = dbName;
        this.sourceCollectionName = sourceCollectionName;
        this.derivedCollectionName = derivedCollectionName;
        this.vectorIndexName = vectorIndexName;
        this.embeddingModel = embeddingModel;
        this.embeddingDimensions = embeddingDimensions;
        this.openai = openaiClient;
        this.logger = logger;
        this.connectionPromise = null;
    }

    readWithRetry(stage, operation, { deadlineAt, signal } = {}) {
        return executeMongoReadWithRetry(operation, {
            stage,
            deadlineAt: deadlineAt || Date.now() + this.retrievalDeadlineMs,
            maxAttempts: this.maxReadAttempts,
            operationTimeoutMs: this.operationTimeoutMs,
            signal,
            logger: this.logger,
        });
    }

    async connect() {
        if (!this.connectionPromise) {
            this.connectionPromise = this.client.connect().then(() => {
                const db = this.client.db(this.dbName);
                this.db = db;
                this.sourceCollection = db.collection(this.sourceCollectionName);
                this.derivedCollection = db.collection(this.derivedCollectionName);
                return Promise.all([
                    this.derivedCollection.createIndex(
                        { userId: 1, vocabularyId: 1 },
                        { unique: true, name: "expression_user_vocabulary_unique" },
                    ),
                    this.derivedCollection.createIndex(
                        { userId: 1, lexicalTokens: 1 },
                        { name: "expression_user_lexical" },
                    ),
                ]);
            }).catch((error) => {
                this.connectionPromise = null;
                throw error;
            });
        }
        await this.connectionPromise;
        return this;
    }

    async embed(text, { signal } = {}) {
        const response = await this.openai.embeddings.create({
            model: this.embeddingModel,
            input: compactText(text, 2_000),
            encoding_format: "float",
        }, { signal });
        const embedding = response?.data?.[0]?.embedding;
        if (!Array.isArray(embedding) || embedding.length !== this.embeddingDimensions) {
            throw new Error(`Unexpected embedding dimensions: ${embedding?.length || 0}`);
        }
        return { embedding, usage: response?.usage || null };
    }

    async findSourceEntry({ userId, vocabularyId }) {
        await this.connect();
        const ids = toMongoIds([vocabularyId]);
        return this.sourceCollection.findOne({
            userId: String(userId),
            _id: { $in: ids },
        });
    }

    async upsertVocabulary({ userId, vocabularyId }) {
        const source = await this.findSourceEntry({ userId, vocabularyId });
        if (!source) {
            await this.deleteVocabulary({ userId, vocabularyId });
            return { indexed: false, reason: "source_not_found" };
        }
        return this.upsertSourceEntry(source);
    }

    async upsertSourceEntry(source) {
        await this.connect();
        const userId = compactText(source?.userId, 320);
        const vocabularyId = String(source?._id || "").trim();
        const expression = compactText(source?.text, 160);
        if (!userId || !vocabularyId || !expression) {
            throw new Error("Source vocabulary entry is missing userId, id, or text");
        }

        const retrievalText = buildExpressionRetrievalText(source);
        const signature = sourceSignature(source, retrievalText);
        const existing = await this.derivedCollection.findOne(
            { userId, vocabularyId },
            { projection: { sourceSignature: 1 } },
        );
        if (existing?.sourceSignature === signature) {
            return { indexed: true, unchanged: true, vocabularyId };
        }

        const { embedding, usage } = await this.embed(retrievalText);
        const now = new Date();
        await this.derivedCollection.updateOne(
            { userId, vocabularyId },
            {
                $set: {
                    schemaVersion: 1,
                    userId,
                    vocabularyId,
                    expression,
                    expressionNormalized: normalizeExpressionText(expression),
                    retrievalText,
                    lexicalTokens: tokenizeRetrievalText(retrievalText),
                    embedding,
                    sourceSignature: signature,
                    sourceUpdatedAt: source?.updatedAt || source?.createdAt || now,
                    indexedAt: now,
                    active: true,
                },
                $unset: { dismissed: "" },
            },
            { upsert: true },
        );
        return { indexed: true, unchanged: false, vocabularyId, usage };
    }

    async deleteVocabulary({ userId, vocabularyId }) {
        await this.connect();
        const result = await this.derivedCollection.deleteOne({
            userId: String(userId),
            vocabularyId: String(vocabularyId),
        });
        return { deletedCount: result.deletedCount };
    }

    async lexicalSearch({ userId, query, limit = 10, deadlineAt, signal }) {
        await this.connect();
        const queryTokens = tokenizeRetrievalText(query, 40);
        if (!queryTokens.length) return [];
        return this.readWithRetry("lexical_search", ({ timeoutMS, signal: readSignal }) => (
            this.derivedCollection.aggregate([
                {
                    $match: {
                        userId: String(userId),
                        active: { $ne: false },
                        dismissed: { $ne: true },
                        lexicalTokens: { $in: queryTokens },
                    },
                },
                {
                    $addFields: {
                        lexicalScore: {
                            $size: { $setIntersection: ["$lexicalTokens", queryTokens] },
                        },
                    },
                },
                { $sort: { lexicalScore: -1, indexedAt: -1 } },
                { $limit: Math.max(1, Math.min(20, Number(limit || 10))) },
                { $project: { embedding: 0 } },
            ], { timeoutMS, signal: readSignal }).toArray()
        ), { deadlineAt, signal });
    }

    async vectorSearch({ userId, query, limit = 10, deadlineAt, signal }) {
        await this.connect();
        const { embedding, usage } = await this.embed(query, { signal });
        const documents = await this.readWithRetry(
            "vector_search",
            ({ timeoutMS, signal: readSignal }) => this.derivedCollection.aggregate([
                {
                    $vectorSearch: {
                        index: this.vectorIndexName,
                        path: "embedding",
                        queryVector: embedding,
                        numCandidates: Math.max(50, Math.min(200, limit * 15)),
                        limit: Math.max(1, Math.min(20, Number(limit || 10))),
                        filter: { userId: String(userId) },
                    },
                },
                { $match: { active: { $ne: false }, dismissed: { $ne: true } } },
                {
                    $project: {
                        embedding: 0,
                        vectorScore: { $meta: "vectorSearchScore" },
                    },
                },
            ], { maxTimeMS: 2_000, timeoutMS, signal: readSignal }).toArray(),
            { deadlineAt, signal },
        );
        return { documents, usage };
    }

    async search({
        userId,
        query,
        limit = 3,
        overRetrieve = 10,
        excludedVocabularyIds = [],
        signal = null,
    }) {
        const deadlineAt = Date.now() + this.retrievalDeadlineMs;
        await this.readWithRetry("connect", () => this.connect(), { deadlineAt, signal });
        const normalizedUserId = compactText(userId, 320);
        const boundedQuery = compactText(query, 2_000);
        if (!normalizedUserId || !boundedQuery) {
            return { candidates: [], diagnostics: { emptyInput: true } };
        }
        const hasDocuments = await this.readWithRetry(
            "index_check",
            ({ timeoutMS, signal: readSignal }) => this.derivedCollection.findOne(
                { userId: normalizedUserId, active: { $ne: false } },
                { projection: { _id: 1 }, timeoutMS, signal: readSignal },
            ),
            { deadlineAt, signal },
        );
        if (!hasDocuments) {
            return { candidates: [], diagnostics: { emptyIndex: true } };
        }

        const [lexicalResult, vectorResult] = await Promise.allSettled([
            this.lexicalSearch({
                userId: normalizedUserId,
                query: boundedQuery,
                limit: overRetrieve,
                deadlineAt,
                signal,
            }),
            this.vectorSearch({
                userId: normalizedUserId,
                query: boundedQuery,
                limit: overRetrieve,
                deadlineAt,
                signal,
            }),
        ]);
        const lexical = lexicalResult.status === "fulfilled" ? lexicalResult.value : [];
        const vector = vectorResult.status === "fulfilled" ? vectorResult.value.documents : [];
        if (vectorResult.status === "rejected") {
            this.logger.warn?.("[ExpressionAssist] vector branch unavailable", {
                stage: vectorResult.reason?.retrievalStage || "vector_search",
                errorName: vectorResult.reason?.name || "Error",
                errorCode: vectorResult.reason?.code || "UNKNOWN",
            });
            throw vectorResult.reason;
        }
        if (lexicalResult.status === "rejected") {
            this.logger.warn?.("[ExpressionAssist] lexical branch unavailable", {
                stage: lexicalResult.reason?.retrievalStage || "lexical_search",
                errorName: lexicalResult.reason?.name || "Error",
                errorCode: lexicalResult.reason?.code || "UNKNOWN",
            });
        }

        const excluded = new Set(excludedVocabularyIds.map((id) => String(id)));
        const fused = reciprocalRankFuse([lexical, vector])
            .filter((item) => !excluded.has(item.vocabularyId));
        if (!fused.length) {
            return {
                candidates: [],
                diagnostics: {
                    lexicalCount: lexical.length,
                    vectorCount: vector.length,
                    vectorError: vectorResult.status === "rejected",
                },
            };
        }

        const selectedIds = fused.slice(0, Math.max(limit * 3, limit)).map((item) => item.vocabularyId);
        const sources = await this.readWithRetry(
            "source_lookup",
            ({ timeoutMS, signal: readSignal }) => this.sourceCollection.find({
                userId: normalizedUserId,
                _id: { $in: toMongoIds(selectedIds) },
            }, { timeoutMS, signal: readSignal }).toArray(),
            { deadlineAt, signal },
        );
        const sourceById = new Map(sources.map((entry) => [String(entry._id), entry]));
        const derivedById = new Map(
            [...lexical, ...vector].map((entry) => [String(entry.vocabularyId), entry]),
        );
        const candidates = fused.flatMap((item) => {
            const source = sourceById.get(item.vocabularyId);
            if (!source) return [];
            return [toCandidate(source, derivedById.get(item.vocabularyId), item)];
        }).slice(0, Math.max(1, Math.min(3, Number(limit || 3))));

        return {
            candidates,
            diagnostics: {
                lexicalCount: lexical.length,
                vectorCount: vector.length,
                vectorError: vectorResult.status === "rejected",
                embeddingUsage: vectorResult.status === "fulfilled" ? vectorResult.value.usage : null,
            },
        };
    }

    async ensureVectorSearchIndex() {
        await this.connect();
        const existing = await this.derivedCollection.listSearchIndexes(this.vectorIndexName).toArray();
        if (existing.length) return { created: false, name: this.vectorIndexName };
        const name = await this.derivedCollection.createSearchIndex({
            name: this.vectorIndexName,
            type: "vectorSearch",
            definition: {
                fields: [
                    {
                        type: "vector",
                        path: "embedding",
                        numDimensions: this.embeddingDimensions,
                        similarity: "cosine",
                    },
                    { type: "filter", path: "userId" },
                ],
            },
        });
        return { created: true, name };
    }

    async warm({ signal = null } = {}) {
        const deadlineAt = Date.now() + this.retrievalDeadlineMs;
        await this.readWithRetry("connect", () => this.connect(), { deadlineAt, signal });
        await this.readWithRetry(
            "warm_ping",
            ({ timeoutMS, signal: readSignal }) => this.db.command(
                { ping: 1 },
                { timeoutMS, signal: readSignal },
            ),
            { deadlineAt, signal },
        );
        await this.readWithRetry(
            "warm_read",
            ({ timeoutMS, signal: readSignal }) => this.derivedCollection.findOne(
                {},
                { projection: { _id: 1 }, timeoutMS, signal: readSignal },
            ),
            { deadlineAt, signal },
        );
        return this;
    }

    async waitForVectorSearchIndex({ timeoutMs = 120_000, pollMs = 2_000 } = {}) {
        await this.connect();
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const indexes = await this.derivedCollection.listSearchIndexes(this.vectorIndexName).toArray();
            const index = indexes[0];
            if (index?.queryable === true || String(index?.status || "").toUpperCase() === "READY") {
                return index;
            }
            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
        throw new Error(`Vector search index ${this.vectorIndexName} was not ready within ${timeoutMs}ms`);
    }

    async reconcile({ userId = null, prune = false, limit = 0 } = {}) {
        await this.connect();
        const filter = userId ? { userId: String(userId) } : {};
        let cursor = this.sourceCollection.find(filter).sort({ _id: 1 });
        if (Number(limit) > 0) cursor = cursor.limit(Number(limit));
        let indexed = 0;
        let unchanged = 0;
        for await (const entry of cursor) {
            const result = await this.upsertSourceEntry(entry);
            indexed += result.unchanged ? 0 : 1;
            unchanged += result.unchanged ? 1 : 0;
        }

        let pruned = 0;
        if (prune) {
            const derived = await this.derivedCollection.find(filter, {
                projection: { userId: 1, vocabularyId: 1 },
            }).toArray();
            for (const document of derived) {
                const source = await this.findSourceEntry(document);
                if (source) continue;
                const result = await this.deleteVocabulary(document);
                pruned += result.deletedCount;
            }
        }
        return { indexed, unchanged, pruned };
    }

    async close() {
        if (this.connectionPromise) await this.client.close();
        this.connectionPromise = null;
    }
}

export function createExpressionRetrievalStore(options) {
    return new ExpressionRetrievalStore(options);
}
