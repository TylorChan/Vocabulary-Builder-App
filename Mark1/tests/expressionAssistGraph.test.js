import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import {
    EXPRESSION_ASSIST_EVENT_TYPES,
    EXPRESSION_ASSIST_FLOW_VERSION,
    EXPRESSION_ASSIST_STATE_SCHEMA_VERSION,
} from "../orchestration/expressionAssistGraph/expressionAssistConstants.js";
import {
    ExpressionAssistGraphService,
} from "../orchestration/expressionAssistGraph/expressionAssistGraphService.js";
import { migrateExpressionAssistState } from "../orchestration/expressionAssistGraph/expressionAssistState.js";
import {
    EXPRESSION_GAP_DECISIONS,
    EXPRESSION_GAP_EVIDENCE,
    EXPRESSION_GAP_TYPES,
} from "../services/expressionGapGateService.js";

function createHarness({
    decision = null,
    decide = null,
    semanticGateEnabled = false,
    gateDecision = null,
    evaluateGate = null,
} = {}) {
    const calls = [];
    const gateCalls = [];
    const service = new ExpressionAssistGraphService({
        checkpointer: new MemorySaver(),
        decisionService: {
            decide: async (request) => {
                calls.push(request);
                if (decide) return decide(request);
                return decision || {
                    action: "SUGGEST_NEW",
                    expression: "out of the blue",
                    definition: "Unexpectedly and without warning.",
                    usage: "Use it when something happens with no advance sign.",
                    recast: "His message came out of the blue.",
                    learningContext: { discoveryMode: "AGENT_SUGGESTED_GAP" },
                };
            },
        },
        gapService: {
            enabled: semanticGateEnabled,
            evaluate: async (request) => {
                gateCalls.push(request);
                if (evaluateGate) return evaluateGate(request);
                return gateDecision || {
                    decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP,
                    gapType: EXPRESSION_GAP_TYPES.CIRCUMLOCUTION,
                    meaningClear: true,
                    materialGain: true,
                    evidence: [EXPRESSION_GAP_EVIDENCE.CIRCUMLOCUTION],
                    intendedMeaning: "Something happened unexpectedly.",
                    communicativeFunction: "Describe an unexpected event naturally.",
                    situation: "A casual conversation about a surprising event.",
                    confidence: 0.94,
                    telemetry: { decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP, totalMs: 42 },
                };
            },
        },
        now: () => new Date("2026-08-07T08:00:00.000Z"),
    });
    return { service, calls, gateCalls };
}

async function startHarnessRun(service) {
    return service.startRun({
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        assistRunId: "assist-run-1",
        eventId: "start-1",
    });
}

function completedTurn(started, overrides = {}) {
    return {
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "turn-event-1",
        type: EXPRESSION_ASSIST_EVENT_TYPES.FREE_CHAT_TURN_COMPLETED,
        expectedRevision: started.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "turn-1",
            transcript: "Yesterday a friend I had not spoken to for five years sent me a message with no warning, no earlier signal, and no reason for me to expect it.",
            contextMessages: [{
                messageId: "assistant-1",
                role: "assistant",
                text: "What surprised you yesterday?",
            }],
            hasPendingProactiveCard: false,
        },
        ...overrides,
    };
}

test("ordinary Free Chat turns use the deterministic fast path", async () => {
    const { service, calls } = createHarness();
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "ordinary-turn",
            transcript: "I watched that movie yesterday and liked it.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(result.applied, true);
    assert.equal(result.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(result.controlPacket.responseDirective.gate, "ordinary_turn");
    assert.equal(result.controlPacket.effects.length, 0);
    assert.equal(calls.length, 0);
});

test("a meaningful fluent turn uses the semantic gate without calling retrieval", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
            gapType: EXPRESSION_GAP_TYPES.NONE,
            meaningClear: true,
            materialGain: false,
            evidence: [],
            intendedMeaning: null,
            communicativeFunction: null,
            situation: null,
            confidence: 0.93,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.NO_GAP, totalMs: 38 },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "fluent-turn",
            transcript: "I watched that movie yesterday and really enjoyed the final scene.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 1);
    assert.equal(calls.length, 0);
    assert.equal(result.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(result.controlPacket.responseDirective.gate, "semantic_no_gap");
    assert.equal(result.result.semanticGateMs, 38);
});

test("an explicit Expression request bypasses the semantic gap gate and uses prior learner context", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
            gapType: EXPRESSION_GAP_TYPES.NONE,
            meaningClear: true,
            materialGain: false,
            evidence: [],
            intendedMeaning: null,
            communicativeFunction: null,
            situation: null,
            confidence: 0.95,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.NO_GAP, totalMs: 40 },
        },
        decision: {
            action: "SUGGEST_NEW",
            expression: "beat around the bush",
            definition: "Avoid saying the main point directly.",
            usage: "Use it when someone talks around a difficult answer.",
            recast: "I kept beating around the bush instead of answering him.",
            learningContext: { discoveryMode: "AGENT_SUGGESTED_GAP" },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "explicit-expression-request",
            transcript: "Could you suggest some new some expressions for this situation?",
            contextMessages: [
                {
                    messageId: "manager-story",
                    role: "user",
                    text: "My manager asked whether the project would finish on time, but I mentioned every small problem and never answered his actual question.",
                },
                {
                    messageId: "assistant-advice",
                    role: "assistant",
                    text: "Answer the core question first, then explain the risks.",
                },
            ],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].trigger.reasonCode, "ASKED_HOW_TO_SAY");
    assert.equal(calls[0].trigger.retrievalScope, "PREFER_EXISTING");
    assert.match(calls[0].trigger.intendedMeaning, /never answered his actual question/);
    assert.equal(result.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(result.controlPacket.effects[0].payload.proposal.expression, "beat around the bush");
});

test("a filler-heavy have-you-got request bypasses the gap gate and creates a Learn today card", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.NO_GAP,
            gapType: EXPRESSION_GAP_TYPES.NONE,
            meaningClear: true,
            materialGain: false,
            evidence: [],
            intendedMeaning: null,
            communicativeFunction: null,
            situation: null,
            confidence: 0.95,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.NO_GAP, totalMs: 40 },
        },
        decision: {
            action: "REUSE_EXISTING",
            selectedVocabularyId: "vocab-out-of-the-blue",
            expression: "out of the blue",
            definition: "Unexpectedly and without warning.",
            usage: "Use it when something happens with no advance sign.",
            recast: "The message came out of the blue.",
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "filler-heavy-expression-request",
            transcript: "I mean, did you have any, I mean, word or expression that I can use to describe this kind of situation?",
            contextMessages: [
                {
                    messageId: "unexpected-message-story",
                    role: "user",
                    text: "An old friend messaged me after five years with no warning at all.",
                },
                {
                    messageId: "assistant-context",
                    role: "assistant",
                    text: "That must have been surprising.",
                },
            ],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].trigger.reasonCode, "ASKED_HOW_TO_SAY");
    assert.match(calls[0].trigger.intendedMeaning, /old friend messaged me/);
    assert.equal(result.controlPacket.responseDirective.action, "REUSE_EXISTING");
    assert.equal(result.controlPacket.effects.length, 1);
    assert.equal(result.controlPacket.effects[0].payload.metadata.primaryAction, "LEARN_TODAY");
    assert.equal(
        result.controlPacket.effects[0].payload.metadata.savedVocabularyId,
        "vocab-out-of-the-blue",
    );
});

test("an explicit Word List request uses existing-only retrieval without a new intent", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        decision: {
            action: "REUSE_EXISTING",
            selectedVocabularyId: "vocab-out-of-the-blue",
            expression: "out of the blue",
            definition: "Unexpectedly and without warning.",
            usage: "Use it when something happens with no advance sign.",
            recast: "The message came out of the blue.",
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "saved-list-request",
            transcript: "Is there any, you know, phrase in my vocabulary list that I can use?",
            contextMessages: [{
                messageId: "unexpected-message-story",
                role: "user",
                text: "An old friend messaged me after five years with no warning at all.",
            }],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].trigger.reasonCode, "ASKED_HOW_TO_SAY");
    assert.equal(calls[0].trigger.retrievalScope, "EXISTING_ONLY");
    assert.equal(result.controlPacket.responseDirective.action, "REUSE_EXISTING");
});

test("an existing-only no-match stays grounded and does not suggest a new Expression", async () => {
    const { service } = createHarness({
        decision: {
            action: "NO_ACTION",
            diagnostics: { gate: "existing_only_no_match" },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "saved-list-no-match",
            transcript: "Do I have a saved expression in my Word List for this?",
            contextMessages: [{
                messageId: "situation",
                role: "user",
                text: "I need to answer my manager without avoiding the main point.",
            }],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(result.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(result.controlPacket.responseDirective.gate, "existing_only_no_match");
    assert.match(result.controlPacket.responseDirective.instruction, /no saved Expression/);
    assert.equal(result.controlPacket.effects.length, 0);
});

test("a clear implicit short expression gap reaches retrieval through graph-only authority", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP,
            gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
            meaningClear: true,
            materialGain: true,
            evidence: [EXPRESSION_GAP_EVIDENCE.LEXICAL_MISMATCH],
            intendedMeaning: "Someone appeared unexpectedly.",
            communicativeFunction: "Describe a sudden unexpected appearance.",
            situation: "A casual story about meeting someone unexpectedly.",
            confidence: 0.78,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP, totalMs: 51 },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "implicit-gap-turn",
            transcript: "He appeared with no signs and I could not expect him.",
            contextMessages: [{
                messageId: "assistant-context",
                role: "assistant",
                text: "What happened when you entered the restaurant?",
            }],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].trigger.reasonCode, "SEMANTIC_GAP");
    assert.equal(calls[0].trigger.gapType, "LEXICAL_GAP");
    assert.equal(calls[0].trigger.intendedMeaning, "Someone appeared unexpectedly.");
    assert.equal(result.controlPacket.responseDirective.action, "SUGGEST_NEW");
});

test("a minor form issue produces one soft recast without retrieval or a card", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
            gapType: EXPRESSION_GAP_TYPES.MINOR_FORM_ISSUE,
            meaningClear: true,
            materialGain: false,
            evidence: [EXPRESSION_GAP_EVIDENCE.MINOR_FORM_ERROR],
            intendedMeaning: null,
            communicativeFunction: null,
            situation: null,
            confidence: 0.89,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP, totalMs: 44 },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "minor-form-turn",
            transcript: "My coworker get angry whenever someone disagrees with him.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(gateCalls.length, 1);
    assert.equal(calls.length, 0);
    assert.equal(result.controlPacket.responseDirective.action, "SOFT_RECAST");
    assert.equal(result.controlPacket.responseDirective.gate, "default_soft_recast");
    assert.equal(result.controlPacket.effects.length, 0);
});

test("an uncertain meaning asks one clarification and persists bounded context", async () => {
    const { service, calls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
            gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
            meaningClear: false,
            materialGain: true,
            evidence: [
                EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE,
                EXPRESSION_GAP_EVIDENCE.LEXICAL_MISMATCH,
            ],
            intendedMeaning: "The clock tilts so one side is lower than the other.",
            communicativeFunction: "Describe an object that is visibly tilted to one side.",
            situation: "Describing a badly hung clock.",
            confidence: 0.73,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP, totalMs: 48 },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "unclear-clock-turn",
            transcript: "The clock is hanging unevenly, with one side sitting lower, but that word feels wrong.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const state = await service.getState(started.assistRunId);

    assert.equal(calls.length, 0);
    assert.equal(result.controlPacket.responseDirective.action, "CLARIFY");
    assert.equal(result.controlPacket.effects.length, 0);
    assert.equal(state.pendingClarification.sourceTurnId, "unclear-clock-turn");
    assert.match(state.pendingClarification.originalAttempt, /clock is hanging unevenly/);
    assert.equal(state.pendingClarification.evidence.length, 2);
});

test("leaving Free Chat clears pending clarification without touching durable card state", async () => {
    const { service } = createHarness({
        semanticGateEnabled: true,
        gateDecision: {
            decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
            gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
            meaningClear: false,
            materialGain: true,
            evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
            intendedMeaning: "The clock tilts so one side is lower.",
            communicativeFunction: "Describe an object tilted to one side.",
            situation: "Describing a badly hung clock.",
            confidence: 0.72,
            telemetry: { decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP, totalMs: 43 },
        },
    });
    const started = await startHarnessRun(service);
    const clarified = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "clarify-before-mode-change",
            transcript: "The clock is not straight because one side is lower, but I am not sure how to describe it.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const reset = await service.dispatchEvent({
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "left-free-chat",
        type: EXPRESSION_ASSIST_EVENT_TYPES.CONTEXT_RESET,
        expectedRevision: clarified.revision,
        payload: { reason: "left_free_chat" },
    });
    const state = await service.getState(started.assistRunId);

    assert.equal(reset.result.code, "CONTEXT_RESET");
    assert.equal(reset.controlPacket.responseDirective, null);
    assert.equal(state.pendingClarification, null);
    assert.equal(state.lastCompletedTurnId, null);
});

test("a clarification answer may resolve into one card candidate", async () => {
    let evaluationCount = 0;
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        evaluateGate: async () => {
            evaluationCount += 1;
            if (evaluationCount === 1) {
                return {
                    decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
                    gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
                    meaningClear: false,
                    materialGain: true,
                    evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
                    intendedMeaning: "The clock tilts so one side is lower than the other.",
                    communicativeFunction: "Describe an object tilted to one side.",
                    situation: "Describing a badly hung clock.",
                    confidence: 0.76,
                    telemetry: { decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP, totalMs: 45 },
                };
            }
            return {
                decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP,
                gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
                meaningClear: true,
                materialGain: true,
                evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
                intendedMeaning: "The clock tilts so one side is lower than the other.",
                communicativeFunction: "Describe an object tilted to one side.",
                situation: "Describing a badly hung clock.",
                confidence: 0.95,
                telemetry: { decision: EXPRESSION_GAP_DECISIONS.CLEAR_GAP, totalMs: 39 },
            };
        },
        decision: {
            action: "SUGGEST_NEW",
            expression: "lopsided",
            definition: "Uneven because one side is lower or heavier than the other.",
            usage: "Use it when an object or arrangement visibly leans to one side.",
            recast: "The clock looks lopsided.",
            learningContext: { discoveryMode: "AGENT_SUGGESTED_GAP" },
        },
    });
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "clock-attempt",
            transcript: "The clock is uneven because one side is lower, but that is not quite the word.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const second = await service.dispatchEvent(completedTurn(started, {
        eventId: "clarification-answer-event",
        expectedRevision: first.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "clarification-answer",
            transcript: "yes",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const state = await service.getState(started.assistRunId);

    assert.equal(gateCalls.length, 2);
    assert.equal(gateCalls[1].pendingClarification.sourceTurnId, "clock-attempt");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].context.messages[0].messageId, "clock-attempt");
    assert.match(calls[0].context.messages[0].text, /clock is uneven/);
    assert.equal(second.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(second.controlPacket.responseDirective.expression, "lopsided");
    assert.equal(second.controlPacket.effects.length, 1);
    assert.match(second.controlPacket.effects[0].payload.proposal.sourceText, /clock is uneven/);
    assert.equal(state.pendingClarification, null);
});

test("a second uncertain result exits clarification without retrieval", async () => {
    const uncertain = {
        decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP,
        gapType: EXPRESSION_GAP_TYPES.LEXICAL_GAP,
        meaningClear: false,
        materialGain: true,
        evidence: [EXPRESSION_GAP_EVIDENCE.METALINGUISTIC_STRUGGLE],
        intendedMeaning: "The object may be tilted to one side.",
        communicativeFunction: "Describe an object's position.",
        situation: "Describing an object on a wall.",
        confidence: 0.61,
        telemetry: { decision: EXPRESSION_GAP_DECISIONS.POSSIBLE_GAP, totalMs: 42 },
    };
    const { service, calls } = createHarness({
        semanticGateEnabled: true,
        gateDecision: uncertain,
    });
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "uncertain-attempt",
            transcript: "The thing on the wall is not straight, but I may mean something else.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const second = await service.dispatchEvent(completedTurn(started, {
        eventId: "still-uncertain-event",
        expectedRevision: first.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "still-uncertain-answer",
            transcript: "Maybe, but I am still not sure that is the shape I mean.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    const state = await service.getState(started.assistRunId);

    assert.equal(calls.length, 0);
    assert.equal(second.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(second.controlPacket.responseDirective.gate, "clarification_exhausted");
    assert.equal(second.controlPacket.effects.length, 0);
    assert.equal(state.pendingClarification, null);
});

test("semantic gate failures fail open before retrieval", async () => {
    const { service, calls, gateCalls } = createHarness({
        semanticGateEnabled: true,
        evaluateGate: async () => {
            const error = new Error("gate timeout");
            error.code = "provider_timeout";
            throw error;
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started));

    assert.equal(gateCalls.length, 1);
    assert.equal(calls.length, 0);
    assert.equal(result.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(result.controlPacket.responseDirective.gate, "semantic_gate_failure");
    assert.equal(result.result.errorCode, "provider_timeout");
});

test("ASR placeholders never enter retrieval", async () => {
    const { service, calls, gateCalls } = createHarness({ semanticGateEnabled: true });
    const started = await startHarnessRun(service);
    const placeholder = await service.dispatchEvent(completedTurn(started, {
        payload: {
            mode: "FREE_CHAT",
            turnId: "asr-placeholder",
            transcript: "[Transcribing..]",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));
    assert.equal(placeholder.controlPacket.responseDirective.gate, "untrusted_transcript");
    assert.equal(calls.length, 0);
    assert.equal(gateCalls.length, 0);
});

test("an unresolved earlier card does not suppress a distinct candidate turn", async () => {
    const { service, calls } = createHarness();
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started, {
        payload: {
            ...completedTurn(started).payload,
            hasPendingProactiveCard: true,
        },
    }));

    assert.equal(calls.length, 1);
    assert.equal(result.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(result.controlPacket.effects.length, 1);
});

test("provider failures return an authoritative unavailable directive without ordinary speech", async () => {
    const { service, calls } = createHarness({
        decide: async () => {
            throw new Error("provider unavailable");
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started));

    assert.equal(calls.length, 1);
    assert.equal(result.applied, true);
    assert.equal(result.controlPacket.responseDirective.action, "ASSIST_UNAVAILABLE");
    assert.equal(result.controlPacket.responseDirective.gate, "provider_failure");
    assert.match(result.controlPacket.responseDirective.instruction, /couldn't check their Word List/);
    assert.equal(result.controlPacket.effects.length, 0);
});

test("a fluent long turn can be rejected by the semantic authority", async () => {
    const { service, calls } = createHarness({
        decision: {
            action: "NO_ACTION",
            diagnostics: { gate: "fluent_and_natural" },
        },
    });
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started));

    assert.equal(calls.length, 1);
    assert.equal(result.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(result.controlPacket.responseDirective.gate, "fluent_and_natural");
    assert.equal(result.controlPacket.effects.length, 0);
});

test("a candidate turn creates one durable card effect and response directive", async () => {
    const { service, calls } = createHarness();
    const started = await startHarnessRun(service);
    const result = await service.dispatchEvent(completedTurn(started));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].turnId, "turn-1");
    assert.equal(result.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(result.controlPacket.responseDirective.expression, "out of the blue");
    assert.equal(result.controlPacket.effects.length, 1);
    assert.equal(result.controlPacket.effects[0].payload.metadata.primaryAction, "SAVE");
});

test("reissues an undelivered duplicate recommendation for the latest explicit turn", async () => {
    const { service, calls } = createHarness({
        decision: {
            action: "REUSE_EXISTING",
            selectedVocabularyId: "saved-out-of-blue",
            expression: "out of the blue",
            definition: "Unexpectedly and without warning.",
            usage: "Use it when something happens with no advance sign.",
            recast: "His message came out of the blue.",
        },
    });
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started));
    const second = await service.dispatchEvent(completedTurn(started, {
        eventId: "explicit-follow-up-event",
        expectedRevision: first.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "explicit-follow-up",
            transcript: "Do you have any phrases that I can use in this situation?",
            contextMessages: [
                {
                    messageId: "turn-1",
                    role: "user",
                    text: completedTurn(started).payload.transcript,
                },
            ],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(calls.length, 2);
    assert.equal(second.result.code, "RECOMMENDATION_READY");
    assert.equal(second.result.reissuedUndelivered, true);
    assert.equal(second.controlPacket.responseDirective.sourceTurnId, "explicit-follow-up");
    assert.equal(second.controlPacket.responseDirective.action, "REUSE_EXISTING");
    assert.equal(second.controlPacket.effects.length, 1);
    assert.equal(second.controlPacket.effects[0].sourceTurnId, "explicit-follow-up");
    assert.equal(second.controlPacket.effects[0].payload.metadata.primaryAction, "LEARN_TODAY");
});

test("card effects require claim before completion and are consumed once", async () => {
    const { service } = createHarness();
    const started = await startHarnessRun(service);
    const suggested = await service.dispatchEvent(completedTurn(started));
    const effectId = suggested.controlPacket.effects[0].effectId;
    const claimed = await service.dispatchEvent({
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "claim-1",
        type: EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_CLAIMED,
        expectedRevision: suggested.revision,
        payload: { effectId },
    });
    assert.equal(claimed.controlPacket.effects.length, 0);

    const completed = await service.dispatchEvent({
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "complete-1",
        type: EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_COMPLETED,
        expectedRevision: claimed.revision,
        payload: { effectId },
    });
    assert.equal(completed.controlPacket.effects.length, 0);
    assert.equal(completed.result.code, "CARD_EFFECT_COMPLETED");
});

test("a failed card delivery is requeued after a claimed attempt", async () => {
    const { service } = createHarness();
    const started = await startHarnessRun(service);
    const suggested = await service.dispatchEvent(completedTurn(started));
    const effectId = suggested.controlPacket.effects[0].effectId;
    const claimed = await service.dispatchEvent({
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "claim-for-retry",
        type: EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_CLAIMED,
        expectedRevision: suggested.revision,
        payload: { effectId },
    });
    const failed = await service.dispatchEvent({
        assistRunId: started.assistRunId,
        userId: "learner@example.com",
        sourceSessionId: "session-1",
        eventId: "fail-for-retry",
        type: EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_FAILED,
        expectedRevision: claimed.revision,
        payload: { effectId, error: "frontend render failed" },
    });

    assert.equal(failed.result.code, "CARD_EFFECT_RETRY_QUEUED");
    assert.equal(failed.controlPacket.effects.length, 1);
    assert.equal(failed.controlPacket.effects[0].attempts, 1);
    assert.equal(failed.controlPacket.effects[0].claimable, true);
});

test("the same completed turn id is idempotent even with a new event id", async () => {
    const { service, calls } = createHarness();
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started));
    const duplicate = await service.dispatchEvent(completedTurn(started, {
        eventId: "turn-event-retry",
        expectedRevision: first.revision,
    }));

    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.result.code, "DUPLICATE_TURN");
    assert.equal(duplicate.revision, first.revision);
    assert.equal(calls.length, 1);
});

test("a recommendation starts the persisted turn cooldown", async () => {
    const { service, calls } = createHarness();
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started));
    const second = await service.dispatchEvent(completedTurn(started, {
        eventId: "turn-event-2",
        expectedRevision: first.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "turn-2",
            transcript: "Yesterday a friend I had not spoken to for five years sent me a message with no warning, no earlier signal, and no reason for me to expect it again.",
            contextMessages: [],
            hasPendingProactiveCard: false,
        },
    }));

    assert.equal(second.controlPacket.responseDirective.action, "NO_ACTION");
    assert.equal(second.controlPacket.responseDirective.gate, "cooldown");
    assert.equal(calls.length, 1);
});

test("the cooldown allows a different communicative meaning to receive a new card", async () => {
    let decisionCount = 0;
    const { service, calls } = createHarness({
        decide: async () => {
            decisionCount += 1;
            return decisionCount === 1
                ? {
                    action: "REUSE_EXISTING",
                    selectedVocabularyId: "saved-out-of-blue",
                    expression: "out of the blue",
                    definition: "Unexpectedly.",
                    usage: "Use it when something happens without warning.",
                    recast: "His message came out of the blue.",
                }
                : {
                    action: "SUGGEST_NEW",
                    expression: "walk on eggshells",
                    definition: "Act very carefully to avoid upsetting someone.",
                    usage: "Use it when another person's reactions make you cautious.",
                    recast: "I feel like I have to walk on eggshells around him.",
                    learningContext: { discoveryMode: "AGENT_SUGGESTED_GAP" },
                };
        },
    });
    const started = await startHarnessRun(service);
    const first = await service.dispatchEvent(completedTurn(started));
    const second = await service.dispatchEvent(completedTurn(started, {
        eventId: "turn-different-topic",
        expectedRevision: first.revision,
        payload: {
            mode: "FREE_CHAT",
            turnId: "coworker-turn",
            transcript: "My coworker gets angry whenever someone disagrees with him, so I choose every word extremely carefully because even a small comment might upset him and I cannot speak naturally.",
            contextMessages: [{
                messageId: "assistant-coworker",
                role: "assistant",
                text: "What is it like talking to your coworker?",
            }],
            hasPendingProactiveCard: true,
        },
    }));

    assert.equal(calls.length, 2);
    assert.equal(second.controlPacket.responseDirective.action, "SUGGEST_NEW");
    assert.equal(second.controlPacket.responseDirective.expression, "walk on eggshells");
    assert.equal(second.controlPacket.effects.length, 2);
});

test("migrates older Expression Assist checkpoints with an empty clarification state", () => {
    const migrated = migrateExpressionAssistState({
        stateSchemaVersion: 2,
        flowVersion: 4,
        revision: 8,
        effects: [],
        processedEvents: [],
    });

    assert.equal(migrated.stateSchemaVersion, EXPRESSION_ASSIST_STATE_SCHEMA_VERSION);
    assert.equal(migrated.flowVersion, EXPRESSION_ASSIST_FLOW_VERSION);
    assert.equal(migrated.pendingClarification, null);
    assert.equal(migrated.revision, 8);
});
