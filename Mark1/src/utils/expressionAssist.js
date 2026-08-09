import {
    EXPRESSION_CARD_PRIMARY_ACTIONS,
    EXPRESSION_CARD_TYPE,
    EXPRESSION_SAVE_STATES,
} from "./expressionSave.js";
import { isExplicitExpressionRequest } from "./expressionAssistIntent.js";

export const EXPRESSION_ASSIST_DISCOVERY_MODE = "AGENT_SUGGESTED_GAP";

export const EXPRESSION_ASSIST_ACTIONS = Object.freeze({
    NO_ACTION: "NO_ACTION",
    REUSE_EXISTING: "REUSE_EXISTING",
    SUGGEST_NEW: "SUGGEST_NEW",
});

export const EXPRESSION_ASSIST_TRIGGER_REASONS = Object.freeze({
    ASKED_HOW_TO_SAY: "ASKED_HOW_TO_SAY",
    CIRCUMLOCUTION: "CIRCUMLOCUTION",
    REPEATED_REPAIR: "REPEATED_REPAIR",
});

const VALID_TRIGGER_REASONS = new Set(Object.values(EXPRESSION_ASSIST_TRIGGER_REASONS));
const UNRESOLVED_CARD_STATES = new Set([
    EXPRESSION_SAVE_STATES.PROPOSED,
    EXPRESSION_SAVE_STATES.SAVING,
    EXPRESSION_SAVE_STATES.ERROR,
]);
const SHORT_ACKNOWLEDGEMENTS = new Set([
    "hi", "hello", "hey", "okay", "ok", "yes", "no", "thanks", "thank you", "sure",
    "你好", "好的", "好", "谢谢", "可以",
]);

function normalizeOptionalTimeout(value) {
    if (value === null) return null;
    const rawValue = String(value ?? "").trim();
    const normalizedValue = rawValue.toLowerCase();
    if (["0", "off", "none", "disabled"].includes(normalizedValue)) return null;

    const parsed = Number(rawValue || 5_000);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.max(500, parsed)
        : 5_000;
}

function compactText(value, maxChars = 600) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function normalizeAttempt(value) {
    return compactText(value, 1_600)
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isUntrustedExpressionAssistTranscript(value) {
    const attempt = normalizeAttempt(value);
    return !attempt
        || attempt.includes("inaudible")
        || attempt.includes("transcribing")
        || attempt.includes("transcription failed");
}

function wordTokens(value) {
    return new Set(normalizeAttempt(value).match(/[\p{L}\p{N}']+/gu) || []);
}

function overlapRatio(left, right) {
    const leftTokens = wordTokens(left);
    const rightTokens = wordTokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function createRequestId() {
    const id = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `expression-assist-${id}`;
}

function noAction(gate) {
    return {
        ok: true,
        action: EXPRESSION_ASSIST_ACTIONS.NO_ACTION,
        gate,
        nextAction: "Continue the original topic naturally. Do not mention Expression Assist.",
    };
}

export function getCompletedConversationMessages(transcriptItems = []) {
    return (Array.isArray(transcriptItems) ? transcriptItems : [])
        .filter((item) => (
            item?.type === "MESSAGE"
            && (item?.role === "user" || item?.role === "assistant")
            && !item?.isHidden
            && item?.status !== "IN_PROGRESS"
        ))
        .map((item) => ({
            messageId: String(item.itemId || "").trim(),
            role: item.role,
            text: compactText(item.title, 1_600),
        }))
        .filter((message) => message.messageId && message.text);
}

export function buildExpressionAssistSnapshot({
    enabled,
    userId,
    sessionId,
    mode,
    status,
    transcriptItems,
} = {}) {
    const allMessages = getCompletedConversationMessages(transcriptItems);
    const userMessages = allMessages.filter((message) => message.role === "user");
    const latestUser = userMessages.at(-1) || null;
    const latestUserIndex = latestUser
        ? allMessages.findIndex((message) => message.messageId === latestUser.messageId)
        : -1;
    const boundedMessages = latestUserIndex >= 0
        ? allMessages.slice(Math.max(0, latestUserIndex - 2), latestUserIndex + 1)
        : [];
    const hasPendingProactiveCard = (Array.isArray(transcriptItems) ? transcriptItems : [])
        .some((item) => (
            item?.type === EXPRESSION_CARD_TYPE
            && item?.data?.discoveryMode === EXPRESSION_ASSIST_DISCOVERY_MODE
            && UNRESOLVED_CARD_STATES.has(item?.data?.saveState)
        ));

    return {
        enabled: enabled === true,
        userId: compactText(userId, 320),
        sessionId: compactText(sessionId, 220),
        mode: String(mode || "").toUpperCase(),
        connected: status === "CONNECTED",
        turnId: latestUser?.messageId || null,
        turnRevision: userMessages.length,
        currentAttempt: latestUser?.text || "",
        boundedMessages,
        userMessages: userMessages.slice(-3),
        hasPendingProactiveCard,
    };
}

function validateTrigger(snapshot, trigger) {
    const reasonCode = String(trigger?.reasonCode || "").trim();
    if (!VALID_TRIGGER_REASONS.has(reasonCode)) return "invalid_trigger";
    const attempt = normalizeAttempt(snapshot.currentAttempt);
    if (isUntrustedExpressionAssistTranscript(attempt)) {
        return "untrusted_transcript";
    }
    if (SHORT_ACKNOWLEDGEMENTS.has(attempt)) return "short_acknowledgement";

    if (reasonCode === EXPRESSION_ASSIST_TRIGGER_REASONS.ASKED_HOW_TO_SAY) {
        return isExplicitExpressionRequest(snapshot.currentAttempt)
            ? null
            : "explicit_ask_not_grounded";
    }
    const tokens = [...wordTokens(snapshot.currentAttempt)];
    if (reasonCode === EXPRESSION_ASSIST_TRIGGER_REASONS.CIRCUMLOCUTION) {
        return tokens.length >= 12 || snapshot.currentAttempt.length >= 70
            ? null
            : "circumlocution_too_short";
    }
    const previous = snapshot.userMessages.at(-2)?.text || "";
    if (!previous || tokens.length < 5 || overlapRatio(previous, snapshot.currentAttempt) < 0.2) {
        return "repeated_repair_not_grounded";
    }
    return null;
}

export class ExpressionAssistController {
    constructor({
        getSnapshot,
        requestDecision,
        onSuggestion,
        onTelemetry = () => {},
        now = () => Date.now(),
        timeoutMs = 5_000,
    } = {}) {
        if (typeof getSnapshot !== "function") throw new Error("getSnapshot is required");
        if (typeof requestDecision !== "function") throw new Error("requestDecision is required");
        if (typeof onSuggestion !== "function") throw new Error("onSuggestion is required");
        this.getSnapshot = getSnapshot;
        this.requestDecision = requestDecision;
        this.onSuggestion = onSuggestion;
        this.onTelemetry = onTelemetry;
        this.now = now;
        this.timeoutMs = normalizeOptionalTimeout(timeoutMs);
        this.activeRequest = null;
        this.sessionId = null;
        this.lastRecommendationAt = 0;
        this.lastRecommendationRevision = -1;
        this.lastProcessedAttempt = "";
    }

    syncSession(sessionId) {
        if (this.sessionId === sessionId) return;
        this.cancel("session_changed");
        this.sessionId = sessionId;
        this.lastRecommendationAt = 0;
        this.lastRecommendationRevision = -1;
        this.lastProcessedAttempt = "";
    }

    cancel(reason = "cancelled") {
        if (!this.activeRequest) return;
        this.activeRequest.abortController.abort(reason);
        this.activeRequest = null;
    }

    hardGate(snapshot, trigger) {
        if (!snapshot.enabled) return "feature_disabled";
        if (!snapshot.connected) return "not_connected";
        if (snapshot.mode !== "FREE_CHAT") return "not_free_chat";
        if (!snapshot.userId || !snapshot.sessionId || !snapshot.turnId || snapshot.turnRevision < 1) {
            return "missing_identity";
        }
        if (this.activeRequest) return "single_flight";
        if (snapshot.hasPendingProactiveCard) return "pending_card";
        if (this.lastRecommendationRevision >= 0 && (
            snapshot.turnRevision - this.lastRecommendationRevision <= 3
            || this.now() - this.lastRecommendationAt < 45_000
        )) {
            return "cooldown";
        }
        const attempt = normalizeAttempt(snapshot.currentAttempt);
        if (attempt && attempt === this.lastProcessedAttempt) return "duplicate_attempt";
        return validateTrigger(snapshot, trigger);
    }

    isCurrent(initialSnapshot) {
        const current = this.getSnapshot();
        return current.connected
            && current.mode === "FREE_CHAT"
            && current.sessionId === initialSnapshot.sessionId
            && current.turnId === initialSnapshot.turnId
            && current.turnRevision === initialSnapshot.turnRevision;
    }

    async request(trigger) {
        const snapshot = this.getSnapshot();
        this.syncSession(snapshot.sessionId);
        const assistRequestId = createRequestId();
        const gate = this.hardGate(snapshot, trigger);
        if (gate) {
            this.onTelemetry({ assistRequestId, event: "gate_rejected", gate });
            return noAction(gate);
        }

        const abortController = new AbortController();
        const timeoutId = this.timeoutMs == null
            ? null
            : setTimeout(() => abortController.abort("timeout"), this.timeoutMs);
        this.activeRequest = { assistRequestId, abortController };
        this.lastProcessedAttempt = normalizeAttempt(snapshot.currentAttempt);
        try {
            const result = await this.requestDecision({
                assistRequestId,
                userId: snapshot.userId,
                sessionId: snapshot.sessionId,
                turnId: snapshot.turnId,
                turnRevision: snapshot.turnRevision,
                mode: "FREE_CHAT",
                trigger,
                context: { messages: snapshot.boundedMessages },
            }, { signal: abortController.signal });

            if (!this.isCurrent(snapshot)) return noAction("stale_turn");
            if (!Object.values(EXPRESSION_ASSIST_ACTIONS).includes(result?.action)) {
                return noAction("invalid_result");
            }
            if (result.action === EXPRESSION_ASSIST_ACTIONS.NO_ACTION) {
                return noAction(result?.diagnostics?.gate || "no_material_gain");
            }

            this.lastRecommendationAt = this.now();
            this.lastRecommendationRevision = snapshot.turnRevision;
            if (result.action === EXPRESSION_ASSIST_ACTIONS.REUSE_EXISTING) {
                const itemId = this.onSuggestion({
                    expression: result.expression,
                    definition: result.definition,
                    usage: result.usage,
                    sourceText: snapshot.currentAttempt,
                }, {
                    discoveryMode: EXPRESSION_ASSIST_DISCOVERY_MODE,
                    assistRequestId,
                    requestMessageId: snapshot.turnId,
                    primaryAction: EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY,
                    savedVocabularyId: result.selectedVocabularyId,
                });
                if (!itemId) return noAction("card_creation_failed");
                return {
                    ok: true,
                    action: result.action,
                    itemId,
                    expression: result.expression,
                    definition: result.definition,
                    usage: result.usage,
                    recast: result.recast,
                    selectedVocabularyId: result.selectedVocabularyId,
                    nextAction: "Briefly remind the learner of this saved Expression and its optional Learn today card, give the recast, invite one natural retry, then continue the topic.",
                };
            }

            const itemId = this.onSuggestion({
                expression: result.expression,
                definition: result.definition,
                usage: result.usage,
                sourceText: snapshot.currentAttempt,
            }, {
                discoveryMode: EXPRESSION_ASSIST_DISCOVERY_MODE,
                assistRequestId,
                requestMessageId: snapshot.turnId,
                learningContext: result.learningContext,
                primaryAction: EXPRESSION_CARD_PRIMARY_ACTIONS.SAVE,
            });
            if (!itemId) return noAction("card_creation_failed");
            return {
                ok: true,
                action: result.action,
                itemId,
                expression: result.expression,
                recast: result.recast,
                nextAction: "Give one short witty introduction to the optional card, then continue the original topic without waiting.",
            };
        } catch {
            const gateName = abortController.signal.aborted ? "cancelled_or_timeout" : "request_failed";
            this.onTelemetry({ assistRequestId, event: "request_failed", gate: gateName });
            return noAction(gateName);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            if (this.activeRequest?.assistRequestId === assistRequestId) {
                this.activeRequest = null;
            }
        }
    }
}
