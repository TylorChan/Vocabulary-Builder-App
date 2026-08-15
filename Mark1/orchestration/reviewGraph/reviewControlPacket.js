import {
    REVIEW_EFFECT_STATUS,
    REVIEW_MODES,
    REVIEW_PHASES,
    REVIEW_TOOL_NAMES,
} from "./reviewConstants.js";
import { isRatingLeaseExpired } from "./reviewEvents.js";
import { getActiveSceneFromState, getSceneTargets } from "./reviewState.js";
import {
    getActiveBeatFromState,
    getSceneTeachingBeats,
    isTargetSettled,
} from "./reviewTeaching.js";

function compactText(value, maxLength = 320) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

function sanitizeScene(scene) {
    if (!scene) return null;
    return {
        sceneId: compactText(scene.sceneId || scene.id || scene.title, 160),
        title: compactText(scene.title, 180),
        abstract: compactText(scene.abstract || scene.goal || scene.background, 150),
        setting: compactText(scene.setting, 360),
        background: compactText(scene.background, 480),
        roles: Array.isArray(scene.roles) ? scene.roles.slice(0, 4).map((item) => compactText(item, 160)) : [],
        goal: compactText(scene.goal, 360),
        starterLine: compactText(scene.starterLine, 360),
        tone: compactText(scene.tone, 80),
        sensoryDetail: compactText(scene.sensoryDetail, 280),
        suggestedSlang: Array.isArray(scene.suggestedSlang)
            ? scene.suggestedSlang.slice(0, 4).map((item) => compactText(item, 160))
            : [],
        targetWordIds: Array.isArray(scene.targetWordIds) ? scene.targetWordIds.slice(0, 30) : [],
        targetWords: Array.isArray(scene.targetWords) ? scene.targetWords.slice(0, 30) : [],
    };
}

function buildProgressOverview(state, scenes, {
    currentSceneIndex,
    activeBeat,
    completedTargetIds,
} = {}) {
    const phase = state?.phase || REVIEW_PHASES.CHOOSE_MODE;
    const completedIds = new Set(completedTargetIds || []);
    const activeTargetIds = new Set(Array.isArray(activeBeat?.targetIds) ? activeBeat.targetIds : []);
    const dueWords = Array.isArray(state?.dueWords) ? state.dueWords : [];
    const dueWordById = new Map(dueWords.map((word) => [String(word?.id || ""), word]));
    const dueWordByText = new Map(dueWords.map((word) => [
        String(word?.text || "").trim().toLowerCase(),
        word,
    ]));

    const projectedScenes = scenes.map((scene, sceneIndex) => {
        const isCompleted = phase === REVIEW_PHASES.DONE || sceneIndex < currentSceneIndex;
        const isActive = !isCompleted
            && phase === REVIEW_PHASES.IN_SCENE
            && sceneIndex === currentSceneIndex;
        const sceneStatus = isCompleted ? "COMPLETED" : isActive ? "ACTIVE" : "PENDING";
        const targets = getSceneTargets(scene);

        return {
            sceneId: compactText(scene?.sceneId || scene?.id || scene?.title, 160),
            title: compactText(scene?.title, 180),
            abstract: compactText(scene?.abstract || scene?.goal || scene?.background, 150),
            status: sceneStatus,
            expressions: targets.map((target) => {
                const dueWord = dueWordById.get(String(target.id))
                    || dueWordByText.get(String(target.text).trim().toLowerCase())
                    || null;
                const targetIsCompleted = isCompleted
                    || completedIds.has(target.id)
                    || isTargetSettled(state?.targetProgress?.[target.id]);
                const targetIsActive = !targetIsCompleted && isActive && activeTargetIds.has(target.id);

                return {
                    id: compactText(target.id, 180),
                    text: compactText(target.text, 180),
                    definition: compactText(dueWord?.definition || dueWord?.realLifeDef, 220),
                    status: targetIsCompleted ? "COMPLETED" : targetIsActive ? "ACTIVE" : "PENDING",
                };
            }),
        };
    });

    return {
        schemaVersion: 1,
        currentSceneIndex: Math.min(currentSceneIndex, Math.max(0, scenes.length - 1)),
        sceneCount: scenes.length,
        scenes: projectedScenes,
    };
}

function sanitizeBeat(beat) {
    if (!beat) return null;
    return {
        beatId: compactText(beat.beatId, 160),
        type: compactText(beat.type, 40),
        targetIds: Array.isArray(beat.targetIds) ? beat.targetIds.slice(0, 6).map((id) => compactText(id, 180)) : [],
        communicativeNeed: {
            situation: compactText(beat.communicativeNeed?.situation, 260),
            reasonToSpeak: compactText(beat.communicativeNeed?.reasonToSpeak, 220),
            userRole: compactText(beat.communicativeNeed?.userRole, 160),
        },
        teacherMove: {
            intent: compactText(beat.teacherMove?.intent, 300),
            responseShape: compactText(beat.teacherMove?.responseShape, 180),
            doNotRevealTarget: beat.teacherMove?.doNotRevealTarget === true,
        },
        successCriteria: {
            semanticGoal: compactText(beat.successCriteria?.semanticGoal, 280),
            preferredExpression: compactText(beat.successCriteria?.preferredExpression, 180),
            meaningMustFit: beat.successCriteria?.meaningMustFit !== false,
            contextMustFit: beat.successCriteria?.contextMustFit !== false,
            exactSentenceRequired: false,
            pronunciationCannotBeJudgedFromTranscriptOnly: true,
        },
        supportLadder: Array.isArray(beat.supportLadder) ? beat.supportLadder.slice(0, 3) : [],
        limits: {
            maxTurns: Number(beat.limits?.maxTurns || 4),
            maxExplicitRetries: Number(beat.limits?.maxExplicitRetries || 1),
        },
    };
}

function sanitizeBeatOverride(override) {
    if (!override) return null;
    return {
        overrideId: compactText(override.overrideId, 220),
        beatId: compactText(override.beatId, 160),
        reasonCode: compactText(override.reasonCode, 80),
        targetIds: Array.isArray(override.targetIds) ? override.targetIds.slice(0, 6) : [],
        questionIntent: compactText(override.questionIntent, 320),
        communicativeGoal: compactText(override.communicativeGoal, 320),
        supportLevel: compactText(override.supportLevel, 60),
        constraints: override.constraints || null,
        overrideRevision: Number(override.overrideRevision || 1),
    };
}

export function getAllowedReviewTools(state) {
    const expressionTool = REVIEW_TOOL_NAMES.SAVE_EXPRESSION;
    const resetTool = REVIEW_TOOL_NAMES.RESET;
    switch (state?.phase) {
        case REVIEW_PHASES.CHOOSE_MODE:
            return [REVIEW_TOOL_NAMES.CHOOSE_MODE, resetTool, expressionTool];
        case REVIEW_PHASES.FREE_CHAT:
            return [REVIEW_TOOL_NAMES.CHOOSE_MODE, resetTool, expressionTool];
        case REVIEW_PHASES.AWAIT_THEME:
        case REVIEW_PHASES.ERROR:
            return [REVIEW_TOOL_NAMES.SUBMIT_THEME, resetTool, expressionTool];
        case REVIEW_PHASES.IN_SCENE:
            return [
                REVIEW_TOOL_NAMES.REQUEST_COMPLETION,
                REVIEW_TOOL_NAMES.PAUSE,
                resetTool,
                expressionTool,
            ];
        case REVIEW_PHASES.PAUSED:
            return [REVIEW_TOOL_NAMES.RESUME, resetTool, expressionTool];
        case REVIEW_PHASES.DONE:
        default:
            return [resetTool, expressionTool];
    }
}

function getLatestOutcome(state) {
    return state?.eventOutcome || state?.lastEventResult || null;
}

function getNextAction(state, remainingTargets, activeBeat) {
    const outcome = getLatestOutcome(state);
    switch (state?.phase) {
        case REVIEW_PHASES.CHOOSE_MODE:
            return "ASK_MODE";
        case REVIEW_PHASES.FREE_CHAT:
            return "FREE_CHAT";
        case REVIEW_PHASES.AWAIT_THEME:
            return "ASK_THEME";
        case REVIEW_PHASES.PLANNING:
            return "WAIT_FOR_PLAN";
        case REVIEW_PHASES.IN_SCENE:
            if (state?.activeBeatOverride) return "FOLLOW_BEAT_OVERRIDE";
            if (outcome?.nextAction) return outcome.nextAction;
            if (activeBeat) return "ELICIT";
            if (getSceneTeachingBeats(getActiveSceneFromState(state)).length > 0) {
                return "REQUEST_COMPLETION_WHEN_NATURAL";
            }
            return ["COMPLETION_REJECTED", "REFOCUS"].includes(outcome?.code)
                ? "REFOCUS"
                : (remainingTargets.length ? "CONTINUE_SCENE" : "REQUEST_COMPLETION_WHEN_NATURAL");
        case REVIEW_PHASES.PAUSED:
            return "FREE_CHAT_WITH_REVIEW_RESUMABLE";
        case REVIEW_PHASES.DONE:
            return "CLOSE_REVIEW";
        case REVIEW_PHASES.ERROR:
            return "RETRY_PLANNING";
        default:
            return "WAIT";
    }
}

export function buildReviewPromptCheckpoint(state, {
    allowedTools,
    remainingTargets,
    activeScene,
    activeBeat,
    activeBeatProgress,
    activeBeatOverride,
    nextAction,
}) {
    const remainingText = remainingTargets.map((target) => target.text).filter(Boolean).join(", ") || "none";
    const sceneTitle = compactText(activeScene?.title || activeScene?.sceneId || "none", 160);
    const sceneGoal = compactText(activeScene?.goal || "none", 300);
    const hint = compactText(getLatestOutcome(state)?.hint || "", 220);

    const beatBlock = activeBeat ? `
Teaching beat: ${activeBeat.beatId} (${activeBeat.type})
Communicative situation: ${compactText(activeBeat.communicativeNeed?.situation, 260)}
Reason for learner to speak: ${compactText(activeBeat.communicativeNeed?.reasonToSpeak, 220)}
Teacher intent: ${compactText(activeBeat.teacherMove?.intent, 300)}
Response shape: ${compactText(activeBeat.teacherMove?.responseShape, 180)}
Success means: ${compactText(activeBeat.successCriteria?.semanticGoal, 280)}
Preferred expression: ${compactText(activeBeat.successCriteria?.preferredExpression, 180)}
Support level: ${compactText(activeBeatProgress?.supportLevel || "NONE", 60)}
Beat turns: ${Number(activeBeatProgress?.turns || 0)} / ${Number(activeBeat.limits?.maxTurns || 4)}` : "";
    const overrideBlock = activeBeatOverride ? `
Adaptive teaching move: ${compactText(activeBeatOverride.questionIntent, 320)}
Adaptive goal: ${compactText(activeBeatOverride.communicativeGoal, 320)}` : "";

    return `CURRENT REVIEW CONTROL (authoritative)
Revision: ${Number(state?.revision || 0)}
Mode: ${state?.mode || REVIEW_MODES.MODE_SELECT}
Phase: ${state?.phase || REVIEW_PHASES.CHOOSE_MODE}
Scene: ${sceneTitle}
Goal: ${sceneGoal}
Remaining expressions: ${remainingText}
Next action: ${nextAction}${hint ? ` (${hint})` : ""}${beatBlock}${overrideBlock}
Allowed tools: ${allowedTools.join(", ") || "none"}

Rules:
- Do not advance, finish, rate, or choose the next scene yourself.
- Use only the allowed tools listed above.
- In review, keep the conversation focused on the remaining expressions.
- Realize the current teaching intent naturally; do not read metadata or a scripted question aloud.
- For ELICIT, DEEPEN, HINT, REANCHOR, or FOLLOW_BEAT_OVERRIDE, react briefly and end with exactly one answerable question.
- Judge communicative meaning and contextual fit. Never require one exact sentence when the learner already expressed the intended meaning.
- Do not judge pronunciation from transcript spelling alone. If ASR is uncertain, clarify without penalizing or forcing mechanical repetition.
- Raise support gradually: contextual cue, then expression hint, then one short recast. Do not repeat the same correction loop.
- Call reset_scene_review only when the learner explicitly asks to clear or restart all scene-review progress, such as "清空 scene review 进度", "重新开始这次复习", "reset review", or "start the review over".
- If Next action is REQUEST_COMPLETION_WHEN_NATURAL and the learner asks to finish, wrap up, or rate, call request_scene_completion immediately.
- If completion is rejected, give one concise hint and continue the same scene.`;
}

export function buildReviewControlPacket(state, { nowMs = Date.now() } = {}) {
    const scenes = Array.isArray(state?.rolePlayPlan?.scenes) ? state.rolePlayPlan.scenes : [];
    const currentSceneIndex = Math.max(0, Number(state?.currentSceneIndex || 0));
    const activeSceneRaw = getActiveSceneFromState(state);
    const activeScene = sanitizeScene(activeSceneRaw);
    const activeBeatRaw = getActiveBeatFromState(state);
    const activeBeat = sanitizeBeat(activeBeatRaw);
    const activeBeatProgress = activeBeatRaw ? state?.beatProgress?.[activeBeatRaw.beatId] || null : null;
    const activeBeatOverride = sanitizeBeatOverride(state?.activeBeatOverride);
    const targets = getSceneTargets(activeSceneRaw);
    const progress = state?.targetProgress || {};
    const remainingTargets = targets.filter((target) => !isTargetSettled(progress?.[target.id]));
    const allowedTools = getAllowedReviewTools(state);
    const nextAction = getNextAction(state, remainingTargets, activeBeatRaw);
    const sceneBeats = getSceneTeachingBeats(activeSceneRaw);
    const settledBeatCount = sceneBeats.filter((beat) => ["ACHIEVED", "EXHAUSTED", "SKIPPED"]
        .includes(state?.beatProgress?.[beat.beatId]?.status)).length;
    const completedTargetIds = [...new Set(
        scenes
            .slice(0, Math.min(currentSceneIndex, scenes.length))
            .flatMap((scene) => getSceneTargets(scene).map((target) => target.id))
            .filter(Boolean)
    )].slice(0, 300);
    const progressOverview = buildProgressOverview(state, scenes, {
        currentSceneIndex,
        activeBeat: activeBeatRaw,
        completedTargetIds,
    });
    const effects = (Array.isArray(state?.effects) ? state.effects : [])
        .filter((effect) => (
            effect?.status === REVIEW_EFFECT_STATUS.PENDING
            || isRatingLeaseExpired(effect, nowMs)
        ))
        .map((effect) => ({
            effectId: effect.effectId,
            type: effect.type,
            status: effect.status,
            sceneId: effect.sceneId,
            scene: sanitizeScene(scenes[Number(effect.sceneIndex || 0)] || null),
            attempts: Number(effect.attempts || 0),
            claimable: effect.status === REVIEW_EFFECT_STATUS.PENDING || isRatingLeaseExpired(effect, nowMs),
        }));

    return {
        schemaVersion: 2,
        stateSchemaVersion: Number(state?.stateSchemaVersion || 1),
        flowVersion: Number(state?.flowVersion || 1),
        reviewRunId: state?.reviewRunId || null,
        sourceSessionId: state?.sourceSessionId || null,
        revision: Number(state?.revision || 0),
        controlRevision: Number(state?.controlRevision || 0),
        mode: state?.mode || REVIEW_MODES.MODE_SELECT,
        phase: state?.phase || REVIEW_PHASES.CHOOSE_MODE,
        currentSceneIndex,
        sceneCount: scenes.length,
        activeScene,
        activeBeat,
        activeBeatProgress,
        activeBeatOverride,
        teachingProgress: {
            beatCount: sceneBeats.length,
            settledBeatCount,
            activeBeatIndex: activeBeatRaw
                ? sceneBeats.findIndex((beat) => beat.beatId === activeBeatRaw.beatId)
                : -1,
        },
        progressOverview,
        completedTargetIds,
        targetProgress: progress,
        remainingTargets,
        nextAction,
        allowedTools,
        promptCheckpoint: buildReviewPromptCheckpoint(state, {
            allowedTools,
            remainingTargets,
            activeScene,
            activeBeat,
            activeBeatProgress,
            activeBeatOverride,
            nextAction,
        }),
        effects,
        lastEventResult: state?.lastEventResult || null,
        error: state?.phase === REVIEW_PHASES.ERROR ? state?.lastError : null,
    };
}
