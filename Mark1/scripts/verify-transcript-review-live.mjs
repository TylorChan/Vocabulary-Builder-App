import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { normalizeTranscriptReviewRequest } from "../services/transcriptReviewContract.js";
import { createTranscriptReviewBenchmarkService } from "../services/transcriptReviewBenchmarkService.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, "../.env") });

const sample = JSON.parse(
    await readFile(path.join(scriptDir, "transcript-review-postman.example.json"), "utf8"),
);
const request = normalizeTranscriptReviewRequest(sample);
const service = createTranscriptReviewBenchmarkService();

let failed = false;
const requestedProvider = String(process.argv[2] || "").toLowerCase();
const providers = [
    ["gemini", service.reviewWithGemini],
    ["deepseek", service.reviewWithDeepSeek],
].filter(([provider]) => !requestedProvider || requestedProvider === provider);

if (requestedProvider && providers.length === 0) {
    throw new Error("Provider must be gemini or deepseek");
}

for (const [provider, review] of providers) {
    try {
        const result = await review(request);
        console.log(`[transcriptReview][live][${provider}]`, {
            model: result.model,
            inferenceMode: result.inferenceMode,
            providerMs: result.latencyMs.provider,
            usage: result.usage,
            outcome: result.review.outcome,
            confidence: result.review.confidence,
        });
    } catch (error) {
        failed = true;
        console.error(`[transcriptReview][live][${provider}][failed]`, {
            code: error?.code || error?.name,
            status: error?.status || null,
            message: error?.message,
        });
    }
}

if (failed) process.exitCode = 1;
