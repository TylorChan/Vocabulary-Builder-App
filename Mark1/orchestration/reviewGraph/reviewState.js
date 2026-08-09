import { Annotation } from "@langchain/langgraph";
import {
    REVIEW_BEAT_STATUS,
    REVIEW_FLOW_VERSION,
    REVIEW_MAX_DUE_WORDS,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_STATE_SCHEMA_VERSION,
    REVIEW_TARGET_STATUS,
} from "./reviewConstants.js";
import {
    createBeatProgress,
    getNextPendingBeatId,
    getSceneTeachingBeats,
    normalizeTurnEvidence,
} from "./reviewTeaching.js";

const TARGET_STATUS_SET = new Set(Object.values(REVIEW_TARGET_STATUS));

function replaceValue(_current, next) {
    return next;
}

function replaceAnnotation(defaultFactory) {
    return Annotation({
        reducer: replaceValue,
        default: defaultFactory,
    });
}

export const ReviewState = Annotation.Root({
    stateSchemaVersion: replaceAnnotation(() => REVIEW_STATE_SCHEMA_VERSION),
    flowVersion: replaceAnnotation(() => REVIEW_FLOW_VERSION),
    reviewRunId: replaceAnnotation(() => null),
    userId: replaceAnnotation(() => null),
    sourceSessionId: replaceAnnotation(() => null),
    mode: replaceAnnotation(() => REVIEW_MODES.MODE_SELECT),
    phase: replaceAnnotation(() => REVIEW_PHASES.CHOOSE_MODE),
    dueWords: replaceAnnotation(() => []),
    rolePlayPlan: replaceAnnotation(() => null),
    planRevision: replaceAnnotation(() => 0),
    currentUserFocus: replaceAnnotation(() => ""),
    currentSceneIndex: replaceAnnotation(() => 0),
    activeSceneId: replaceAnnotation(() => null),
    activeBeatId: replaceAnnotation(() => null),
    targetProgress: replaceAnnotation(() => ({})),
    beatProgress: replaceAnnotation(() => ({})),
    recentTurnEvidence: replaceAnnotation(() => []),
    activeBeatOverride: replaceAnnotation(() => null),
    turnsInScene: replaceAnnotation(() => 0),
    noProgressTurns: replaceAnnotation(() => 0),
    effects: replaceAnnotation(() => []),
    processedEvents: replaceAnnotation(() => []),
    revision: replaceAnnotation(() => 0),
    controlRevision: replaceAnnotation(() => 0),
    legacyImportedAt: replaceAnnotation(() => null),
    lastError: replaceAnnotation(() => null),
    event: replaceAnnotation(() => null),
    eventValidation: replaceAnnotation(() => null),
    eventOutcome: replaceAnnotation(() => null),
    lastEventResult: replaceAnnotation(() => null),
});

function cleanText(value, maxLength = 240) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function getSceneId(scene, fallbackIndex = 0) {
    return cleanText(scene?.sceneId || scene?.id || scene?.title || `scene-${fallbackIndex + 1}`, 160);
}

export function getSceneTargets(scene) {
    const ids = Array.isArray(scene?.targetWordIds) ? scene.targetWordIds : [];
    const words = Array.isArray(scene?.targetWords) ? scene.targetWords : [];
    const targetCount = Math.max(ids.length, words.length);
    const targets = [];

    for (let index = 0; index < targetCount; index += 1) {
        const text = cleanText(words[index], 180);
        const id = cleanText(ids[index] || text || `target-${index + 1}`, 180);
        if (!id || !text) continue;
        targets.push({ id, text });
    }

    return targets;
}

export function createTargetProgress(scene, existing = {}) {
    return Object.fromEntries(getSceneTargets(scene).map((target) => {
        const previous = existing?.[target.id];
        return [target.id, {
            id: target.id,
            text: target.text,
            status: TARGET_STATUS_SET.has(previous?.status)
                ? previous.status
                : REVIEW_TARGET_STATUS.UNSEEN,
            mentions: Number(previous?.mentions || 0),
            completionAttempts: Number(previous?.completionAttempts || 0),
            attempts: Number(previous?.attempts || 0),
            hintsUsed: Number(previous?.hintsUsed || 0),
            successfulUses: Number(previous?.successfulUses || 0),
            transferUses: Number(previous?.transferUses || 0),
            lastBeatId: cleanText(previous?.lastBeatId, 160) || null,
            lastEvidenceTurnId: cleanText(previous?.lastEvidenceTurnId, 160) || null,
        }];
    }));
}

export function getActiveSceneFromState(state) {
    const scenes = Array.isArray(state?.rolePlayPlan?.scenes) ? state.rolePlayPlan.scenes : [];
    const index = Math.max(0, Number(state?.currentSceneIndex || 0));
    return scenes[index] || null;
}

export function activateSceneState(state, sceneIndex = state?.currentSceneIndex ?? 0) {
    const scenes = Array.isArray(state?.rolePlayPlan?.scenes) ? state.rolePlayPlan.scenes : [];
    const index = Math.max(0, Number(sceneIndex || 0));
    const scene = scenes[index];

    if (!scene) {
        return {
            mode: REVIEW_MODES.REVIEW,
            phase: REVIEW_PHASES.DONE,
            currentSceneIndex: scenes.length,
            activeSceneId: null,
            activeBeatId: null,
            targetProgress: {},
            beatProgress: {},
            recentTurnEvidence: [],
            activeBeatOverride: null,
            turnsInScene: 0,
            noProgressTurns: 0,
        };
    }

    const sceneId = getSceneId(scene, index);
    const sameScene = state?.activeSceneId === sceneId;
    const beats = getSceneTeachingBeats(scene);
    const existingBeatProgress = sameScene ? state?.beatProgress : {};
    const initialActiveBeatId = sameScene && beats.some((beat) => beat.beatId === state?.activeBeatId)
        ? state.activeBeatId
        : getNextPendingBeatId(scene, existingBeatProgress);
    return {
        mode: REVIEW_MODES.REVIEW,
        phase: REVIEW_PHASES.IN_SCENE,
        currentSceneIndex: index,
        activeSceneId: sceneId,
        activeBeatId: initialActiveBeatId,
        targetProgress: createTargetProgress(scene, sameScene ? state?.targetProgress : {}),
        beatProgress: createBeatProgress(scene, existingBeatProgress, initialActiveBeatId),
        recentTurnEvidence: sameScene && Array.isArray(state?.recentTurnEvidence)
            ? state.recentTurnEvidence
            : [],
        activeBeatOverride: sameScene && state?.activeBeatOverride?.beatId === initialActiveBeatId
            ? state.activeBeatOverride
            : null,
        turnsInScene: sameScene ? Number(state?.turnsInScene || 0) : 0,
        noProgressTurns: sameScene ? Number(state?.noProgressTurns || 0) : 0,
    };
}

export function normalizeDueWords(dueWords = []) {
    return (Array.isArray(dueWords) ? dueWords : [])
        .map((word) => ({
            id: cleanText(word?.id, 180),
            text: cleanText(word?.text, 180),
            definition: cleanText(word?.definition, 300),
            realLifeDef: cleanText(word?.realLifeDef, 300),
            surroundingText: cleanText(word?.surroundingText, 320),
            videoTitle: cleanText(word?.videoTitle, 180),
            learningContext: word?.learningContext && typeof word.learningContext === "object"
                ? word.learningContext
                : null,
            fsrsCard: word?.fsrsCard && typeof word.fsrsCard === "object"
                ? word.fsrsCard
                : null,
        }))
        .filter((word) => word.id && word.text)
        .slice(0, REVIEW_MAX_DUE_WORDS);
}

export function createInitialReviewState({
    reviewRunId,
    userId,
    sourceSessionId = null,
    dueWords = [],
    legacyProgress = null,
    event,
    now = new Date().toISOString(),
}) {
    const legacyPlan = legacyProgress?.rolePlayPlan?.scenes?.length
        ? legacyProgress.rolePlayPlan
        : null;
    const legacyIndex = Math.max(0, Number(legacyProgress?.currentSceneIndex || 0));
    const legacyComplete = Boolean(legacyProgress?.reviewComplete);
    const legacyPaused = legacyProgress?.currentSceneStep === "PAUSED";
    const initial = {
        stateSchemaVersion: REVIEW_STATE_SCHEMA_VERSION,
        flowVersion: REVIEW_FLOW_VERSION,
        reviewRunId,
        userId,
        sourceSessionId,
        mode: REVIEW_MODES.MODE_SELECT,
        phase: REVIEW_PHASES.CHOOSE_MODE,
        dueWords: normalizeDueWords(dueWords.length ? dueWords : legacyProgress?.vocabularyWords),
        rolePlayPlan: legacyPlan,
        planRevision: legacyPlan ? 1 : 0,
        currentUserFocus: cleanText(legacyProgress?.currentUserFocus, 160),
        currentSceneIndex: legacyIndex,
        activeSceneId: null,
        activeBeatId: null,
        targetProgress: {},
        beatProgress: {},
        recentTurnEvidence: [],
        activeBeatOverride: null,
        turnsInScene: 0,
        noProgressTurns: 0,
        effects: [],
        processedEvents: [],
        revision: 0,
        controlRevision: 0,
        legacyImportedAt: legacyPlan ? now : null,
        lastError: null,
        event,
        eventValidation: null,
        eventOutcome: null,
        lastEventResult: null,
    };

    if (legacyComplete) {
        initial.mode = REVIEW_MODES.REVIEW;
        initial.phase = REVIEW_PHASES.DONE;
        initial.currentSceneIndex = legacyPlan?.scenes?.length || legacyIndex;
        return initial;
    }

    if (legacyPlan) {
        const legacyScene = legacyPlan.scenes?.[legacyIndex] || null;
        const legacyActiveSceneId = legacyProgress?.activeSceneId
            || (legacyScene ? getSceneId(legacyScene, legacyIndex) : null);
        Object.assign(initial, activateSceneState({
            ...initial,
            activeSceneId: legacyActiveSceneId,
            targetProgress: legacyProgress?.targetProgress || {},
            turnsInScene: legacyProgress?.turnsInScene || 0,
            noProgressTurns: legacyProgress?.noProgressTurns || 0,
        }, legacyIndex));
        if (legacyPaused || legacyProgress?.currentSceneMode === REVIEW_MODES.FREE_CHAT) {
            initial.mode = REVIEW_MODES.FREE_CHAT;
            initial.phase = REVIEW_PHASES.PAUSED;
        }
    }

    return initial;
}

export function migrateReviewState(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    if (Number(snapshot.stateSchemaVersion || 1) >= REVIEW_STATE_SCHEMA_VERSION) return snapshot;

    const migratedBeatProgress = Object.fromEntries(Object.entries(
        snapshot.beatProgress && typeof snapshot.beatProgress === "object"
            ? snapshot.beatProgress
            : {},
    ).map(([beatId, progress]) => [beatId, {
        ...progress,
        status: Object.values(REVIEW_BEAT_STATUS).includes(progress?.status)
            ? progress.status
            : REVIEW_BEAT_STATUS.PENDING,
    }]));
    const migratedTargetProgress = Object.fromEntries(Object.entries(
        snapshot.targetProgress && typeof snapshot.targetProgress === "object"
            ? snapshot.targetProgress
            : {},
    ).map(([targetId, progress]) => [targetId, {
        ...progress,
        status: TARGET_STATUS_SET.has(progress?.status)
            ? progress.status
            : REVIEW_TARGET_STATUS.UNSEEN,
    }]));

    return {
        ...snapshot,
        stateSchemaVersion: REVIEW_STATE_SCHEMA_VERSION,
        flowVersion: REVIEW_FLOW_VERSION,
        planRevision: Number(snapshot.planRevision || (snapshot.rolePlayPlan ? 1 : 0)),
        activeBeatId: snapshot.activeBeatId || null,
        targetProgress: migratedTargetProgress,
        beatProgress: migratedBeatProgress,
        recentTurnEvidence: Array.isArray(snapshot.recentTurnEvidence)
            ? snapshot.recentTurnEvidence.slice(-5).map((evidence) => normalizeTurnEvidence(evidence, {
                eventId: evidence?.eventId,
                turnId: evidence?.turnId,
                recordedAt: evidence?.recordedAt,
            }))
            : [],
        activeBeatOverride: snapshot.activeBeatOverride || null,
    };
}
