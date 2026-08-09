import express from "express";
import {
    normalizeTranscriptReviewRequest,
    TranscriptReviewRequestError,
} from "../services/transcriptReviewContract.js";
import { TranscriptReviewProviderError } from "../services/transcriptReviewBenchmarkService.js";

function roundMs(value) {
    return Math.round(value * 10) / 10;
}

function sendError(res, error) {
    if (error instanceof TranscriptReviewRequestError || error instanceof TranscriptReviewProviderError) {
        return res.status(error.status).json({
            error: error.code || error.name,
            message: error.message,
            provider: error.provider || null,
        });
    }

    return res.status(500).json({
        error: "internal_error",
        message: error?.message || "Unexpected transcript review error",
        provider: null,
    });
}

export function createTranscriptReviewRouter({ service, logger = console } = {}) {
    if (!service?.reviewWithGemini || !service?.reviewWithDeepSeek) {
        throw new Error("createTranscriptReviewRouter requires both transcript review providers");
    }

    const router = express.Router();

    function createHandler(provider, review) {
        return async (req, res) => {
            const apiStartedAt = performance.now();
            try {
                const request = normalizeTranscriptReviewRequest(req.body);
                const result = await review(request);
                const apiMs = roundMs(performance.now() - apiStartedAt);
                result.latencyMs.apiBeforeResponse = apiMs;

                logger.info?.(`[transcriptReview][${provider}]`, {
                    model: result.model,
                    providerMs: result.latencyMs.provider,
                    apiBeforeResponseMs: apiMs,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                });
                return res.json(result);
            } catch (error) {
                logger.error?.(`[transcriptReview][${provider}][error]`, {
                    code: error?.code || error?.name,
                    status: error?.status || 500,
                    message: error?.message,
                });
                return sendError(res, error);
            }
        };
    }

    router.post("/gemini", createHandler("gemini", service.reviewWithGemini));
    router.post("/deepseek", createHandler("deepseek", service.reviewWithDeepSeek));

    return router;
}
