import test from "node:test";
import assert from "node:assert/strict";
import {
    buildExpressionEnrichmentRequest,
    EXPRESSION_MATCH_METHODS,
    findExpressionMatch,
    normalizeExpressionExtraction,
    projectExpressionContextForScene,
    resolveExpressionSource,
} from "../src/utils/expressionContext.js";

const transcriptItems = [
    {
        itemId: "user-topic",
        type: "MESSAGE",
        role: "user",
        title: "In the Marvel universe, who could become the main villain after Kang?",
        status: "DONE",
    },
    {
        itemId: "assistant-anchor",
        type: "MESSAGE",
        role: "assistant",
        title: "Doctor Doom is a serious contender because he can challenge the heroes politically and physically.",
        status: "DONE",
    },
    {
        itemId: "user-save",
        type: "MESSAGE",
        role: "user",
        title: "I want to save contender.",
        status: "DONE",
    },
];

test("anchors an explicitly saved Expression to its prior conversational use", () => {
    const result = resolveExpressionSource({
        expression: "contender",
        transcriptItems,
        requestMessageId: "user-save",
    });

    assert.equal(result.ok, true);
    assert.equal(result.sourceMessageId, "assistant-anchor");
    assert.equal(result.sourceSpeaker, "assistant");
    assert.equal(result.matchMethod, EXPRESSION_MATCH_METHODS.EXACT);
    assert.match(result.sourceExcerpt, /Doctor Doom is a serious contender/);
    assert.deepEqual(result.evidenceMessageIds, ["user-topic", "assistant-anchor"]);
    assert.equal(result.evidenceMessageIds.includes("user-save"), false);
});

test("rejects a save command when the Expression did not occur earlier", () => {
    const result = resolveExpressionSource({
        expression: "dark horse",
        transcriptItems,
        requestMessageId: "user-save",
    });

    assert.deepEqual(result, {
        ok: false,
        reason: "expression_not_in_prior_conversation",
        requestMessageId: "user-save",
    });
});

test("supports a bounded single-token inflection match", () => {
    const result = findExpressionMatch("They are the strongest contenders.", "contender");

    assert.equal(result.matchMethod, EXPRESSION_MATCH_METHODS.LEMMA);
    assert.equal("They are the strongest contenders.".slice(result.start, result.end), "contenders");
});

test("grounds a multi-word Expression when the model changes only its verb tense", () => {
    const items = [
        {
            itemId: "user-meaning",
            type: "MESSAGE",
            role: "user",
            title: "Do you know what does have a voice at work mean?",
            status: "DONE",
        },
        {
            itemId: "assistant-meaning",
            type: "MESSAGE",
            role: "assistant",
            title: "It means being able to share your ideas and concerns at work.",
            status: "DONE",
        },
        {
            itemId: "user-save-expression",
            type: "MESSAGE",
            role: "user",
            title: "I want to save this expression.",
            status: "DONE",
        },
    ];
    const result = resolveExpressionSource({
        expression: "had a voice at work",
        transcriptItems: items,
        requestMessageId: "user-save-expression",
    });

    assert.equal(result.ok, true);
    assert.equal(result.matchMethod, EXPRESSION_MATCH_METHODS.LEMMA);
    assert.equal(result.matchedExpression, "have a voice at work");
    assert.equal(result.sourceMessageId, "user-meaning");
});

test("does not ground a different multi-word Expression through partial overlap", () => {
    const result = findExpressionMatch(
        "I finally have a voice at work.",
        "have a choice at work",
    );

    assert.equal(result, null);
});

test("builds a bounded enrichment request without the user's save command", () => {
    const sourceResolution = resolveExpressionSource({
        expression: "contender",
        transcriptItems,
        requestMessageId: "user-save",
    });
    const request = buildExpressionEnrichmentRequest({
        card: {
            data: {
                expression: "contender",
                requestMessageId: "user-save",
                sourceResolution,
            },
        },
        transcriptItems,
        sessionId: "session-doom",
        userId: "learner@example.com",
    });

    assert.equal(request.source.messageId, "assistant-anchor");
    assert.equal(request.sessionId, "session-doom");
    assert.equal(request.evidenceMessages.length, 2);
    assert.equal(request.evidenceMessages.some((message) => message.messageId === "user-save"), false);
});

test("uses an in-progress save turn as a boundary without treating it as evidence", () => {
    const inProgressTranscript = transcriptItems.map((item) => (
        item.itemId === "user-save" ? {...item, status: "IN_PROGRESS"} : item
    ));
    const result = resolveExpressionSource({
        expression: "contender",
        transcriptItems: inProgressTranscript,
        requestMessageId: "user-save",
    });

    assert.equal(result.ok, true);
    assert.equal(result.sourceMessageId, "assistant-anchor");
    assert.equal(result.evidenceMessageIds.includes("user-save"), false);
});

test("normalizes grounded model output into the persistence contract", () => {
    const sourceResolution = resolveExpressionSource({
        expression: "contender",
        transcriptItems,
        requestMessageId: "user-save",
    });
    const request = buildExpressionEnrichmentRequest({
        card: {data: {expression: "contender", requestMessageId: "user-save", sourceResolution}},
        transcriptItems,
        sessionId: "session-doom",
        userId: "learner@example.com",
    });
    const result = normalizeExpressionExtraction({
        payload: {
            status: "ok",
            reason: "",
            senseDefinition: "A person or group with a strong chance of succeeding or winning.",
            communicativeFunction: "Identify someone as a serious candidate or challenger.",
            usagePattern: "a contender for + noun",
            situationSummary: "During a Marvel discussion, the Teacher Agent described Doctor Doom as a serious contender.",
        },
        request,
        extractorModel: "gpt-5.6-terra",
        validatedAt: "2026-08-02T00:00:00.000Z",
    });

    assert.equal(result.surroundingText, result.learningContext.origin.situationSummary);
    assert.equal(result.learningContext.origin.sourceExcerpt, sourceResolution.sourceExcerpt);
    assert.deepEqual(result.learningContext.origin.evidenceMessageIds, ["user-topic", "assistant-anchor"]);
    assert.equal(result.learningContext.provenance.extractorModel, "gpt-5.6-terra");

    const projection = projectExpressionContextForScene(result.learningContext);
    assert.deepEqual(Object.keys(projection).sort(), [
        "communicativeFunction",
        "senseDefinition",
        "situationSummary",
        "usagePattern",
    ]);
    assert.equal(JSON.stringify(projection).includes("assistant-anchor"), false);
    assert.equal(JSON.stringify(projection).includes("sourceExcerpt"), false);
});

test("rejects a situation summary with an unsupported named entity", () => {
    const sourceResolution = resolveExpressionSource({
        expression: "contender",
        transcriptItems,
        requestMessageId: "user-save",
    });
    const request = buildExpressionEnrichmentRequest({
        card: {data: {expression: "contender", requestMessageId: "user-save", sourceResolution}},
        transcriptItems,
        sessionId: "session-doom",
        userId: "learner@example.com",
    });

    assert.throws(() => normalizeExpressionExtraction({
        payload: {
            status: "ok",
            reason: "",
            senseDefinition: "A serious candidate.",
            communicativeFunction: "Identify someone as a serious candidate.",
            usagePattern: "a contender for + noun",
            situationSummary: "During a Batman discussion, Doctor Doom was described as a serious contender.",
        },
        request,
        extractorModel: "gpt-5.6-terra",
    }), /unsupported entities: Batman/);
});
