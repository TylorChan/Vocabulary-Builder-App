import { createHash } from "node:crypto";
import {
    REVIEW_MAX_TURN_CHARS,
    REVIEW_TURN_OUTCOMES,
} from "./reviewConstants.js";
import { getSceneTargets } from "./reviewState.js";

function normalize(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[’']/g, "'")
        .replace(/[^\p{L}\p{N}']+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function simpleWordForms(word) {
    if (!word || word.includes(" ")) return [word];
    const forms = new Set([word]);
    if (word.length >= 3) {
        forms.add(`${word}s`);
        forms.add(`${word}es`);
        forms.add(`${word}ed`);
        forms.add(`${word}ing`);
        if (word.endsWith("y") && word.length > 3) forms.add(`${word.slice(0, -1)}ies`);
        if (word.endsWith("e")) {
            forms.add(`${word}d`);
            forms.add(`${word.slice(0, -1)}ing`);
        }
    }
    return [...forms];
}

function containsExpression(normalizedTranscript, expression) {
    const normalizedExpression = normalize(expression);
    if (!normalizedExpression) return false;
    const paddedTranscript = ` ${normalizedTranscript} `;
    return simpleWordForms(normalizedExpression)
        .some((form) => paddedTranscript.includes(` ${form} `));
}

export function matchReviewTurn({ transcript, activeScene }) {
    const boundedTranscript = String(transcript ?? "").slice(0, REVIEW_MAX_TURN_CHARS);
    const normalizedTranscript = normalize(boundedTranscript);
    const matchedTargetIds = getSceneTargets(activeScene)
        .filter((target) => containsExpression(normalizedTranscript, target.text))
        .map((target) => target.id);
    const asrUncertain = /\b(?:inaudible|unintelligible|unclear audio|no speech)\b/i.test(boundedTranscript)
        || /\[(?:noise|silence|inaudible|unintelligible)\]/i.test(boundedTranscript);

    return {
        matchedTargetIds,
        transcriptDigest: createHash("sha256").update(boundedTranscript).digest("hex"),
        characterCount: boundedTranscript.length,
        truncated: String(transcript ?? "").length > boundedTranscript.length,
        asrUncertain,
    };
}

export function buildDeterministicTurnEvidence({
    observation,
    activeBeat,
    noProgressTurns = 0,
} = {}) {
    const matchedTargetIds = new Set(observation?.matchedTargetIds || []);
    const activeTargetIds = Array.isArray(activeBeat?.targetIds) ? activeBeat.targetIds : [];
    const matchedActiveTargetIds = activeTargetIds.filter((id) => matchedTargetIds.has(id));
    let outcome = REVIEW_TURN_OUTCOMES.PARTIAL;
    let confidence = 0.45;

    if (observation?.asrUncertain) {
        outcome = REVIEW_TURN_OUTCOMES.ASR_UNCERTAIN;
        confidence = 0.2;
    } else if (activeTargetIds.length > 0 && matchedActiveTargetIds.length === activeTargetIds.length) {
        outcome = REVIEW_TURN_OUTCOMES.ACHIEVED;
        confidence = 1;
    } else if (Number(noProgressTurns || 0) >= 1) {
        outcome = REVIEW_TURN_OUTCOMES.STUCK;
        confidence = 0.6;
    }

    return {
        outcome,
        targetEvidence: activeTargetIds.map((targetId) => ({
            targetId,
            meaningFit: matchedTargetIds.has(targetId),
            contextFit: matchedTargetIds.has(targetId),
            usageMode: matchedTargetIds.has(targetId) ? "EXACT_LEXICAL" : "NOT_USED",
            matched: matchedTargetIds.has(targetId),
        })),
        asrUncertain: observation?.asrUncertain === true,
        confidence,
    };
}
