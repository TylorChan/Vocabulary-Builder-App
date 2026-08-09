import { tool } from "@openai/agents/realtime";
import { z } from "zod";

export const REVIEW_GRAPH_EVENT_TYPES = Object.freeze({
    MODE_SELECTED: "MODE_SELECTED",
    THEME_SUBMITTED: "THEME_SUBMITTED",
    SCENE_COMPLETION_REQUESTED: "SCENE_COMPLETION_REQUESTED",
    PAUSE_REQUESTED: "PAUSE_REQUESTED",
    RESUME_REQUESTED: "RESUME_REQUESTED",
    RATING_CLAIMED: "RATING_CLAIMED",
    RATING_COMPLETED: "RATING_COMPLETED",
    RATING_FAILED: "RATING_FAILED",
});

function compactToolResult(response) {
    const packet = response?.controlPacket || {};
    return {
        ok: response?.applied === true
            || response?.duplicate === true
            || response?.created === true
            || response?.resumed === true,
        revision: Number(response?.revision || packet?.revision || 0),
        phase: packet?.phase || null,
        nextAction: packet?.nextAction || null,
        activeScene: packet?.activeScene || null,
        remainingTargets: packet?.remainingTargets || [],
        error: packet?.error || null,
    };
}

export function createReviewGraphTools({
    dispatchEvent,
    activeSceneId = null,
    resetReview = null,
}) {
    if (typeof dispatchEvent !== "function") throw new Error("Review tools require dispatchEvent");
    const boundActiveSceneId = String(activeSceneId || "").trim();

    const choosePracticeMode = tool({
        name: "choose_practice_mode",
        description: "Choose scene review or free chat. The review controller validates the transition.",
        parameters: z.object({ mode: z.enum(["REVIEW", "FREE_CHAT"]) }),
        execute: async ({ mode }) => compactToolResult(await dispatchEvent(
            REVIEW_GRAPH_EVENT_TYPES.MODE_SELECTED,
            { mode },
        )),
    });

    const submitReviewTheme = tool({
        name: "submit_review_theme",
        description: "Submit the learner's optional preferred topic and prepare the authoritative review plan.",
        parameters: z.object({ userFocus: z.string().max(160).nullable() }),
        execute: async ({ userFocus }) => compactToolResult(await dispatchEvent(
            REVIEW_GRAPH_EVENT_TYPES.THEME_SUBMITTED,
            { userFocus: String(userFocus || "").trim() },
        )),
    });

    const requestSceneCompletion = tool({
        name: "request_scene_completion",
        description: "Ask the review controller to complete the active scene after its expressions were practiced. The controller already binds the scene identity.",
        parameters: z.object({}),
        execute: async () => {
            if (!boundActiveSceneId) {
                throw new Error("request_scene_completion requires an active controller scene");
            }
            return compactToolResult(await dispatchEvent(
                REVIEW_GRAPH_EVENT_TYPES.SCENE_COMPLETION_REQUESTED,
                { sceneId: boundActiveSceneId },
            ));
        },
    });

    const pauseReviewMode = tool({
        name: "pause_review_mode",
        description: "Pause scene review and switch to free chat without losing review progress.",
        parameters: z.object({}),
        execute: async () => compactToolResult(await dispatchEvent(
            REVIEW_GRAPH_EVENT_TYPES.PAUSE_REQUESTED,
            {},
        )),
    });

    const resumeReviewMode = tool({
        name: "resume_review_mode",
        description: "Resume the authoritative paused review scene.",
        parameters: z.object({}),
        execute: async () => compactToolResult(await dispatchEvent(
            REVIEW_GRAPH_EVENT_TYPES.RESUME_REQUESTED,
            {},
        )),
    });

    const resetSceneReview = tool({
        name: "reset_scene_review",
        description: "Clear all active scene-review progress and return to choosing scene review or free chat. Use only after an explicit request such as 'reset review', 'start the review over', '清空 scene review 进度', or '重新开始这次复习'.",
        parameters: z.object({}),
        execute: async () => {
            if (typeof resetReview !== "function") {
                throw new Error("reset_scene_review is unavailable in this runtime");
            }
            return compactToolResult(await resetReview());
        },
    });

    return {
        choosePracticeMode,
        submitReviewTheme,
        requestSceneCompletion,
        pauseReviewMode,
        resumeReviewMode,
        resetSceneReview,
    };
}

export function selectReviewGraphTools(
    controlPacket,
    reviewTools,
    expressionSaveTool,
    expressionAssistTool = null,
) {
    const byName = new Map(Object.values(reviewTools || {}).map((item) => [item?.name, item]));
    if (expressionSaveTool?.name) byName.set(expressionSaveTool.name, expressionSaveTool);
    const allowedNames = Array.isArray(controlPacket?.allowedTools)
        ? [...controlPacket.allowedTools]
        : [];
    if (controlPacket?.phase === "FREE_CHAT" && expressionAssistTool?.name) {
        byName.set(expressionAssistTool.name, expressionAssistTool);
        allowedNames.push(expressionAssistTool.name);
    }
    return [...new Set(allowedNames)]
        .map((name) => byName.get(name))
        .filter(Boolean);
}
