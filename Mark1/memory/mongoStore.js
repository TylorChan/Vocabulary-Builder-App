// Custom MongoDB store adapter for LangGraph-style memory

export class MongoStore {
    constructor({ mongoClient, dbName = "mark2", collection = "lg_memory" }) {
        this.client = mongoClient;
        this.db = this.client.db(dbName);
        this.col = this.db.collection(collection);
    }

    async ensureIndexes() {
        await this.col.createIndex({ namespacePath: 1, key: 1 }, { unique: true });
        await this.col.createIndex({ namespacePath: 1 });
        // TTL index (expiresAt can be null if no ttl)
        await this.col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    _toNamespacePath(namespace = []) {
        return namespace.join("/");
    }

    // Store interface: put(namespace, key, value, index?, ttl?)
    async put(namespace, key, value, options = {}) {
        const namespacePath = this._toNamespacePath(namespace);
        const now = new Date();

        const expiresAt = options?.ttl
            ? new Date(Date.now() + options.ttl * 1000)
            : null;

        await this.col.updateOne(
            { namespacePath, key },
            {
                $set: {
                    namespace,
                    namespacePath,
                    key,
                    value,
                    updatedAt: now,
                    ...(expiresAt ? { expiresAt } : {})
                },
                $setOnInsert: {
                    createdAt: now
                }
            },
            { upsert: true }
        );
        return { namespace, key, value, updatedAt: now };
    }

    // Store interface: get(namespace, key)
    async get(namespace, key) {
        const namespacePath = this._toNamespacePath(namespace);
        const doc = await this.col.findOne({ namespacePath, key });
        if (!doc) return null;

        return {
            namespace: doc.namespace,
            key: doc.key,
            value: doc.value,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        };
    }

    // Store interface: search(namespacePrefix, { query?, filter?, limit? })
    // What it does:
    // Give me all memory items whose namespace path starts with this prefix.
    async search(namespacePrefix, query = {}) {
        const prefixPath = this._toNamespacePath(namespacePrefix);

        // Keeps context lean instead of fetching all the memory
        const limit = query?.limit ?? 20;  

        // Basic prefix match (no semantic search here)
        const cursor = this.col
            .find({ namespacePath: { $regex: `^${prefixPath}` } })
            .sort({ updatedAt: 1 })
            .limit(limit);

        const docs = await cursor.toArray();
        return docs.map((doc) => ({
            namespace: doc.namespace,
            key: doc.key,
            value: doc.value,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        }));
    }

    // Store interface: delete(namespace, key)
    async delete(namespace, key) {
        const namespacePath = this._toNamespacePath(namespace);
        await this.col.deleteOne({ namespacePath, key });
        return { ok: true };
    }

    // Store interface: list_namespaces(prefix, maxDepth?)
    async list_namespaces(prefix = [], maxDepth = undefined) {
        const prefixPath = this._toNamespacePath(prefix);
        const docs = await this.col
            .find({ namespacePath: { $regex: `^${prefixPath}` } }, { projection: { namespace: 1 } })
            .toArray();

        const all = docs.map((d) => d.namespace);

        if (maxDepth !== undefined) {
            return all.map((ns) => ns.slice(0, maxDepth));
        }

        return all;
    }
}