import crypto from "node:crypto";
import {
    detectExpressionRetrievalScope,
    isExplicitExpressionRequest,
} from "../../src/utils/expressionAssistIntent.js";
import {
    EXPRESSION_ASSIST_ACTIONS,
    EXPRESSION_ASSIST_REASON_CODES,
} from "../../services/expressionAssistService.js";
import {
    EXPRESSION_ASSIST_COOLDOWN_MS,
    EXPRESSION_ASSIST_COOLDOWN_TURNS,
    EXPRESSION_ASSIST_EFFECT_LEASE_MS,
    EXPRESSION_ASSIST_EFFECT_LIMIT,
    EXPRESSION_ASSIST_EFFECT_MAX_ATTEMPTS,
    EXPRESSION_ASSIST_EFFECT_STATUS,
    EXPRESSION_ASSIST_EFFECT_TYPES,
    EXPRESSION_ASSIST_EVENT_TYPES,
    EXPRESSION_INTERVENTION_ACTIONS,
    EXPRESSION_ASSIST_PROCESSED_EVENT_LIMIT,
} from "./expressionAssistConstants.js";
import { validateExpressionAssistEvent } from "./expressionAssistEvents.js";
import { selectDefaultExpressionIntervention } from "./expressionInterventionPolicy.js";

const SHORT_ACKNOWLEDGEMENTS = new Set([
    "hi", "hello", "hey", "ok", "okay", "yes", "no", "thanks", "thank you", "sure",
    "你好", "好的", "好", "谢谢", "可以",
]);
const AUTHORITATIVE_ASSIST_FAILURE_GATES = new Set([
    "timeout",
    "provider_failure",
    "invalid_model_output",
]);

function cleanText(value, maxLength = 1_600) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizedAttempt(value) {
    return cleanText(value)
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function words(value) {
    return normalizedAttempt(value).match(/[\p{L}\p{N}']+/gu) || [];
}

function overlapRatio(left, right) {
    const leftWords = new Set(words(left));
    const rightWords = new Set(words(right));
    if (!leftWords.size || !rightWords.size) return 0;
    const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
    return overlap / Math.min(leftWords.size, rightWords.size);
}

function attemptHash(value) {
    return crypto.createHash("sha256").update(normalizedAttempt(value)).digest("hex").slice(0, 16);
}

function findPendingExpressionEffect(effects, expression) {
    const normalizedExpression = normalizedAttempt(expression);
    if (!normalizedExpression) return null;
    return [...(Array.isArray(effects) ? effects : [])]
        .reverse()
        .find((effect) => (
            effect?.type === EXPRESSION_ASSIST_EFFECT_TYPES.PRESENT_EXPRESSION_CARD
            && effect?.status === EXPRESSION_ASSIST_EFFECT_STATUS.PENDING
            && normalizedAttempt(effect?.payload?.proposal?.expression) === normalizedExpression
        )) || null;
}

function noActionDecision({ turnId, turnRevision, gate }) {
    const instruction = gate === "existing_only_no_match"
        ? [
            "Briefly tell the learner that no saved Expression in their Word List clearly fits this situation.",
            "Do not invent a new Expression unless the learner asks for one outside their Word List.",
            "Offer to keep talking or let them describe the intended meaning another way.",
        ].join(" ")
        : [
            "Continue the original topic naturally.",
            "Do not introduce, recommend, or teach a new replacement word or phrase in this response.",
            "Do not mention Expression Assist, retrieval, or hidden analysis.",
        ].join(" ");
    return {
        sourceTurnId: turnId,
        sourceTurnRevision: turnRevision,
        action: EXPRESSION_ASSIST_ACTIONS.NO_ACTION,
        gate,
        instruction,
        effectId: null,
    };
}

function assistUnavailableDecision({ turnId, turnRevision, gate }) {
    return {
        sourceTurnId: turnId,
        sourceTurnRevision: turnRevision,
        action: "ASSIST_UNAVAILABLE",
        gate,
        instruction: [
            "In one short, natural sentence, tell the learner you couldn't check their Word List just now and ask them to try once more.",
            "Do not claim that their Word List has no matching Expression.",
            "Do not recommend an unverified replacement Expression or mention MongoDB, Atlas, providers, tools, hidden analysis, or internal errors.",
        ].join(" "),
        effectId: null,
    };
}

function softRecastDecision({ turnId, turnRevision, observation }) {
    return {
        sourceTurnId: turnId,
        sourceTurnRevision: turnRevision,
        action: EXPRESSION_INTERVENTION_ACTIONS.SOFT_RECAST,
        gate: "default_soft_recast",
        gapType: observation?.gapType || null,
        instruction: [
            "Respond to the learner's intended content first.",
            "Naturally model at most one corrected grammar or collocation form from their latest turn without announcing a correction lesson.",
            "Do not recommend a new Expression, mention a card, or ask the learner to repeat the sentence.",
            "Keep the conversation moving on the original topic.",
        ].join(" "),
        effectId: null,
    };
}

function clarifyDecision({ turnId, turnRevision, observation }) {
    const intendedMeaning = cleanText(observation?.intendedMeaning, 320);
    return {
        sourceTurnId: turnId,
        sourceTurnRevision: turnRevision,
        action: EXPRESSION_INTERVENTION_ACTIONS.CLARIFY,
        gate: "default_clarify",
        gapType: observation?.gapType || null,
        intendedMeaning,
        instruction: [
            "Ask exactly one concise clarification question before teaching any Expression.",
            `Confirm whether the learner means: "${intendedMeaning}".`,
            "Do not recommend a word or phrase, create or mention a card, or ask for verbatim repetition yet.",
        ].join(" "),
        effectId: null,
    };
}

function buildPendingClarification(payload, observation, turnRevision, createdAt) {
    return {
        sourceTurnId: cleanText(payload?.turnId, 220),
        sourceTurnRevision: turnRevision,
        originalAttempt: cleanText(payload?.transcript, 1_000),
        gapType: cleanText(observation?.gapType, 60),
        intendedMeaning: cleanText(observation?.intendedMeaning, 320),
        communicativeFunction: cleanText(observation?.communicativeFunction, 240),
        situation: cleanText(observation?.situation, 320),
        evidence: (Array.isArray(observation?.evidence) ? observation.evidence : []).slice(0, 6),
        createdAt,
    };
}

export function classifyExpressionAssistHardGate(state, payload, nowMs = Date.now()) {
    const transcript = cleanText(payload?.transcript, 4_000);
    const normalized = normalizedAttempt(transcript);
    const nextTurnRevision = Number(state?.lastCompletedTurnRevision || 0) + 1;

    if (!normalized || normalized.includes("inaudible") || normalized.includes("transcribing")) {
        return { eligible: false, gate: "untrusted_transcript" };
    }
    if (SHORT_ACKNOWLEDGEMENTS.has(normalized)) return { eligible: false, gate: "short_acknowledgement" };
    if (state?.lastAttemptHash && state.lastAttemptHash === attemptHash(transcript)) {
        return { eligible: false, gate: "duplicate_attempt" };
    }

    const rawLastRecommendationRevision = state?.lastRecommendationRevision;
    if (rawLastRecommendationRevision != null) {
        const lastRecommendationRevision = Number(rawLastRecommendationRevision);
        const lastRecommendationAtMs = Date.parse(state?.lastRecommendationAt || "");
        const sameRecommendationContext = overlapRatio(
            state?.lastRecommendationAttempt?.text || "",
            transcript,
        ) >= 0.35;
        if (sameRecommendationContext && Number.isInteger(lastRecommendationRevision) && (
            nextTurnRevision - lastRecommendationRevision <= EXPRESSION_ASSIST_COOLDOWN_TURNS
            || (Number.isFinite(lastRecommendationAtMs)
                && nowMs - lastRecommendationAtMs < EXPRESSION_ASSIST_COOLDOWN_MS)
        )) {
            return { eligible: false, gate: "cooldown" };
        }
    }

    return { eligible: true };
}

export function classifyExpressionAssistCandidate(state, payload, nowMs = Date.now()) {
    const hardGate = classifyExpressionAssistHardGate(state, payload, nowMs);
    if (!hardGate.eligible) return hardGate;
    const transcript = cleanText(payload?.transcript, 4_000);
    const currentWords = words(transcript);

    if (isExplicitExpressionRequest(transcript)) {
        return {
            eligible: true,
            reasonCode: EXPRESSION_ASSIST_REASON_CODES.ASKED_HOW_TO_SAY,
            retrievalScope: detectExpressionRetrievalScope(transcript),
        };
    }
    if (currentWords.length >= 18 || transcript.length >= 110) {
        return { eligible: true, reasonCode: EXPRESSION_ASSIST_REASON_CODES.CIRCUMLOCUTION };
    }

    const previous = state?.previousLearnerAttempt?.text || "";
    if (previous && currentWords.length >= 8 && overlapRatio(previous, transcript) >= 0.35) {
        return { eligible: true, reasonCode: EXPRESSION_ASSIST_REASON_CODES.REPEATED_REPAIR };
    }
    return { eligible: false, gate: "ordinary_turn" };
}

function buildMessages(payload, { pendingClarification = null } = {}) {
    const messages = (Array.isArray(payload?.contextMessages) ? payload.contextMessages : [])
        .map((message) => ({
            messageId: cleanText(message?.messageId, 220),
            role: message?.role,
            text: cleanText(message?.text),
        }))
        .filter((message) => message.messageId && ["user", "assistant"].includes(message.role) && message.text);
    const turnId = cleanText(payload?.turnId, 220);
    const transcript = cleanText(payload?.transcript);
    const currentMessage = { messageId: turnId, role: "user", text: transcript };
    const previousMessages = messages.filter((message) => message.messageId !== turnId);
    if (pendingClarification?.sourceTurnId && pendingClarification?.originalAttempt) {
        const sourceMessage = {
            messageId: cleanText(pendingClarification.sourceTurnId, 220),
            role: "user",
            text: cleanText(pendingClarification.originalAttempt),
        };
        const latestOtherMessage = previousMessages
            .filter((message) => message.messageId !== sourceMessage.messageId)
            .slice(-1);
        return [sourceMessage, ...latestOtherMessage, currentMessage];
    }
    return [...previousMessages.slice(-2), currentMessage];
}

function buildDecisionRequest(state, payload, candidate) {
    const messages = buildMessages(payload, {
        pendingClarification: state.pendingClarification,
    });
    const currentTurnId = cleanText(payload.turnId, 220);
    const previousAssistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")?.text || "Free Chat conversation";
    const previousLearner = [...messages]
        .reverse()
        .find((message) => message.role === "user" && message.messageId !== currentTurnId)?.text || "";
    const transcript = cleanText(payload.transcript, 4_000);
    const turnRevision = Number(state.lastCompletedTurnRevision || 0) + 1;
    const explicitRequest = candidate.reasonCode === EXPRESSION_ASSIST_REASON_CODES.ASKED_HOW_TO_SAY;
    return {
        assistRequestId: cleanText(state.event?.eventId, 220),
        userId: state.userId,
        sessionId: state.sourceSessionId,
        turnId: currentTurnId,
        turnRevision,
        mode: "FREE_CHAT",
        trigger: {
            reasonCode: candidate.reasonCode,
            gapType: candidate.gapType || null,
            retrievalScope: candidate.retrievalScope || detectExpressionRetrievalScope(transcript),
            intendedMeaning: cleanText(
                candidate.intendedMeaning || (explicitRequest ? previousLearner : "") || transcript,
                320,
            ),
            communicativeFunction: cleanText(
                candidate.communicativeFunction
                    || (candidate.reasonCode === EXPRESSION_ASSIST_REASON_CODES.ASKED_HOW_TO_SAY
                        ? "Find one natural spoken-English Expression for the learner's intended meaning"
                        : "Express the learner's intended meaning clearly and naturally in spoken English"),
                240,
            ),
            situation: cleanText(
                candidate.situation || (explicitRequest ? previousLearner : "") || previousAssistant,
                320,
            ),
        },
        context: { messages },
        excludedVocabularyIds: [],
    };
}

function buildCardEffect(state, payload, decision, nowIso) {
    const effectId = `${EXPRESSION_ASSIST_EFFECT_TYPES.PRESENT_EXPRESSION_CARD}:${state.assistRunId}:${payload.turnId}`;
    const reuse = decision.action === EXPRESSION_ASSIST_ACTIONS.REUSE_EXISTING;
    return {
        effectId,
        type: EXPRESSION_ASSIST_EFFECT_TYPES.PRESENT_EXPRESSION_CARD,
        status: EXPRESSION_ASSIST_EFFECT_STATUS.PENDING,
        sourceTurnId: payload.turnId,
        sourceTurnRevision: Number(state.lastCompletedTurnRevision || 0) + 1,
        attempts: 0,
        leaseUntil: null,
        createdAt: nowIso,
        payload: {
            proposal: {
                expression: decision.expression,
                definition: decision.definition,
                usage: decision.usage,
                sourceText: cleanText(
                    state.pendingClarification?.originalAttempt || payload.transcript,
                    600,
                ),
            },
            metadata: {
                discoveryMode: "AGENT_SUGGESTED_GAP",
                assistRequestId: state.event?.eventId,
                requestMessageId: payload.turnId,
                primaryAction: reuse ? "LEARN_TODAY" : "SAVE",
                savedVocabularyId: reuse ? decision.selectedVocabularyId : null,
                learningContext: reuse ? null : (decision.learningContext || null),
            },
        },
    };
}

function buildRecommendationInstruction(decision) {
    if (decision.action === EXPRESSION_ASSIST_ACTIONS.REUSE_EXISTING) {
        return [
            "The Learn today card is already visible for a useful Expression in the learner's Word List.",
            `Briefly remind them of "${decision.expression}" and naturally recast their meaning${decision.recast ? ` as "${decision.recast}"` : ""}.`,
            "End with one short, topic-relevant prompt inviting them to use it once. If they decline or ignore it, continue next turn without repeating the drill.",
            "Do not call request_expression_assist.",
        ].join(" ");
    }
    return [
        "The optional Expression card is already visible.",
        `Introduce "${decision.expression}" in one witty, concise line${decision.recast ? ` and use this natural recast: "${decision.recast}"` : ""}.`,
        "End with one short, topic-relevant prompt inviting the learner to use it once. If they decline or ignore it, continue next turn without repeating the drill.",
        "Do not call request_expression_assist.",
    ].join(" ");
}

function accepted(code, extra = {}) {
    return { applied: true, code, ...extra };
}

export function createExpressionAssistNodes({
    decisionService,
    gapService = null,
    now = () => new Date(),
} = {}) {
    function validateEventNode(state) {
        return { eventValidation: validateExpressionAssistEvent(state, state.event, { nowMs: now().getTime() }) };
    }

    function startRunNode() {
        return { eventOutcome: accepted("RUN_STARTED"), lastError: null };
    }

    function resetContextNode() {
        return {
            lastCompletedTurnId: null,
            lastAttemptHash: null,
            previousLearnerAttempt: null,
            pendingClarification: null,
            latestDecision: null,
            eventOutcome: accepted("CONTEXT_RESET"),
            lastError: null,
        };
    }

    async function evaluateTurnNode(state) {
        const payload = state.event?.payload || {};
        const turnRevision = Number(state.lastCompletedTurnRevision || 0) + 1;
        const hash = attemptHash(payload.transcript);
        const explicitRequest = isExplicitExpressionRequest(payload.transcript);
        const resolvingClarification = Boolean(state.pendingClarification);
        const hardGate = classifyExpressionAssistHardGate(state, payload, now().getTime());
        const common = {
            lastCompletedTurnId: payload.turnId,
            lastCompletedTurnRevision: turnRevision,
            lastAttemptHash: hash,
            previousLearnerAttempt: {
                turnId: payload.turnId,
                text: cleanText(payload.transcript, 1_600),
            },
            pendingClarification: null,
            lastError: null,
        };
        const bypassHardGate = (explicitRequest && hardGate.gate === "cooldown")
            || (resolvingClarification && hardGate.gate === "short_acknowledgement");
        if (!hardGate.eligible && !bypassHardGate) {
            return {
                ...common,
                pendingClarification: hardGate.gate === "untrusted_transcript"
                    ? state.pendingClarification
                    : null,
                latestDecision: noActionDecision({
                    turnId: payload.turnId,
                    turnRevision,
                    gate: hardGate.gate,
                }),
                eventOutcome: accepted("TURN_FAST_PATH", { gate: hardGate.gate }),
            };
        }

        let candidate;
        let semanticGateTelemetry = null;
        let semanticObservation = null;
        if (explicitRequest) {
            candidate = {
                eligible: true,
                reasonCode: EXPRESSION_ASSIST_REASON_CODES.ASKED_HOW_TO_SAY,
            };
        } else if (gapService?.enabled) {
            try {
                semanticObservation = await gapService.evaluate({
                    turnId: cleanText(payload.turnId, 220),
                    transcript: cleanText(payload.transcript, 4_000),
                    contextMessages: buildMessages(payload),
                    pendingClarification: resolvingClarification
                        ? state.pendingClarification
                        : null,
                });
                semanticGateTelemetry = semanticObservation.telemetry || null;
            } catch (error) {
                return {
                    ...common,
                    latestDecision: noActionDecision({
                        turnId: payload.turnId,
                        turnRevision,
                        gate: "semantic_gate_failure",
                    }),
                    eventOutcome: accepted("TURN_FAST_PATH", {
                        gate: "semantic_gate_failure",
                        errorCode: cleanText(error?.code || "provider_failure", 80),
                    }),
                };
            }

            const intervention = selectDefaultExpressionIntervention(semanticObservation, {
                resolvingClarification,
            });
            const semanticOutcome = {
                gate: intervention.reason,
                semanticDecision: semanticObservation.decision,
                interventionAction: intervention.action,
                semanticGateMs: semanticGateTelemetry?.totalMs ?? null,
            };
            if (intervention.action === EXPRESSION_INTERVENTION_ACTIONS.NO_ACTION) {
                return {
                    ...common,
                    latestDecision: noActionDecision({
                        turnId: payload.turnId,
                        turnRevision,
                        gate: intervention.reason,
                    }),
                    eventOutcome: accepted("TURN_FAST_PATH", semanticOutcome),
                };
            }
            if (intervention.action === EXPRESSION_INTERVENTION_ACTIONS.SOFT_RECAST) {
                return {
                    ...common,
                    latestDecision: softRecastDecision({
                        turnId: payload.turnId,
                        turnRevision,
                        observation: semanticObservation,
                    }),
                    eventOutcome: accepted("TURN_SOFT_RECAST", semanticOutcome),
                };
            }
            if (intervention.action === EXPRESSION_INTERVENTION_ACTIONS.CLARIFY) {
                return {
                    ...common,
                    pendingClarification: buildPendingClarification(
                        payload,
                        semanticObservation,
                        turnRevision,
                        now().toISOString(),
                    ),
                    latestDecision: clarifyDecision({
                        turnId: payload.turnId,
                        turnRevision,
                        observation: semanticObservation,
                    }),
                    eventOutcome: accepted("TURN_CLARIFY", semanticOutcome),
                };
            }
            candidate = {
                eligible: true,
                reasonCode: EXPRESSION_ASSIST_REASON_CODES.SEMANTIC_GAP,
                gapType: semanticObservation.gapType,
                intendedMeaning: semanticObservation.intendedMeaning,
                communicativeFunction: semanticObservation.communicativeFunction,
                situation: semanticObservation.situation,
            };
        } else {
            candidate = classifyExpressionAssistCandidate(state, payload, now().getTime());
            if (!candidate.eligible) {
                return {
                    ...common,
                    latestDecision: noActionDecision({
                        turnId: payload.turnId,
                        turnRevision,
                        gate: candidate.gate,
                    }),
                    eventOutcome: accepted("TURN_FAST_PATH", { gate: candidate.gate }),
                };
            }
        }

        let decision;
        try {
            decision = await decisionService.decide(
                buildDecisionRequest(state, payload, candidate),
                { policyAuthority: "graph" },
            );
        } catch {
            decision = { action: EXPRESSION_ASSIST_ACTIONS.NO_ACTION, diagnostics: { gate: "provider_failure" } };
        }
        const semanticDetails = semanticObservation ? {
            semanticDecision: semanticObservation.decision,
            interventionAction: EXPRESSION_INTERVENTION_ACTIONS.EXPRESSION_CARD,
            semanticGateMs: semanticGateTelemetry?.totalMs ?? null,
        } : {};
        if (decision?.action === EXPRESSION_ASSIST_ACTIONS.NO_ACTION) {
            const gate = decision?.diagnostics?.gate || "no_material_gain";
            return {
                ...common,
                latestDecision: AUTHORITATIVE_ASSIST_FAILURE_GATES.has(gate)
                    ? assistUnavailableDecision({ turnId: payload.turnId, turnRevision, gate })
                    : noActionDecision({ turnId: payload.turnId, turnRevision, gate }),
                eventOutcome: accepted(
                    AUTHORITATIVE_ASSIST_FAILURE_GATES.has(gate)
                        ? "TURN_ASSIST_UNAVAILABLE"
                        : "TURN_NO_ACTION",
                    { gate, ...semanticDetails },
                ),
            };
        }

        const duplicateRecommendation = normalizedAttempt(decision.expression)
            === normalizedAttempt(state.lastRecommendedExpression);
        const undeliveredDuplicateEffect = duplicateRecommendation
            ? findPendingExpressionEffect(state.effects, decision.expression)
            : null;
        if (duplicateRecommendation && !undeliveredDuplicateEffect) {
            return {
                ...common,
                latestDecision: noActionDecision({
                    turnId: payload.turnId,
                    turnRevision,
                    gate: "duplicate_recommendation",
                }),
                eventOutcome: accepted("TURN_NO_ACTION", {
                    gate: "duplicate_recommendation",
                    ...semanticDetails,
                }),
            };
        }

        const nowIso = now().toISOString();
        const effect = buildCardEffect(state, payload, decision, nowIso);
        const priorEffects = (Array.isArray(state.effects) ? state.effects : [])
            .filter((item) => (
                item?.effectId !== effect.effectId
                && item?.effectId !== undeliveredDuplicateEffect?.effectId
            ))
            .slice(-(EXPRESSION_ASSIST_EFFECT_LIMIT - 1));
        return {
            ...common,
            effects: [...priorEffects, effect],
            lastRecommendationAttempt: {
                turnId: payload.turnId,
                text: cleanText(
                    state.pendingClarification?.originalAttempt || payload.transcript,
                    1_600,
                ),
            },
            lastRecommendedExpression: cleanText(decision.expression, 220),
            lastRecommendationRevision: turnRevision,
            lastRecommendationAt: nowIso,
            latestDecision: {
                sourceTurnId: payload.turnId,
                sourceTurnRevision: turnRevision,
                action: decision.action,
                gate: "recommended",
                expression: decision.expression,
                recast: decision.recast || null,
                instruction: buildRecommendationInstruction(decision),
                effectId: effect.effectId,
            },
            eventOutcome: accepted("RECOMMENDATION_READY", {
                action: decision.action,
                effectId: effect.effectId,
                reissuedUndelivered: Boolean(undeliveredDuplicateEffect),
                ...semanticDetails,
            }),
        };
    }

    function claimEffectNode(state) {
        const effectId = state.event?.payload?.effectId;
        const nowDate = now();
        return {
            effects: (state.effects || []).map((effect) => effect?.effectId === effectId
                ? {
                    ...effect,
                    status: EXPRESSION_ASSIST_EFFECT_STATUS.IN_PROGRESS,
                    attempts: Number(effect.attempts || 0) + 1,
                    leaseUntil: new Date(nowDate.getTime() + EXPRESSION_ASSIST_EFFECT_LEASE_MS).toISOString(),
                }
                : effect),
            eventOutcome: accepted("CARD_EFFECT_CLAIMED", { effectId }),
        };
    }

    function settleEffectNode(state) {
        const effectId = state.event?.payload?.effectId;
        const completed = state.event?.type === EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_COMPLETED;
        let outcomeCode = completed ? "CARD_EFFECT_COMPLETED" : "CARD_EFFECT_RETRY_QUEUED";
        const effects = (state.effects || []).map((effect) => {
            if (effect?.effectId !== effectId) return effect;
            if (completed) {
                return {
                    ...effect,
                    status: EXPRESSION_ASSIST_EFFECT_STATUS.COMPLETE,
                    leaseUntil: null,
                    completedAt: now().toISOString(),
                };
            }
            const retryable = Number(effect.attempts || 0) < EXPRESSION_ASSIST_EFFECT_MAX_ATTEMPTS;
            if (!retryable) outcomeCode = "CARD_EFFECT_FAILED";
            return {
                ...effect,
                status: retryable
                    ? EXPRESSION_ASSIST_EFFECT_STATUS.PENDING
                    : EXPRESSION_ASSIST_EFFECT_STATUS.FAILED,
                leaseUntil: null,
                lastError: cleanText(state.event?.payload?.error, 240) || "card delivery failed",
            };
        });
        return {
            effects,
            eventOutcome: accepted(outcomeCode, { effectId }),
        };
    }

    function finalizeEventNode(state) {
        const revision = Number(state.revision || 0) + 1;
        const outcome = state.eventOutcome || accepted("EVENT_APPLIED");
        const processedEvents = [
            ...(Array.isArray(state.processedEvents) ? state.processedEvents : []),
            {
                eventId: state.event?.eventId,
                appliedRevision: revision,
                outcomeCode: outcome.code,
            },
        ].slice(-EXPRESSION_ASSIST_PROCESSED_EVENT_LIMIT);
        return {
            revision,
            controlRevision: Number(state.controlRevision || 0) + 1,
            processedEvents,
            lastEventResult: {
                ...outcome,
                eventId: state.event?.eventId,
                revision,
            },
            event: null,
            eventValidation: null,
            eventOutcome: null,
        };
    }

    function rejectEventNode(state) {
        const validation = state.eventValidation || {};
        return {
            lastEventResult: {
                applied: false,
                duplicate: Boolean(validation.duplicate),
                eventId: state.event?.eventId || null,
                revision: Number(state.revision || 0),
                code: validation.code || "INVALID_EVENT",
                message: validation.message || "Event was rejected",
                status: Number(validation.status || 409),
                processed: validation.processed || null,
            },
            event: null,
            eventValidation: null,
            eventOutcome: null,
        };
    }

    return {
        validateEventNode,
        startRunNode,
        resetContextNode,
        evaluateTurnNode,
        claimEffectNode,
        settleEffectNode,
        finalizeEventNode,
        rejectEventNode,
    };
}

export function routeExpressionAssistEvent(state) {
    if (!state?.eventValidation?.ok) return "reject_event";
    switch (state.event?.type) {
        case EXPRESSION_ASSIST_EVENT_TYPES.RUN_STARTED:
            return "start_run";
        case EXPRESSION_ASSIST_EVENT_TYPES.CONTEXT_RESET:
            return "reset_context";
        case EXPRESSION_ASSIST_EVENT_TYPES.FREE_CHAT_TURN_COMPLETED:
            return "evaluate_turn";
        case EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_CLAIMED:
            return "claim_effect";
        case EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_COMPLETED:
        case EXPRESSION_ASSIST_EVENT_TYPES.CARD_EFFECT_FAILED:
            return "settle_effect";
        default:
            return "reject_event";
    }
}
