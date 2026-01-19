import { MongoClient } from "mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";

export async function createMemoryVectorStore() {
    const client = new MongoClient(process.env.MONGODB_ATLAS_URI || "");
    await client.connect();

    const collection = client
        .db(process.env.MONGODB_ATLAS_DB_NAME)
        .collection(process.env.MONGODB_ATLAS_COLLECTION_NAME);

    const embeddings = new OpenAIEmbeddings({
        model: "text-embedding-3-small",
    });

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
        collection,
        indexName: "memory_vector_index",
        textKey: "text",
        embeddingKey: "embedding",
    });

    async function addMemoryChunk({ text, metadata }) {
        const doc = new Document({
            pageContent: text,
            metadata, // e.g., { userId, type: "episodic", sceneId, wordIds }
        });
        await vectorStore.addDocuments([doc]);
    }

    async function semanticSearch({ query, k = 5, preFilter = {} }) {
        // MongoDB Atlas supports pre-filtering
        return vectorStore.similaritySearch(query, k, { preFilter });
    }

    return { vectorStore, addMemoryChunk, semanticSearch, client };
}