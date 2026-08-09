import assert from "node:assert/strict";
import test from "node:test";
import {
    buildExpressionAssistQuery,
    createExpressionAssistService,
    normalizeExpressionAssistDecision,
    validateExpressionAssistRequest,
} from "../services/expressionAssistService.js";
import {
    detectExpressionRetrievalScope,
    EXPRESSION_RETRIEVAL_SCOPES,
    isExplicitExpressionRequest,
} from "../src/utils/expressionAssistIntent.js";
import {
    buildExpressionRetrievalText,
    executeMongoReadWithRetry,
    isRetryableMongoReadError,
    reciprocalRankFuse,
    resolveExpressionRetrievalDeadlineMs,
    resolveExpressionRetrievalMaxAttempts,
    resolveExpressionRetrievalTimeoutMs,
    resolveMongoSocksProxyOptions,
    tokenizeRetrievalText,
} from "../services/expressionRetrievalStore.js";

function request() {
    return {
        assistRequestId: "assist-1",
        userId: "user-a",
        sessionId: "session-a",
        turnId: "u-2",
        turnRevision: 2,
        mode: "FREE_CHAT",
        trigger: {
            reasonCode: "CIRCUMLOCUTION",
            intendedMeaning: "Doctor Doom has a realistic chance to win.",
            communicativeFunction: "Describe someone as a credible competitor.",
            situation: "A casual Marvel discussion.",
        },
        context: {
            messages: [
                { messageId: "u-1", role: "user", text: "Who could win?" },
                { messageId: "a-1", role: "assistant", text: "Which villain has a real shot?" },
                {
                    messageId: "u-2",
                    role: "user",
                    text: "Doctor Doom is one of the people who really has a chance and can compete for it.",
                },
            ],
        },
    };
}

function response(payload) {
    return {
        output_text: JSON.stringify(payload),
        usage: { input_tokens: 100, output_tokens: 40 },
    };
}

const candidate = {
    vocabularyId: "v-1",
    expression: "contender",
    definition: "A person with a realistic chance of winning.",
    usage: "Describe someone as a credible competitor.",
    usagePattern: "Doctor Doom is a serious contender.",
    situationSummary: "Comparing Marvel villains.",
};
const silentLogger = { info() {}, warn() {} };

test("builds a bounded communicative query from three trusted messages", () => {
    const validated = validateExpressionAssistRequest(request());
    const query = buildExpressionAssistQuery(validated);
    assert.match(query, /Natural spoken English/);
    assert.match(query, /Doctor Doom/);
    assert.doesNotMatch(query, /assist-1/);
});

test("recognizes natural explicit requests beyond How do I say", () => {
    const naturalRequests = [
        "Do you know any phrases that can describe this situation?",
        "Do you know any word that I can use?",
        "Is there a slang for this situation that I can use?",
        "Can you suggest some other phrases or expressions?",
        "Could you give me some new word that can describe this situation?",
        "Could you suggest a more natural expression for this?",
        "Could you suggest one concise expression for this situation?",
        "I mean, did you have any, I mean, word or expression that I can use to describe this kind of situation?",
        "Is there any, you know, phrase in my vocabulary list that I can use?",
        "Um, do you have another phrase I could use here?",
        "What can I call this?",
    ];

    naturalRequests.forEach((text) => assert.equal(isExplicitExpressionRequest(text), true, text));
    assert.equal(isExplicitExpressionRequest("That phrase sounds useful in this situation."), false);
    assert.equal(isExplicitExpressionRequest("Did you have any time yesterday?"), false);
    assert.equal(isExplicitExpressionRequest("I mean, this expression sounds useful."), false);
});

test("treats saved-list wording as a retrieval scope modifier", () => {
    assert.equal(
        detectExpressionRetrievalScope("Is there a phrase in my vocabulary list that I can use?"),
        EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY,
    );
    assert.equal(
        detectExpressionRetrievalScope("Do I have a saved expression for this?"),
        EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY,
    );
    assert.equal(
        detectExpressionRetrievalScope("Do you know a natural phrase for this?"),
        EXPRESSION_RETRIEVAL_SCOPES.PREFER_EXISTING,
    );
});

test("defaults requests to prefer existing and validates existing-only scope", () => {
    assert.equal(
        validateExpressionAssistRequest(request()).trigger.retrievalScope,
        EXPRESSION_RETRIEVAL_SCOPES.PREFER_EXISTING,
    );
    const scoped = request();
    scoped.trigger.retrievalScope = EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY;
    assert.equal(
        validateExpressionAssistRequest(scoped).trigger.retrievalScope,
        EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY,
    );
});

test("projects stored fields for REUSE_EXISTING instead of accepting model copies", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [candidate], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => response({
                    action: "REUSE_EXISTING",
                    selectedVocabularyId: "v-1",
                    expression: "poisoned value",
                    definition: null,
                    usage: null,
                    recast: "Doctor Doom is a serious contender.",
                    reasonCode: "EXISTING_FIT",
                }),
            },
        },
        logger: silentLogger,
    });
    const result = await service.decide(request());
    assert.equal(result.action, "REUSE_EXISTING");
    assert.equal(result.expression, "contender");
    assert.equal(result.definition, candidate.definition);
});

test("timeoutMs zero waits for the decision instead of failing open", async () => {
    let modelCompleted = false;
    const service = createExpressionAssistService({
        enabled: true,
        timeoutMs: 0,
        retrievalStore: { search: async () => ({ candidates: [candidate], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 20));
                    modelCompleted = true;
                    return response({
                        action: "REUSE_EXISTING",
                        selectedVocabularyId: "v-1",
                        expression: null,
                        definition: null,
                        usage: null,
                        recast: "Doctor Doom is a serious contender.",
                        reasonCode: "EXISTING_FIT",
                    });
                },
            },
        },
        logger: silentLogger,
    });

    const result = await service.decide(request());

    assert.equal(modelCompleted, true);
    assert.equal(result.action, "REUSE_EXISTING");
});

test("warm preconnects the retrieval store", async () => {
    let connected = false;
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: {
            search: async () => ({ candidates: [], diagnostics: {} }),
            connect: async () => {
                connected = true;
            },
        },
        openaiClient: { responses: { create: async () => response({}) } },
        logger: silentLogger,
    });

    const warmed = await service.warm();

    assert.equal(connected, true);
    assert.equal(warmed, service);
});

test("warm prefers the store's full read-path warmup", async () => {
    let warmedStore = false;
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: {
            search: async () => ({ candidates: [], diagnostics: {} }),
            warm: async () => {
                warmedStore = true;
            },
            connect: async () => {
                throw new Error("connect-only warmup should not run");
            },
        },
        openaiClient: { responses: { create: async () => response({}) } },
        logger: silentLogger,
    });

    await service.warm();

    assert.equal(warmedStore, true);
});

test("creates grounded proactive metadata for SUGGEST_NEW", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => response({
                    action: "SUGGEST_NEW",
                    selectedVocabularyId: null,
                    expression: "dark horse",
                    definition: "An unexpected competitor who may win.",
                    usage: "Use it when someone has a surprising chance of success.",
                    recast: "Doctor Doom could be the dark horse.",
                    reasonCode: "NEW_EXPRESSION_FIT",
                }),
            },
        },
        logger: silentLogger,
    });
    const result = await service.decide(request());
    assert.equal(result.action, "SUGGEST_NEW");
    assert.equal(result.learningContext.discoveryMode, "AGENT_SUGGESTED_GAP");
    assert.equal(result.learningContext.gap.gapType, "CIRCUMLOCUTION");
    assert.deepEqual(result.learningContext.gap.triggerEvidenceMessageIds, ["u-1", "a-1", "u-2"]);
});

test("existing-only requests skip the judge when no saved candidates exist", async () => {
    let modelCalls = 0;
    const scopedRequest = request();
    scopedRequest.trigger.retrievalScope = EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY;
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => {
                    modelCalls += 1;
                    return response({});
                },
            },
        },
        logger: silentLogger,
    });

    const result = await service.decide(scopedRequest, { policyAuthority: "graph" });

    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnostics.gate, "existing_only_no_match");
    assert.equal(modelCalls, 0);
});

test("existing-only requests cannot accept a new model suggestion", () => {
    const scopedRequest = validateExpressionAssistRequest({
        ...request(),
        trigger: {
            ...request().trigger,
            retrievalScope: EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY,
        },
    });
    const result = normalizeExpressionAssistDecision({
        payload: {
            action: "SUGGEST_NEW",
            selectedVocabularyId: null,
            expression: "dark horse",
            definition: "An unexpected competitor.",
            usage: "Use it when someone may win unexpectedly.",
            recast: "Doctor Doom could be the dark horse.",
            reasonCode: "NEW_EXPRESSION_FIT",
        },
        candidates: [],
        request: scopedRequest,
        model: "gpt-5.6-terra",
    });

    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnostics.gate, "existing_only_no_match");
});

test("does not bypass saved-expression deduplication when retrieval is unavailable", async () => {
    let modelCalls = 0;
    const warnings = [];
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: {
            search: async () => {
                throw new Error("Server selection timed out after 10000 ms");
            },
        },
        openaiClient: {
            responses: {
                create: async () => {
                    modelCalls += 1;
                    return response({
                        action: "SUGGEST_NEW",
                        selectedVocabularyId: null,
                        expression: "dark horse",
                        definition: "An unexpected competitor who may win.",
                        usage: "Use it when someone has a surprising chance of success.",
                        recast: "Doctor Doom could be the dark horse.",
                        reasonCode: "NEW_EXPRESSION_FIT",
                    });
                },
            },
        },
        logger: {
            info() {},
            warn(...args) {
                warnings.push(args);
            },
        },
    });

    const result = await service.decide(request());

    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnostics.gate, "provider_failure");
    assert.equal(modelCalls, 0);
    assert.match(warnings[0][0], /retrieval unavailable/);
});

test("bounds derived learning metadata without discarding a valid new Expression", () => {
    const rawRequest = request();
    rawRequest.trigger.situation = "A manager asks for a direct timeline answer while the learner keeps describing blockers, dependencies, completed work, schedule risks, and team constraints instead of answering the actual question clearly.";
    const result = normalizeExpressionAssistDecision({
        payload: {
            action: "SUGGEST_NEW",
            selectedVocabularyId: null,
            expression: "buy time",
            definition: "Delay giving a direct answer or taking action so that you have additional time to decide what to do or how to respond in a difficult situation.",
            usage: "Use it when someone intentionally avoids an immediate answer because they need more time to think, prepare, negotiate, or decide what they should say next.",
            recast: "I was buying time instead of answering my manager.",
            reasonCode: "NEW_EXPRESSION_FIT",
        },
        candidates: [],
        request: validateExpressionAssistRequest(rawRequest),
        model: "gpt-5.6-terra",
    });

    assert.equal(result.action, "SUGGEST_NEW");
    assert.ok(result.learningContext.meaning.senseDefinition.length <= 140);
    assert.ok(result.learningContext.meaning.communicativeFunction.length <= 120);
    assert.ok(result.learningContext.origin.situationSummary.length <= 180);
});

test("accepts a concrete noun in place of an Expression pattern placeholder", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => response({
                    action: "SUGGEST_NEW",
                    selectedVocabularyId: null,
                    expression: "walk on eggshells around someone",
                    definition: "Act very carefully to avoid upsetting a person.",
                    usage: "Use it when another person's reactions make you cautious.",
                    recast: "I feel like I'm walking on eggshells around my coworker.",
                    reasonCode: "NEW_EXPRESSION_FIT",
                }),
            },
        },
        logger: silentLogger,
    });

    const result = await service.decide(request());
    assert.equal(result.action, "SUGGEST_NEW");
    assert.equal(result.expression, "walk on eggshells around someone");
});

test("accepts a grounded single-word Expression", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => response({
                    action: "SUGGEST_NEW",
                    selectedVocabularyId: null,
                    expression: "volatile",
                    definition: "Likely to become angry or change mood suddenly.",
                    usage: "Use it when someone's reactions are unpredictable and intense.",
                    recast: "My coworker is volatile, so I choose my words carefully.",
                    reasonCode: "NEW_EXPRESSION_FIT",
                }),
            },
        },
        logger: silentLogger,
    });

    const result = await service.decide(request());
    assert.equal(result.action, "SUGGEST_NEW");
    assert.equal(result.expression, "volatile");
});

test("rejects a new Expression when its recast is unrelated", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => response({
                    action: "SUGGEST_NEW",
                    selectedVocabularyId: null,
                    expression: "walk on eggshells around someone",
                    definition: "Act very carefully to avoid upsetting a person.",
                    usage: "Use it when another person's reactions make you cautious.",
                    recast: "My coworker gets angry very easily.",
                    reasonCode: "NEW_EXPRESSION_FIT",
                }),
            },
        },
        logger: silentLogger,
    });

    const result = await service.decide(request());
    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnostics.gate, "invalid_model_output");
});

test("lets LangGraph own cooldown policy without weakening the V1 default", async () => {
    let modelCalls = 0;
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => {
                    modelCalls += 1;
                    return response({
                        action: "SUGGEST_NEW",
                        selectedVocabularyId: null,
                        expression: modelCalls === 1 ? "dark horse" : "walk on eggshells",
                        definition: "A useful natural expression.",
                        usage: "Use it when the current situation fits.",
                        recast: modelCalls === 1
                            ? "Doctor Doom could be the dark horse."
                            : "I have to walk on eggshells around him.",
                        reasonCode: "NEW_EXPRESSION_FIT",
                    });
                },
            },
        },
        logger: silentLogger,
    });
    const first = await service.decide(request(), { policyAuthority: "graph" });
    const nextRequest = {
        ...request(),
        assistRequestId: "assist-2",
        turnId: "u-3",
        turnRevision: 3,
        trigger: {
            reasonCode: "CIRCUMLOCUTION",
            intendedMeaning: "I must speak carefully because my coworker gets angry easily.",
            communicativeFunction: "Describe being cautious around a volatile person.",
            situation: "A conversation about a difficult coworker.",
        },
        context: {
            messages: [{
                messageId: "u-3",
                role: "user",
                text: "I choose every word carefully because even a small comment might upset him.",
            }],
        },
    };
    const second = await service.decide(nextRequest, { policyAuthority: "graph" });

    assert.equal(first.action, "SUGGEST_NEW");
    assert.equal(second.action, "SUGGEST_NEW");
    assert.equal(second.expression, "walk on eggshells");
    assert.equal(modelCalls, 2);
});

test("accepts SEMANTIC_GAP only from LangGraph authority", async () => {
    let modelCalls = 0;
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [candidate], diagnostics: {} }) },
        openaiClient: {
            responses: {
                create: async () => {
                    modelCalls += 1;
                    return response({
                        action: "REUSE_EXISTING",
                        selectedVocabularyId: "v-1",
                        expression: null,
                        definition: null,
                        usage: null,
                        recast: "Doctor Doom is a serious contender.",
                        reasonCode: "EXISTING_FIT",
                    });
                },
            },
        },
        logger: silentLogger,
    });
    const semanticRequest = {
        ...request(),
        trigger: {
            reasonCode: "SEMANTIC_GAP",
            gapType: "LEXICAL_GAP",
            intendedMeaning: "Doctor Doom has a realistic chance to win.",
            communicativeFunction: "Describe someone as a credible competitor.",
            situation: "A casual Marvel discussion.",
        },
    };

    const untrusted = await service.decide(semanticRequest);
    const trusted = await service.decide(semanticRequest, { policyAuthority: "graph" });

    assert.equal(untrusted.action, "NO_ACTION");
    assert.equal(untrusted.diagnostics.gate, "semantic_gap_requires_graph_authority");
    assert.equal(trusted.action, "REUSE_EXISTING");
    assert.equal(modelCalls, 1);
});

test("fails malformed structured output open to NO_ACTION", async () => {
    const service = createExpressionAssistService({
        enabled: true,
        retrievalStore: { search: async () => ({ candidates: [], diagnostics: {} }) },
        openaiClient: { responses: { create: async () => response({ action: "SUGGEST_NEW" }) } },
        logger: silentLogger,
    });
    const result = await service.decide(request());
    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnostics.gate, "invalid_model_output");
});

test("retrieval helpers keep data bounded and fuse independent ranks", () => {
    const retrievalText = buildExpressionRetrievalText({
        text: "contender",
        definition: "A likely competitor.",
        surroundingText: "Doctor Doom might win.",
    });
    assert.ok(retrievalText.length <= 1_000);
    assert.ok(tokenizeRetrievalText(retrievalText).includes("contender"));
    const fused = reciprocalRankFuse([
        [{ vocabularyId: "a" }, { vocabularyId: "b" }],
        [{ vocabularyId: "b" }, { vocabularyId: "c" }],
    ]);
    assert.equal(fused[0].vocabularyId, "b");
});

test("maps a SOCKS5 URL to MongoClient proxy options", () => {
    assert.deepEqual(resolveMongoSocksProxyOptions("socks5://127.0.0.1:7890"), {
        proxyHost: "127.0.0.1",
        proxyPort: 7890,
    });
    assert.deepEqual(resolveMongoSocksProxyOptions(""), {});
});

test("bounds Expression retrieval operation timeouts", () => {
    assert.equal(resolveExpressionRetrievalTimeoutMs(""), 6_000);
    assert.equal(resolveExpressionRetrievalTimeoutMs("250"), 1_000);
    assert.equal(resolveExpressionRetrievalTimeoutMs("9000"), 9_000);
    assert.equal(resolveExpressionRetrievalTimeoutMs("90000"), 30_000);
    assert.equal(resolveExpressionRetrievalTimeoutMs("invalid"), 6_000);
    assert.equal(resolveExpressionRetrievalDeadlineMs("20000"), 20_000);
    assert.equal(resolveExpressionRetrievalDeadlineMs("90000"), 30_000);
    assert.equal(resolveExpressionRetrievalMaxAttempts("3"), 3);
    assert.equal(resolveExpressionRetrievalMaxAttempts("9"), 3);
});

test("retries transient Mongo reads and succeeds on the third total attempt", async () => {
    let calls = 0;
    let clock = 0;
    const result = await executeMongoReadWithRetry(async () => {
        calls += 1;
        if (calls < 3) {
            const error = new Error("Timed out during socket read");
            error.name = "MongoNetworkTimeoutError";
            throw error;
        }
        return "recovered";
    }, {
        stage: "index_check",
        maxAttempts: 3,
        deadlineAt: 20_000,
        now: () => clock,
        random: () => 0,
        sleep: async (delayMs) => {
            clock += delayMs;
        },
        logger: silentLogger,
    });

    assert.equal(result, "recovered");
    assert.equal(calls, 3);
});

test("does not retry deterministic Mongo read failures", async () => {
    let calls = 0;
    await assert.rejects(() => executeMongoReadWithRetry(async () => {
        calls += 1;
        const error = new Error("Authentication failed");
        error.name = "MongoServerError";
        error.code = 18;
        throw error;
    }, {
        stage: "index_check",
        maxAttempts: 3,
        deadlineAt: Date.now() + 20_000,
        logger: silentLogger,
    }), /Authentication failed/);
    assert.equal(calls, 1);
});

test("stops after three failed transient Mongo read attempts", async () => {
    let calls = 0;
    let clock = 0;
    await assert.rejects(() => executeMongoReadWithRetry(async () => {
        calls += 1;
        const error = new Error("Timed out during socket read");
        error.name = "MongoNetworkTimeoutError";
        throw error;
    }, {
        stage: "source_lookup",
        maxAttempts: 3,
        deadlineAt: 20_000,
        now: () => clock,
        random: () => 0,
        sleep: async (delayMs) => {
            clock += delayMs;
        },
        logger: silentLogger,
    }), (error) => (
        error.name === "MongoNetworkTimeoutError"
        && error.retrievalStage === "source_lookup"
        && error.retrievalAttempt === 3
    ));
    assert.equal(calls, 3);
});

test("does not begin a Mongo read after the shared retrieval deadline", async () => {
    let calls = 0;
    await assert.rejects(() => executeMongoReadWithRetry(async () => {
        calls += 1;
    }, {
        stage: "index_check",
        deadlineAt: 500,
        now: () => 500,
        logger: silentLogger,
    }), (error) => error.code === "EXPRESSION_RETRIEVAL_DEADLINE");
    assert.equal(calls, 0);
});

test("classifies only transient Mongo read failures as retryable", () => {
    assert.equal(isRetryableMongoReadError({
        name: "MongoNetworkTimeoutError",
        message: "Timed out during socket read",
    }), true);
    assert.equal(isRetryableMongoReadError({
        name: "MongoServerError",
        code: 13,
        message: "not authorized",
    }), false);
});
