import {
    EXPRESSION_ASSIST_EFFECT_STATUS,
    EXPRESSION_ASSIST_EVENT_TYPES,
    EXPRESSION_ASSIST_MAX_CONTEXT_MESSAGES,
    EXPRESSION_ASSIST_MAX_TURN_CHARS,
} from "./expressionAssistConstants.js";

const EVENT_TYPES = new Set(Object.values(EXPRESSION_ASSIST_EVENT_TYPES));

function invalid(code, message, status = 409) {
    return { ok: false, code, message, status };
}

function valid() {
    return { ok: true, code: "VALID" };
}

function isText(value, maxLength = 220) {
    const text = String(value ?? "").trim();
    return text.length > 0 && text.length <= maxLength;
}

function getEffect(state, effectId) {
    return (Array.isArray(state?.effects) ? state.effects : [])
        .find((effect) => effect?.effectId === effectId) || null;
}

export function createExpressionAssistEvent({
    eventId,
    type,
    expectedRevision,
    payload = {},
    occurredAt = new Date().toISOString(),
}) {
    return {
        eventId: String(eventId ?? "").trim(),
        type: String(type ?? "").trim(),
        expectedRevision: Number(expectedRevision),
        occurredAt,
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    };
}

export function findProcessedExpressionAssistEvent(state, eventId) {
    return (Array.isArray(state?.processedEvents) ? state.processedEvents : [])
        .find((item) => item?.eventId === eventId) || null;
}

function validateTurnPayload(payload) {
    if (String(payload.mode || "").toUpperCase() !== "FREE_CHAT") {
        return invalid("NOT_FREE_CHAT", "Expression Assist turns must be in FREE_CHAT mode", 400);
    }
    if (!isText(payload.turnId, 220)) {
        return invalid("TURN_ID_REQUIRED", "turnId is required", 400);
    }
    if (!isText(payload.transcript, EXPRESSION_ASSIST_MAX_TURN_CHARS)) {
        return invalid("TRANSCRIPT_REQUIRED", "transcript is required and is too long", 400);
    }
    const messages = Array.isArray(payload.contextMessages) ? payload.contextMessages : [];
    if (messages.length > EXPRESSION_ASSIST_MAX_CONTEXT_MESSAGES) {
        return invalid("CONTEXT_TOO_LARGE", "contextMessages is too large", 400);
    }
    for (const message of messages) {
        if (!["user", "assistant"].includes(message?.role)
            || !isText(message?.messageId, 220)
            || !isText(message?.text, 1_600)) {
            return invalid("INVALID_CONTEXT_MESSAGE", "contextMessages contains an invalid item", 400);
        }
    }
    return valid();
}

export function isExpressionAssistLeaseExpired(effect, nowMs = Date.now()) {
    if (effect?.status !== EXPRESSION_ASSIST_EFFECT_STATUS.IN_PROGRESS) return false;
    const leaseUntil = Date.parse(effect?.leaseUntil || "");
    return !Number.isFinite(leaseUntil) || leaseUntil <= nowMs;
}

export function validateExpressionAssistEvent(state, event, { nowMs = Date.now() } = {}) {
    if (!event || typeof event !== "object") return invalid("EVENT_REQUIRED", "event is required", 400);
    if (!isText(event.eventId, 128)) return invalid("EVENT_ID_REQUIRED", "eventId is required", 400);
    if (!EVENT_TYPES.has(event.type)) return invalid("UNKNOWN_EVENT", `Unsupported event: ${event.type}`, 400);

    const processed = findProcessedExpressionAssistEvent(state, event.eventId);
    if (processed) {
        return {
            ok: false,
            duplicate: true,
            code: "DUPLICATE_EVENT",
            message: "event was already applied",
            processed,
            status: 200,
        };
    }
    if (!Number.isInteger(event.expectedRevision) || event.expectedRevision < 0) {
        return invalid("INVALID_REVISION", "expectedRevision must be a non-negative integer", 400);
    }
    if (event.expectedRevision !== Number(state?.revision || 0)) {
        return invalid(
            "REVISION_CONFLICT",
            `Expected revision ${event.expectedRevision}, current revision is ${Number(state?.revision || 0)}`,
            409,
        );
    }

    if (event.type === EXPRESSION_ASSIST_EVENT_TYPES.RUN_STARTED) {
        return Number(state?.revision || 0) === 0
            ? valid()
            : invalid("RUN_ALREADY_STARTED", "assist run has already started");
    }
    if (event.type === EXPRESSION_ASSIST_EVENT_TYPES.FREE_CHAT_TURN_COMPLETED) {
        const turnValidation = validateTurnPayload(event.payload || {});
        if (!turnValidation.ok) return turnValidation;
        if (state?.lastCompletedTurnId === event.payload?.turnId) {
            return {
                ok: false,
                duplicate: true,
                code: "DUPLICATE_TURN",
                message: "completed turn was already applied",
                status: 200,
            };
        }
        return valid();
    }
    if (event.type === EXPRESSION_ASSIST_EVENT_TYPES.CONTEXT_RESET) return valid();

    const effectId = event.payload?.effectId;
    if (!isText(effectId, 300)) return invalid("EFFECT_ID_REQUIRED", "effectId is required", 400);
    const effect = getEffect(state, effectId);
    if (!effect) return invalid("EFFECT_NOT_FOUND", "card effect was not found", 404);

    if (event.type === EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_CLAIMED) {
        const claimable = effect.status === EXPRESSION_ASSIST_EFFECT_STATUS.PENDING
            || isExpressionAssistLeaseExpired(effect, nowMs);
        return claimable ? valid() : invalid("EFFECT_NOT_CLAIMABLE", "card effect is not claimable");
    }
    if (effect.status === EXPRESSION_ASSIST_EFFECT_STATUS.COMPLETE) {
        return invalid("EFFECT_ALREADY_COMPLETE", "card effect is already complete");
    }
    return effect.status === EXPRESSION_ASSIST_EFFECT_STATUS.IN_PROGRESS
        ? valid()
        : invalid("EFFECT_NOT_CLAIMED", "card effect must be claimed before settlement");
}
