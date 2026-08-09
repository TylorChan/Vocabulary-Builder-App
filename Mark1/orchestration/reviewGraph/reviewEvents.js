import {
    REVIEW_EFFECT_STATUS,
    REVIEW_EVENT_TYPES,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_TURN_OUTCOMES,
} from "./reviewConstants.js";

const EVENT_TYPE_SET = new Set(Object.values(REVIEW_EVENT_TYPES));
const TURN_OUTCOME_SET = new Set(Object.values(REVIEW_TURN_OUTCOMES));

function isNonEmptyString(value, maxLength = 180) {
    const text = String(value ?? "").trim();
    return text.length > 0 && text.length <= maxLength;
}

function invalid(code, message, status = 409) {
    return { ok: false, code, message, status };
}

function valid() {
    return { ok: true, code: "VALID" };
}

export function createReviewEvent({
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

export function findProcessedEvent(state, eventId) {
    return (Array.isArray(state?.processedEvents) ? state.processedEvents : [])
        .find((item) => item?.eventId === eventId) || null;
}

function getEffect(state, effectId) {
    return (Array.isArray(state?.effects) ? state.effects : [])
        .find((effect) => effect?.effectId === effectId) || null;
}

function validateEventPayload(state, event, nowMs) {
    const payload = event.payload || {};

    switch (event.type) {
        case REVIEW_EVENT_TYPES.RUN_STARTED:
            return valid();
        case REVIEW_EVENT_TYPES.MODE_SELECTED:
            return Object.values(REVIEW_MODES).includes(payload.mode) && payload.mode !== REVIEW_MODES.MODE_SELECT
                ? valid()
                : invalid("INVALID_MODE", "mode must be REVIEW or FREE_CHAT", 400);
        case REVIEW_EVENT_TYPES.THEME_SUBMITTED:
            return String(payload.userFocus ?? "").length <= 160
                ? valid()
                : invalid("THEME_TOO_LONG", "userFocus must be 160 characters or fewer", 400);
        case REVIEW_EVENT_TYPES.USER_TURN_COMPLETED:
            if (!Array.isArray(payload.matchedTargetIds)) {
                return invalid("INVALID_TURN_OBSERVATION", "matchedTargetIds must be an array", 400);
            }
            if (payload.matchedTargetIds.length > 30 || payload.matchedTargetIds.some((id) => !isNonEmptyString(id))) {
                return invalid("INVALID_TURN_OBSERVATION", "matchedTargetIds must contain at most 30 valid IDs", 400);
            }
            if (!isNonEmptyString(payload.turnId, 160)) {
                return invalid("INVALID_TURN_OBSERVATION", "turnId is required", 400);
            }
            if (payload.turnEvidence != null) {
                const evidence = payload.turnEvidence;
                if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
                    return invalid("INVALID_TURN_EVIDENCE", "turnEvidence must be an object", 400);
                }
                if (!TURN_OUTCOME_SET.has(evidence.outcome)) {
                    return invalid("INVALID_TURN_EVIDENCE", "turnEvidence outcome is invalid", 400);
                }
                if (!Array.isArray(evidence.targetEvidence) || evidence.targetEvidence.length > 30) {
                    return invalid("INVALID_TURN_EVIDENCE", "targetEvidence must contain at most 30 items", 400);
                }
            }
            return valid();
        case REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED:
            return isNonEmptyString(payload.sceneId)
                ? valid()
                : invalid("SCENE_ID_REQUIRED", "sceneId is required", 400);
        case REVIEW_EVENT_TYPES.PAUSE_REQUESTED:
        case REVIEW_EVENT_TYPES.RESUME_REQUESTED:
            return valid();
        case REVIEW_EVENT_TYPES.RATING_CLAIMED:
        case REVIEW_EVENT_TYPES.RATING_COMPLETED:
        case REVIEW_EVENT_TYPES.RATING_FAILED: {
            if (!isNonEmptyString(payload.effectId, 260)) {
                return invalid("EFFECT_ID_REQUIRED", "effectId is required", 400);
            }
            const effect = getEffect(state, payload.effectId);
            if (!effect) {
                return invalid("EFFECT_NOT_FOUND", "rating effect was not found", 404);
            }
            if (event.type === REVIEW_EVENT_TYPES.RATING_CLAIMED) {
                const leaseExpired = effect.status === REVIEW_EFFECT_STATUS.IN_PROGRESS
                    && Date.parse(effect.leaseUntil || "") <= nowMs;
                if (effect.status !== REVIEW_EFFECT_STATUS.PENDING && !leaseExpired) {
                    return invalid("EFFECT_NOT_CLAIMABLE", "rating effect is not claimable");
                }
            }
            if (event.type !== REVIEW_EVENT_TYPES.RATING_CLAIMED) {
                if (effect.status === REVIEW_EFFECT_STATUS.COMPLETE) {
                    return invalid("EFFECT_ALREADY_COMPLETE", "rating effect is already complete");
                }
                if (effect.status !== REVIEW_EFFECT_STATUS.IN_PROGRESS) {
                    return invalid("EFFECT_NOT_CLAIMED", "rating effect must be claimed before it is settled");
                }
            }
            return valid();
        }
        default:
            return invalid("UNKNOWN_EVENT", `Unsupported event type: ${event.type}`, 400);
    }
}

function validateTransition(state, event) {
    const phase = state?.phase;
    const payload = event.payload || {};
    const hasPlan = Array.isArray(state?.rolePlayPlan?.scenes) && state.rolePlayPlan.scenes.length > 0;

    switch (event.type) {
        case REVIEW_EVENT_TYPES.RUN_STARTED:
            return Number(state?.revision || 0) === 0
                ? valid()
                : invalid("RUN_ALREADY_STARTED", "review run has already started");
        case REVIEW_EVENT_TYPES.MODE_SELECTED:
            if (payload.mode === REVIEW_MODES.FREE_CHAT) {
                return [
                    REVIEW_PHASES.CHOOSE_MODE,
                    REVIEW_PHASES.FREE_CHAT,
                    REVIEW_PHASES.PAUSED,
                ].includes(phase)
                    ? valid()
                    : invalid("INVALID_TRANSITION", `Cannot select free chat from ${phase}`);
            }
            return [REVIEW_PHASES.CHOOSE_MODE, REVIEW_PHASES.FREE_CHAT].includes(phase)
                ? valid()
                : invalid("INVALID_TRANSITION", `Cannot select review from ${phase}`);
        case REVIEW_EVENT_TYPES.THEME_SUBMITTED:
            return phase === REVIEW_PHASES.AWAIT_THEME
                ? valid()
                : invalid("INVALID_TRANSITION", `Cannot submit a theme from ${phase}`);
        case REVIEW_EVENT_TYPES.USER_TURN_COMPLETED:
            return phase === REVIEW_PHASES.IN_SCENE
                ? valid()
                : invalid("INVALID_TRANSITION", `Cannot observe a review turn from ${phase}`);
        case REVIEW_EVENT_TYPES.SCENE_COMPLETION_REQUESTED:
            if (phase !== REVIEW_PHASES.IN_SCENE) {
                return invalid("INVALID_TRANSITION", `Cannot complete a scene from ${phase}`);
            }
            return payload.sceneId === state?.activeSceneId
                ? valid()
                : invalid("STALE_SCENE", "The completion request does not match the active scene");
        case REVIEW_EVENT_TYPES.PAUSE_REQUESTED:
            return phase === REVIEW_PHASES.IN_SCENE
                ? valid()
                : invalid("INVALID_TRANSITION", `Cannot pause review from ${phase}`);
        case REVIEW_EVENT_TYPES.RESUME_REQUESTED:
            return hasPlan && [REVIEW_PHASES.PAUSED, REVIEW_PHASES.FREE_CHAT].includes(phase)
                ? valid()
                : invalid("INVALID_TRANSITION", `Cannot resume review from ${phase}`);
        case REVIEW_EVENT_TYPES.RATING_CLAIMED:
        case REVIEW_EVENT_TYPES.RATING_COMPLETED:
        case REVIEW_EVENT_TYPES.RATING_FAILED:
            return valid();
        default:
            return invalid("UNKNOWN_EVENT", `Unsupported event type: ${event.type}`, 400);
    }
}

export function validateReviewEvent(state, event, { nowMs = Date.now() } = {}) {
    if (!event || typeof event !== "object") {
        return invalid("EVENT_REQUIRED", "event is required", 400);
    }
    if (!isNonEmptyString(event.eventId, 128)) {
        return invalid("EVENT_ID_REQUIRED", "eventId is required and must be 128 characters or fewer", 400);
    }
    if (!EVENT_TYPE_SET.has(event.type)) {
        return invalid("UNKNOWN_EVENT", `Unsupported event type: ${event.type}`, 400);
    }

    const processed = findProcessedEvent(state, event.eventId);
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

    const payloadResult = validateEventPayload(state, event, nowMs);
    if (!payloadResult.ok) return payloadResult;
    return validateTransition(state, event);
}

export function isRatingLeaseExpired(effect, nowMs = Date.now()) {
    if (effect?.status !== REVIEW_EFFECT_STATUS.IN_PROGRESS) return false;
    const leaseUntilMs = Date.parse(effect?.leaseUntil || "");
    return !Number.isFinite(leaseUntilMs) || leaseUntilMs <= nowMs;
}
