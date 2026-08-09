import {
    buildTranscriptReviewPrompt,
    getTranscriptReviewContextStats,
    TURN_EVIDENCE_SCHEMA,
    validateTranscriptReviewResult,
} from "./transcriptReviewContract.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROVIDER_ERROR_CHARS = 1_500;

export class TranscriptReviewProviderError extends Error {
    constructor({ provider, message, status = 502, code = "provider_error", cause }) {
        super(message, { cause });
        this.name = "TranscriptReviewProviderError";
        this.provider = provider;
        this.status = status;
        this.code = code;
    }
}

function normalizeTimeout(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 180_000) : DEFAULT_TIMEOUT_MS;
}

function roundMs(value) {
    return Math.round(value * 10) / 10;
}

function parseJsonText(text, provider) {
    if (!text) {
        throw new TranscriptReviewProviderError({
            provider,
            message: `${provider} returned an empty structured response`,
        });
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new TranscriptReviewProviderError({
            provider,
            message: `${provider} returned invalid JSON: ${error.message}`,
            cause: error,
        });
    }
}

async function parseProviderError(response, provider) {
    let details = "";
    try {
        details = (await response.text()).slice(0, MAX_PROVIDER_ERROR_CHARS);
    } catch {
        details = "Unable to read provider error body";
    }
    throw new TranscriptReviewProviderError({
        provider,
        status: response.status === 408 || response.status === 504 ? 504 : 502,
        code: `provider_http_${response.status}`,
        message: `${provider} request failed with HTTP ${response.status}: ${details}`,
    });
}

async function fetchJson({ fetchImpl, provider, url, init, timeoutMs }) {
    const providerStartedAt = performance.now();
    let response;
    try {
        response = await fetchImpl(url, {
            ...init,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new TranscriptReviewProviderError({
            provider,
            status: isTimeout ? 504 : 502,
            code: isTimeout ? "provider_timeout" : "provider_network_error",
            message: isTimeout
                ? `${provider} did not respond within ${timeoutMs} ms`
                : `${provider} network request failed: ${error.message}`,
            cause: error,
        });
    }

    if (!response.ok) {
        await parseProviderError(response, provider);
    }

    try {
        const payload = await response.json();
        return {
            payload,
            providerMs: roundMs(performance.now() - providerStartedAt),
        };
    } catch (error) {
        throw new TranscriptReviewProviderError({
            provider,
            message: `${provider} returned a non-JSON HTTP response: ${error.message}`,
            cause: error,
        });
    }
}

function extractGeminiText(payload) {
    return (payload?.candidates || [])
        .flatMap((candidate) => candidate?.content?.parts || [])
        .filter((part) => !part?.thought && typeof part?.text === "string")
        .map((part) => part.text)
        .join("")
        .trim();
}

function extractResponsesText(payload) {
    if (typeof payload?.output_text === "string") return payload.output_text.trim();
    return (payload?.output || [])
        .flatMap((item) => item?.content || [])
        .filter((content) => content?.type === "output_text" && typeof content?.text === "string")
        .map((content) => content.text)
        .join("")
        .trim();
}

function normalizeGeminiUsage(payload) {
    const usage = payload?.usageMetadata || {};
    return {
        inputTokens: usage.promptTokenCount ?? null,
        outputTokens: usage.candidatesTokenCount ?? null,
        reasoningTokens: usage.thoughtsTokenCount ?? null,
        totalTokens: usage.totalTokenCount ?? null,
    };
}

function normalizeResponsesUsage(payload) {
    const usage = payload?.usage || {};
    return {
        inputTokens: usage.input_tokens ?? null,
        outputTokens: usage.output_tokens ?? null,
        reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
    };
}

function finalizeResult({ provider, model, inferenceMode, request, prompt, payload, providerMs, review, usage }) {
    try {
        validateTranscriptReviewResult(review, request.reviewContract.activeBeat.targetIds);
    } catch (error) {
        throw new TranscriptReviewProviderError({
            provider,
            code: "invalid_structured_output",
            message: `${provider} returned output that failed local validation: ${error.message}`,
            cause: error,
        });
    }

    return {
        provider,
        model,
        inferenceMode,
        latencyMs: {
            provider: providerMs,
        },
        contextStats: getTranscriptReviewContextStats(request, prompt),
        usage,
        review,
        providerRequestId: payload?.responseId || payload?.id || null,
    };
}

export function createTranscriptReviewBenchmarkService({
    fetchImpl = globalThis.fetch,
    geminiApiKey = globalThis.process?.env?.GEMINI_API_KEY,
    deepseekApiKey = globalThis.process?.env?.DEEPSEEK_API_KEY,
    openaiApiKey = globalThis.process?.env?.OPENAI_API_KEY,
    geminiModel = "gemini-3.6-flash",
    geminiThinkingLevel = "minimal",
    deepseekModel = "deepseek-v4-flash",
    deepseekReasoningEffort = "none",
    openaiModel = "gpt-5.6-terra",
    openaiReasoningEffort = "medium",
    timeoutMs = globalThis.process?.env?.TRANSCRIPT_REVIEW_TIMEOUT_MS,
} = {}) {
    if (typeof fetchImpl !== "function") {
        throw new Error("createTranscriptReviewBenchmarkService requires fetch");
    }

    const requestTimeoutMs = normalizeTimeout(timeoutMs);

    async function reviewWithGemini(request, {
        model = geminiModel,
        thinkingLevel = geminiThinkingLevel,
    } = {}) {
        if (!geminiApiKey) {
            throw new TranscriptReviewProviderError({
                provider: "gemini",
                status: 503,
                code: "missing_api_key",
                message: "GEMINI_API_KEY is not configured",
            });
        }

        const prompt = buildTranscriptReviewPrompt(request);
        const encodedModel = encodeURIComponent(model);
        const { payload, providerMs } = await fetchJson({
            fetchImpl,
            provider: "gemini",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`,
            timeoutMs: requestTimeoutMs,
            init: {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": geminiApiKey,
                },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        thinkingConfig: {
                            thinkingLevel,
                        },
                        responseFormat: {
                            text: {
                                mimeType: "APPLICATION_JSON",
                                schema: TURN_EVIDENCE_SCHEMA,
                            },
                        },
                        maxOutputTokens: 1_200,
                    },
                }),
            },
        });
        const review = parseJsonText(extractGeminiText(payload), "gemini");
        return finalizeResult({
            provider: "gemini",
            model,
            inferenceMode: thinkingLevel,
            request,
            prompt,
            payload,
            providerMs,
            review,
            usage: normalizeGeminiUsage(payload),
        });
    }

    async function reviewWithDeepSeek(request, {
        model = deepseekModel,
        reasoningEffort = deepseekReasoningEffort,
    } = {}) {
        if (!deepseekApiKey) {
            throw new TranscriptReviewProviderError({
                provider: "deepseek",
                status: 503,
                code: "missing_api_key",
                message: "DEEPSEEK_API_KEY is not configured",
            });
        }

        const prompt = buildTranscriptReviewPrompt(request);
        const { payload, providerMs } = await fetchJson({
            fetchImpl,
            provider: "deepseek",
            url: "https://api.deepseek.com/responses",
            timeoutMs: requestTimeoutMs,
            init: {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${deepseekApiKey}`,
                },
                body: JSON.stringify({
                    model,
                    input: prompt,
                    reasoning: {
                        effort: reasoningEffort,
                    },
                    text: {
                        format: {
                            type: "json_schema",
                            name: "review_turn_evidence",
                            schema: TURN_EVIDENCE_SCHEMA,
                        },
                    },
                    max_output_tokens: 1_200,
                }),
            },
        });
        const review = parseJsonText(extractResponsesText(payload), "deepseek");
        return finalizeResult({
            provider: "deepseek",
            model,
            inferenceMode: reasoningEffort,
            request,
            prompt,
            payload,
            providerMs,
            review,
            usage: normalizeResponsesUsage(payload),
        });
    }

    async function reviewWithOpenAI(request, {
        model = openaiModel,
        reasoningEffort = openaiReasoningEffort,
    } = {}) {
        if (!openaiApiKey) {
            throw new TranscriptReviewProviderError({
                provider: "openai",
                status: 503,
                code: "missing_api_key",
                message: "OPENAI_API_KEY is not configured",
            });
        }

        const prompt = buildTranscriptReviewPrompt(request);
        const { payload, providerMs } = await fetchJson({
            fetchImpl,
            provider: "openai",
            url: "https://api.openai.com/v1/responses",
            timeoutMs: requestTimeoutMs,
            init: {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model,
                    input: prompt,
                    reasoning: {
                        effort: reasoningEffort,
                    },
                    text: {
                        format: {
                            type: "json_schema",
                            name: "review_turn_evidence",
                            schema: TURN_EVIDENCE_SCHEMA,
                            strict: true,
                        },
                    },
                    max_output_tokens: 1_200,
                    store: false,
                }),
            },
        });
        const review = parseJsonText(extractResponsesText(payload), "openai");
        return finalizeResult({
            provider: "openai",
            model,
            inferenceMode: reasoningEffort,
            request,
            prompt,
            payload,
            providerMs,
            review,
            usage: normalizeResponsesUsage(payload),
        });
    }

    return {
        reviewWithGemini,
        reviewWithDeepSeek,
        reviewWithOpenAI,
    };
}
