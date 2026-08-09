import assert from "node:assert/strict";
import test from "node:test";
import {
    buildExpressionAssistSnapshot,
    ExpressionAssistController,
    isUntrustedExpressionAssistTranscript,
} from "../src/utils/expressionAssist.js";
import { buildVocabularyTeacherInstructions } from "../src/agentConfigs/vocabularyTeacher.js";
import { selectReviewGraphTools } from "../src/utils/reviewTools.js";

function message(itemId, role, title) {
    return { itemId, type: "MESSAGE", role, title, status: "DONE", isHidden: false };
}

function createHarness({ transcriptItems, decision, now = 100_000, timeoutMs } = {}) {
    const state = {
        enabled: true,
        userId: "user-a",
        sessionId: "session-a",
        mode: "FREE_CHAT",
        status: "CONNECTED",
        transcriptItems: transcriptItems || [
            message("a-1", "assistant", "What are you trying to say?"),
            message("u-1", "user", "How do I say that Doctor Doom could really win?"),
        ],
    };
    const calls = [];
    const cards = [];
    const telemetry = [];
    const clock = { now };
    const controller = new ExpressionAssistController({
        getSnapshot: () => buildExpressionAssistSnapshot(state),
        requestDecision: async (payload) => {
            calls.push(payload);
            return decision || {
                action: "REUSE_EXISTING",
                selectedVocabularyId: "v-1",
                expression: "contender",
                definition: "A credible competitor.",
                usage: "Use it to describe someone with a real chance of winning.",
                recast: "Doctor Doom is a serious contender.",
            };
        },
        onSuggestion: (proposal, metadata) => {
            cards.push({ proposal, metadata });
            return "card-1";
        },
        onTelemetry: (event) => telemetry.push(event),
        now: () => clock.now,
        timeoutMs,
    });
    return { state, calls, cards, telemetry, clock, controller };
}

const explicitTrigger = {
    reasonCode: "ASKED_HOW_TO_SAY",
    intendedMeaning: "Doctor Doom has a realistic chance to win.",
    communicativeFunction: "Describe someone as a credible competitor.",
    situation: "A casual Marvel conversation.",
};

test("recognizes empty ASR placeholders without treating ordinary speech as untrusted", () => {
    assert.equal(isUntrustedExpressionAssistTranscript("[inaudible]"), true);
    assert.equal(isUntrustedExpressionAssistTranscript("[Transcribing..]"), true);
    assert.equal(isUntrustedExpressionAssistTranscript("[Transcription failed]"), true);
    assert.equal(isUntrustedExpressionAssistTranscript("His message came out of the blue."), false);
});

test("rejects ordinary greetings before any network request", async () => {
    const harness = createHarness({
        transcriptItems: [message("u-1", "user", "Hi")],
    });
    const result = await harness.controller.request({
        ...explicitTrigger,
        reasonCode: "CIRCUMLOCUTION",
    });
    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.gate, "short_acknowledgement");
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.telemetry[0].event, "gate_rejected");
    assert.equal(harness.telemetry[0].gate, "short_acknowledgement");
    assert.match(harness.telemetry[0].assistRequestId, /^expression-assist-/);
});

test("uses trusted transcript ids and creates a Learn Today card for an existing Expression", async () => {
    const harness = createHarness();
    const result = await harness.controller.request(explicitTrigger);
    assert.equal(result.action, "REUSE_EXISTING");
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].turnId, "u-1");
    assert.equal(harness.calls[0].turnRevision, 1);
    assert.equal(harness.calls[0].context.messages.at(-1).text, harness.state.transcriptItems.at(-1).title);
    assert.equal(harness.cards.length, 1);
    assert.equal(harness.cards[0].metadata.primaryAction, "LEARN_TODAY");
    assert.equal(harness.cards[0].metadata.savedVocabularyId, "v-1");
    assert.equal(result.itemId, "card-1");
});

test("timeoutMs zero lets the legacy request finish without aborting it", async () => {
    const harness = createHarness({ timeoutMs: 0 });
    harness.controller.requestDecision = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
            action: "REUSE_EXISTING",
            selectedVocabularyId: "v-1",
            expression: "contender",
            definition: "A credible competitor.",
            usage: "Use it to describe someone with a real chance of winning.",
            recast: "Doctor Doom is a serious contender.",
        };
    };

    const result = await harness.controller.request(explicitTrigger);

    assert.equal(result.action, "REUSE_EXISTING");
    assert.equal(harness.cards.length, 1);
});

test("accepts natural explicit requests for a word or phrase", async () => {
    const utterances = [
        "Do you know any phrases that can describe this situation?",
        "Do you know any word that I can use?",
        "Is there a slang for this situation that I can use?",
        "Can you suggest some other phrases or expressions?",
    ];

    for (const [index, utterance] of utterances.entries()) {
        const harness = createHarness({
            transcriptItems: [message(`u-${index}`, "user", utterance)],
        });
        const result = await harness.controller.request(explicitTrigger);
        assert.equal(result.action, "REUSE_EXISTING", utterance);
        assert.equal(harness.calls.length, 1, utterance);
    }
});

test("creates one proactive card only after a supported new suggestion", async () => {
    const learningContext = { discoveryMode: "AGENT_SUGGESTED_GAP" };
    const harness = createHarness({
        decision: {
            action: "SUGGEST_NEW",
            expression: "dark horse",
            definition: "An unexpected competitor with a real chance.",
            usage: "Use it when someone may surprise everyone by winning.",
            recast: "Doctor Doom could be the dark horse.",
            learningContext,
        },
    });
    const result = await harness.controller.request(explicitTrigger);
    assert.equal(result.action, "SUGGEST_NEW");
    assert.equal(harness.cards.length, 1);
    assert.equal(harness.cards[0].metadata.discoveryMode, "AGENT_SUGGESTED_GAP");
    assert.equal(harness.cards[0].metadata.learningContext, learningContext);
    assert.equal(harness.cards[0].metadata.primaryAction, "SAVE");
});

test("suppresses a request while a proactive card is unresolved", async () => {
    const harness = createHarness();
    harness.state.transcriptItems.push({
        itemId: "card-1",
        type: "EXPRESSION_CARD",
        data: { discoveryMode: "AGENT_SUGGESTED_GAP", saveState: "proposed" },
    });
    const result = await harness.controller.request(explicitTrigger);
    assert.equal(result.gate, "pending_card");
    assert.equal(harness.calls.length, 0);
});

test("discards a result after a newer learner turn arrives", async () => {
    let resolveDecision;
    const harness = createHarness();
    harness.controller.requestDecision = () => new Promise((resolve) => {
        resolveDecision = resolve;
    });
    const pending = harness.controller.request(explicitTrigger);
    await Promise.resolve();
    harness.state.transcriptItems.push(message("u-2", "user", "Actually, let us discuss something else."));
    resolveDecision({
        action: "SUGGEST_NEW",
        expression: "contender",
        definition: "A credible competitor.",
        usage: "Use it for someone with a real chance.",
        recast: "Doctor Doom is a contender.",
        learningContext: {},
    });
    const result = await pending;
    assert.equal(result.gate, "stale_turn");
    assert.equal(harness.cards.length, 0);
});

test("applies both turn-count and wall-clock cooldowns", async () => {
    const harness = createHarness();
    await harness.controller.request(explicitTrigger);
    harness.state.transcriptItems.push(
        message("a-2", "assistant", "Try another example."),
        message("u-2", "user", "How do I say he is probably going to surprise everyone?"),
    );
    harness.clock.now += 60_000;
    const result = await harness.controller.request(explicitTrigger);
    assert.equal(result.gate, "cooldown");
    assert.equal(harness.calls.length, 1);
});

test("exposes the proactive tool only in authoritative Free Chat", () => {
    const reviewTools = { choose: { name: "choose_practice_mode" } };
    const saveTool = { name: "propose_expression_save" };
    const assistTool = { name: "request_expression_assist" };
    const freeChat = selectReviewGraphTools({
        phase: "FREE_CHAT",
        allowedTools: ["choose_practice_mode", "propose_expression_save"],
    }, reviewTools, saveTool, assistTool);
    assert.deepEqual(freeChat.map((tool) => tool.name), [
        "choose_practice_mode",
        "propose_expression_save",
        "request_expression_assist",
    ]);

    const review = selectReviewGraphTools({
        phase: "IN_SCENE",
        allowedTools: ["propose_expression_save"],
    }, reviewTools, saveTool, assistTool);
    assert.deepEqual(review.map((tool) => tool.name), ["propose_expression_save"]);
});

test("requires tool-first handling before a reusable Expression recast", () => {
    const instructions = buildVocabularyTeacherInstructions({ context: {} });
    assert.match(instructions, /call request_expression_assist first and wait for its result/i);
    assert.match(instructions, /Never reveal your proposed Expression before the tool call/i);
});
