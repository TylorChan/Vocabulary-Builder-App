import test from "node:test";
import assert from "node:assert/strict";
import {
    buildExpressionSavePayload,
    canSubmitExpressionCard,
    createExpressionCardData,
    createExpressionSaveSubmissionLock,
    EXPRESSION_CARD_PRIMARY_ACTIONS,
    EXPRESSION_CARD_TYPE,
    EXPRESSION_SAVE_ACTIONS,
    EXPRESSION_SAVE_STATES,
    getBreadcrumbTargetItemId,
    getSavedVocabulary,
    normalizeExpressionCardItems,
    normalizeExpressionProposal,
    transitionExpressionCardItem,
} from "../src/utils/expressionSave.js";
import { buildUiFeedbackInstruction } from "../src/utils/realtimeUiFeedback.js";

const proposal = {
    expression: "out of the blue",
    definition: "Unexpectedly or without warning.",
    usage: "Use it when something happens suddenly and surprises you.",
    sourceText: "His resignation came out of the blue.",
};

function makeCard(saveState = EXPRESSION_SAVE_STATES.PROPOSED) {
    return {
        itemId: "expression-card-1",
        type: EXPRESSION_CARD_TYPE,
        title: proposal.expression,
        data: {
            ...createExpressionCardData(proposal),
            saveState,
        },
    };
}

test("normalizes the tool proposal and enforces required fields", () => {
    assert.deepEqual(normalizeExpressionProposal({
        ...proposal,
        expression: "  out   of the blue ",
    }), proposal);
    assert.throws(
        () => normalizeExpressionProposal({...proposal, definition: ""}),
        /definition is required/,
    );
});

test("defaults new cards to Save and preserves existing-entry Learn Today metadata", () => {
    assert.equal(
        createExpressionCardData(proposal).primaryAction,
        EXPRESSION_CARD_PRIMARY_ACTIONS.SAVE,
    );

    const learnTodayCard = createExpressionCardData(proposal, {
        primaryAction: EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY,
        savedVocabularyId: "vocab-existing",
    });
    assert.equal(learnTodayCard.primaryAction, EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY);
    assert.equal(learnTodayCard.savedVocabularyId, "vocab-existing");
    assert.throws(
        () => createExpressionCardData(proposal, {
            primaryAction: EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY,
        }),
        /existing vocabulary id/,
    );
});

test("moves a card through deferred, saving, and saved states", () => {
    const deferred = transitionExpressionCardItem(makeCard(), {
        type: EXPRESSION_SAVE_ACTIONS.DEFER,
    });
    assert.equal(deferred.data.saveState, EXPRESSION_SAVE_STATES.DEFERRED);
    assert.equal(canSubmitExpressionCard(deferred), true);

    const saving = transitionExpressionCardItem(deferred, {
        type: EXPRESSION_SAVE_ACTIONS.SAVE_START,
    });
    assert.equal(saving.data.saveState, EXPRESSION_SAVE_STATES.SAVING);
    assert.equal(canSubmitExpressionCard(saving), false);

    const saved = transitionExpressionCardItem(saving, {
        type: EXPRESSION_SAVE_ACTIONS.SAVE_SUCCESS,
        savedVocabularyId: "vocab-42",
    });
    assert.equal(saved.data.saveState, EXPRESSION_SAVE_STATES.SAVED);
    assert.equal(saved.data.savedVocabularyId, "vocab-42");
    assert.equal(canSubmitExpressionCard(saved), false);
});

test("keeps a failed card retryable", () => {
    const saving = transitionExpressionCardItem(makeCard(), {
        type: EXPRESSION_SAVE_ACTIONS.SAVE_START,
    });
    const failed = transitionExpressionCardItem(saving, {
        type: EXPRESSION_SAVE_ACTIONS.SAVE_ERROR,
        errorMessage: "Try again.",
    });

    assert.equal(failed.data.saveState, EXPRESSION_SAVE_STATES.ERROR);
    assert.equal(failed.data.errorMessage, "Try again.");
    assert.equal(canSubmitExpressionCard(failed), true);
});

test("allows only one in-flight submission per card", () => {
    const lock = createExpressionSaveSubmissionLock();

    assert.equal(lock.acquire("expression-card-1"), true);
    assert.equal(lock.acquire("expression-card-1"), false);
    assert.equal(lock.has("expression-card-1"), true);
    assert.equal(lock.acquire("expression-card-2"), true);

    lock.release("expression-card-1");
    assert.equal(lock.has("expression-card-1"), false);
    assert.equal(lock.acquire("expression-card-1"), true);
});

test("normalizes an interrupted snapshot save into a retryable error", () => {
    const [restored] = normalizeExpressionCardItems([
        makeCard(EXPRESSION_SAVE_STATES.SAVING),
    ]);

    assert.equal(restored.data.saveState, EXPRESSION_SAVE_STATES.ERROR);
    assert.match(restored.data.errorMessage, /interrupted/i);
    assert.equal(canSubmitExpressionCard(restored), true);
});

test("a malformed saved card cannot prevent the rest of a session from loading", () => {
    const message = {
        itemId: "message-1",
        type: "MESSAGE",
        title: "Keep me",
    };
    const malformedCard = {
        itemId: "expression-card-broken",
        type: EXPRESSION_CARD_TYPE,
        data: {
            expression: "",
            definition: "",
            usage: "",
            sourceText: "",
        },
    };

    assert.deepEqual(normalizeExpressionCardItems([message, malformedCard]), [message]);
});

test("maps an Expression card to the existing vocabulary mutation payload", () => {
    assert.deepEqual(buildExpressionSavePayload(proposal, "user@example.com"), {
        text: proposal.expression,
        definition: proposal.definition,
        example: "",
        exampleTrans: "",
        realLifeDef: proposal.usage,
        surroundingText: proposal.sourceText,
        videoTitle: "Voice conversation",
        sourceVideoUrl: null,
        userId: "user@example.com",
    });
});

test("maps validated enrichment into one atomic vocabulary payload", () => {
    const learningContext = {
        schemaVersion: 1,
        discoveryMode: "USER_EXPLICIT_SAVE",
        meaning: {
            senseDefinition: "A serious candidate for a role or outcome.",
            communicativeFunction: "Identify someone as a strong candidate.",
            usagePattern: "a contender for + noun",
        },
        origin: {
            situationSummary: "During a Marvel discussion, Doctor Doom was described as a serious candidate.",
        },
        provenance: {validated: true},
    };
    const enrichment = {
        definition: learningContext.meaning.senseDefinition,
        usage: "Use it to identify someone as a strong candidate.",
        surroundingText: learningContext.origin.situationSummary,
        learningContext,
    };

    assert.deepEqual(
        buildExpressionSavePayload({...proposal, expression: "contender"}, "user@example.com", enrichment),
        {
            text: "contender",
            definition: enrichment.definition,
            example: "",
            exampleTrans: "",
            realLifeDef: enrichment.usage,
            surroundingText: enrichment.surroundingText,
            videoTitle: "Voice conversation",
            sourceVideoUrl: null,
            userId: "user@example.com",
            learningContext,
        },
    );
});

test("requires the GraphQL result to contain the saved vocabulary id", () => {
    assert.equal(getSavedVocabulary({
        saveVocabulary: {id: "vocab-42", text: proposal.expression},
    }).id, "vocab-42");
    assert.throws(() => getSavedVocabulary({saveVocabulary: null}), /vocabulary id/);
});

test("resolves Breadcrumb targets only when a card target exists", () => {
    assert.equal(getBreadcrumbTargetItemId({data: {targetItemId: "expression-card-1"}}), "expression-card-1");
    assert.equal(getBreadcrumbTargetItemId({data: {}}), null);
});

test("builds truthful, concise-style UI feedback instructions with a resume anchor", () => {
    const instruction = buildUiFeedbackInstruction({
        kind: "saved",
        expression: proposal.expression,
        mode: "REVIEW",
        resumeAnchor: "We were comparing two ways to explain the tradeoff.",
    });

    assert.match(instruction, /saved successfully/);
    assert.match(instruction, /12 words or fewer/);
    assert.match(instruction, /lightly sarcastic/);
    assert.match(instruction, /current review scene/);
    assert.match(instruction, /without repeating completed sentences/);

    const learnTodayInstruction = buildUiFeedbackInstruction({
        kind: "learn_today",
        expression: proposal.expression,
        mode: "FREE_CHAT",
    });
    assert.match(learnTodayInstruction, /today's review queue/);
    assert.doesNotMatch(learnTodayInstruction, /saved successfully to the Word List/);
});
