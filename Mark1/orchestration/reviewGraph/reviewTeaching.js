import {
    REVIEW_BEAT_STATUS,
    REVIEW_BEAT_TYPES,
    REVIEW_MAX_BEATS_PER_SCENE,
    REVIEW_RECENT_EVIDENCE_LIMIT,
    REVIEW_SUPPORT_LEVELS,
    REVIEW_TARGET_STATUS,
    REVIEW_TURN_OUTCOMES,
} from "./reviewConstants.js";

const SETTLED_TARGET_STATUSES = new Set([
    REVIEW_TARGET_STATUS.USED_WITH_HINT,
    REVIEW_TARGET_STATUS.USED_UNPROMPTED,
    REVIEW_TARGET_STATUS.TRANSFERRED,
    REVIEW_TARGET_STATUS.MENTIONED,
]);
const SETTLED_BEAT_STATUSES = new Set([
    REVIEW_BEAT_STATUS.ACHIEVED,
    REVIEW_BEAT_STATUS.EXHAUSTED,
    REVIEW_BEAT_STATUS.SKIPPED,
]);
const BEAT_TYPE_SET = new Set(Object.values(REVIEW_BEAT_TYPES));
const BEAT_STATUS_SET = new Set(Object.values(REVIEW_BEAT_STATUS));
const SUPPORT_LEVEL_SET = new Set(Object.values(REVIEW_SUPPORT_LEVELS));
const TURN_OUTCOME_SET = new Set(Object.values(REVIEW_TURN_OUTCOMES));

function cleanText(value, maxLength = 240) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampInteger(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isInteger(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

export function getSceneTeachingBeats(scene) {
    const targetIds = new Set(Array.isArray(scene?.targetWordIds) ? scene.targetWordIds : []);
    const usedBeatIds = new Set();
    return (Array.isArray(scene?.teachingBeats) ? scene.teachingBeats : [])
        .slice(0, REVIEW_MAX_BEATS_PER_SCENE)
        .map((beat, index) => {
            const beatId = cleanText(beat?.beatId || `beat-${index + 1}`, 160);
            if (!beatId || usedBeatIds.has(beatId)) return null;
            const beatTargetIds = [...new Set((Array.isArray(beat?.targetIds) ? beat.targetIds : [])
                .map((id) => cleanText(id, 180))
                .filter((id) => targetIds.has(id)))];
            if (!beatTargetIds.length) return null;
            usedBeatIds.add(beatId);
            const supportLadder = [...new Set((Array.isArray(beat?.supportLadder) ? beat.supportLadder : [])
                .filter((level) => SUPPORT_LEVEL_SET.has(level) && level !== REVIEW_SUPPORT_LEVELS.NONE))]
                .slice(0, 3);
            return {
                ...beat,
                beatId,
                type: BEAT_TYPE_SET.has(beat?.type) ? beat.type : REVIEW_BEAT_TYPES.ELICIT,
                targetIds: beatTargetIds,
                supportLadder,
                limits: {
                    maxTurns: clampInteger(beat?.limits?.maxTurns, 1, 8, 4),
                    maxExplicitRetries: clampInteger(beat?.limits?.maxExplicitRetries, 0, 3, 1),
                },
            };
        })
        .filter(Boolean);
}

export function getActiveBeatFromState(state) {
    const scenes = Array.isArray(state?.rolePlayPlan?.scenes) ? state.rolePlayPlan.scenes : [];
    const scene = scenes[Math.max(0, Number(state?.currentSceneIndex || 0))] || null;
    return getSceneTeachingBeats(scene).find((beat) => beat.beatId === state?.activeBeatId) || null;
}

export function createBeatProgress(scene, existing = {}, activeBeatId = null) {
    return Object.fromEntries(getSceneTeachingBeats(scene).map((beat) => {
        const previous = existing?.[beat.beatId];
        const status = BEAT_STATUS_SET.has(previous?.status)
            ? previous.status
            : (beat.beatId === activeBeatId ? REVIEW_BEAT_STATUS.ACTIVE : REVIEW_BEAT_STATUS.PENDING);
        return [beat.beatId, {
            status,
            turns: Math.max(0, Number(previous?.turns || 0)),
            supportLevel: SUPPORT_LEVEL_SET.has(previous?.supportLevel)
                ? previous.supportLevel
                : REVIEW_SUPPORT_LEVELS.NONE,
            repairAttempts: Math.max(0, Number(previous?.repairAttempts || 0)),
            replanAttempts: Math.max(0, Number(previous?.replanAttempts || 0)),
            lastOutcome: TURN_OUTCOME_SET.has(previous?.lastOutcome) ? previous.lastOutcome : null,
            lastEvidenceTurnId: cleanText(previous?.lastEvidenceTurnId, 160) || null,
        }];
    }));
}

export function getNextPendingBeatId(scene, beatProgress, afterBeatId = null) {
    const beats = getSceneTeachingBeats(scene);
    const startIndex = afterBeatId ? beats.findIndex((beat) => beat.beatId === afterBeatId) + 1 : 0;
    return beats.slice(Math.max(0, startIndex)).find((beat) => {
        const status = beatProgress?.[beat.beatId]?.status || REVIEW_BEAT_STATUS.PENDING;
        return !SETTLED_BEAT_STATUSES.has(status);
    })?.beatId || null;
}

export function isTargetSettled(item) {
    return SETTLED_TARGET_STATUSES.has(item?.status);
}

export function areSceneBeatsSettled(scene, beatProgress) {
    const beats = getSceneTeachingBeats(scene);
    return beats.length > 0 && beats.every((beat) => SETTLED_BEAT_STATUSES.has(beatProgress?.[beat.beatId]?.status));
}

export function getNextSupportLevel(beat, currentLevel) {
    const ladder = getSceneTeachingBeats({
        targetWordIds: beat?.targetIds,
        teachingBeats: [beat],
    })[0]?.supportLadder || [];
    if (!ladder.length) return null;
    if (!currentLevel || currentLevel === REVIEW_SUPPORT_LEVELS.NONE) return ladder[0];
    const index = ladder.indexOf(currentLevel);
    return index >= 0 ? ladder[index + 1] || null : ladder[0];
}

export function normalizeTurnEvidence(value, {
    eventId = null,
    turnId = null,
    activeBeat = null,
    matchedTargetIds = [],
    recordedAt = new Date().toISOString(),
} = {}) {
    const allowedTargetIds = new Set(activeBeat?.targetIds || matchedTargetIds);
    const matchedIds = new Set(matchedTargetIds);
    const targetEvidence = (Array.isArray(value?.targetEvidence) ? value.targetEvidence : [])
        .map((item) => {
            const targetId = cleanText(item?.targetId, 180);
            if (!targetId || (allowedTargetIds.size && !allowedTargetIds.has(targetId))) return null;
            return {
                targetId,
                meaningFit: item?.meaningFit === true,
                contextFit: item?.contextFit === true,
                usageMode: cleanText(item?.usageMode || (matchedIds.has(targetId) ? "EXACT_LEXICAL" : "NOT_USED"), 40),
                matched: item?.matched === true || matchedIds.has(targetId),
            };
        })
        .filter(Boolean)
        .slice(0, 30);
    const asrUncertain = value?.asrUncertain === true
        || value?.outcome === REVIEW_TURN_OUTCOMES.ASR_UNCERTAIN;
    let outcome = TURN_OUTCOME_SET.has(value?.outcome) ? value.outcome : REVIEW_TURN_OUTCOMES.PARTIAL;
    if (asrUncertain) {
        outcome = REVIEW_TURN_OUTCOMES.ASR_UNCERTAIN;
    } else if (outcome === REVIEW_TURN_OUTCOMES.ACHIEVED && activeBeat?.targetIds?.length) {
        const successfulIds = new Set(targetEvidence
            .filter((item) => item.meaningFit && item.contextFit && item.matched)
            .map((item) => item.targetId));
        if (!activeBeat.targetIds.every((targetId) => successfulIds.has(targetId))) {
            outcome = REVIEW_TURN_OUTCOMES.PARTIAL;
        }
    }
    const rawConfidence = Number(value?.confidence);
    return {
        eventId: cleanText(eventId || value?.eventId, 128) || null,
        turnId: cleanText(turnId || value?.turnId || eventId, 160) || null,
        outcome,
        targetEvidence,
        asrUncertain,
        confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0,
        recordedAt: cleanText(value?.recordedAt || recordedAt, 80),
    };
}

export function appendRecentTurnEvidence(existing, evidence) {
    const current = Array.isArray(existing) ? existing : [];
    if (evidence?.turnId && current.some((item) => item?.turnId === evidence.turnId)) {
        return current.slice(-REVIEW_RECENT_EVIDENCE_LIMIT);
    }
    return [...current, evidence].slice(-REVIEW_RECENT_EVIDENCE_LIMIT);
}

export function normalizeBeatOverride(value, { beat, planRevision = 0, fallbackId } = {}) {
    if (!value || !beat) return null;
    const targetIds = [...new Set((Array.isArray(value.targetIds) ? value.targetIds : beat.targetIds)
        .map((id) => cleanText(id, 180))
        .filter((id) => beat.targetIds.includes(id)))];
    const questionIntent = cleanText(value.questionIntent, 320);
    const communicativeGoal = cleanText(value.communicativeGoal, 320);
    if (!targetIds.length || !questionIntent || !communicativeGoal) return null;
    const overrideId = cleanText(value.overrideId || fallbackId, 220);
    if (!overrideId) return null;
    return {
        overrideId,
        beatId: beat.beatId,
        basedOnPlanRevision: Number(planRevision || 0),
        reasonCode: cleanText(value.reasonCode || "SUPPORT_EXHAUSTED", 80),
        targetIds,
        questionIntent,
        communicativeGoal,
        supportLevel: SUPPORT_LEVEL_SET.has(value.supportLevel)
            ? value.supportLevel
            : REVIEW_SUPPORT_LEVELS.CONTEXT_CUE,
        constraints: {
            endWithQuestion: value?.constraints?.endWithQuestion !== false,
            maxTeacherSentences: clampInteger(value?.constraints?.maxTeacherSentences, 1, 3, 2),
            doNotRequireExactSentence: value?.constraints?.doNotRequireExactSentence !== false,
            doNotReopenCompletedTargets: value?.constraints?.doNotReopenCompletedTargets !== false,
        },
        expiresAfterTurnId: cleanText(value.expiresAfterTurnId, 160) || null,
        overrideRevision: Math.max(1, Number(value.overrideRevision || 1)),
    };
}
