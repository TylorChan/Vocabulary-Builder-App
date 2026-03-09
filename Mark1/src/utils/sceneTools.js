import { tool } from "@openai/agents/realtime";
import { z } from "zod";

function extractText(content = []) {
    if (!Array.isArray(content)) return "";
    return content
        .map((c) => c?.text || c?.transcript || "")
        .filter(Boolean)
        .join(" ");
}

function buildSceneEvidence(runContext, startIdx = 0) {
    const history = runContext?.context?.history ?? [];
    const sliced = history.slice(startIdx);
    const msgs = sliced.filter(
        (it) => it?.type === "message" && (it.role === "user" || it.role === "assistant")
    );

    return msgs
        .map((it) => {
            const role = it.role === "user" ? "USER" : "TEACHER";
            const text = extractText(it.content);
            return `${role}: ${text}`.trim();
        })
        .filter(Boolean)
        .join("\n");
}

export function createSceneTools({
    onBreadcrumb,
    onSceneRatingRequested,
    onSceneStart,
    onBuildRolePlayPlan,
    onModeChange,
}) {

    const choosePracticeMode = tool({
        name: "choose_practice_mode",
        description: "Choose between review mode and free chat mode.",
        parameters: z.object({
            mode: z.enum(["REVIEW", "FREE_CHAT"]),
        }),
        execute: async ({ mode }, runContext) => {
            const ctx = runContext.context ?? {};

            if (mode === "FREE_CHAT") {
                ctx.currentSceneMode = "FREE_CHAT";
                ctx.currentSceneStep = "FREE_CHAT";
                onModeChange?.("FREE_CHAT");
                onBreadcrumb?.("Switched to free-style chat mode");
                return { ok: true, mode: "FREE_CHAT" };
            }

            // REVIEW path
            ctx.currentSceneMode = "REVIEW";
            onModeChange?.("REVIEW");
            if (ctx.rolePlayPlan?.scenes?.length) {
                if (ctx.currentScene && ctx.currentSceneStep === "PAUSED") {
                    ctx.currentSceneStep = "IN_SCENE";
                } else if (!ctx.currentSceneStep || ctx.currentSceneStep === "CHOOSE_MODE") {
                    ctx.currentSceneStep = "NEED_SCENE";
                }
                onBreadcrumb?.("Review mode selected");
                return { ok: true, mode: "REVIEW", hasPlan: true };
            }

            ctx.currentSceneStep = "AWAIT_THEME";
            onBreadcrumb?.("Review mode selected. Waiting for your preferred scene/topic");
            return { ok: true, mode: "REVIEW", hasPlan: false, needTheme: true };
        },
    });

    const prepareReviewMode = tool({
        name: "prepare_review_mode",
        description: "Build role-play scenes using due words, memory, and optional current user focus.",
        parameters: z.object({
            userFocus: z.string().nullable(),
        }),
        execute: async ({ userFocus }, runContext) => {
            const ctx = runContext.context ?? {};
            const cleanedFocus = String(userFocus || "").trim();
            const shouldRebuild = cleanedFocus.length > 0;

            if (ctx.rolePlayPlan?.scenes?.length && !ctx.reviewComplete && !shouldRebuild) {
                ctx.currentSceneMode = "REVIEW";
                onModeChange?.("REVIEW");
                if (ctx.currentScene && ctx.currentSceneStep === "PAUSED") {
                    ctx.currentSceneStep = "IN_SCENE";
                } else {
                    ctx.currentSceneStep = "NEED_SCENE";
                }
                return { ok: true, resumedExistingPlan: true };
            }

            if (typeof onBuildRolePlayPlan !== "function") {
                return { ok: false, reason: "planner unavailable" };
            }

            const built = await onBuildRolePlayPlan({
                userFocus: cleanedFocus,
                runContext,
            });

            if (shouldRebuild) {
                onBreadcrumb?.(`Rebuilding scenes with your focus: ${cleanedFocus}`);
            }

            const rolePlayPlan = built?.rolePlayPlan ?? built?.plan ?? null;
            if (!rolePlayPlan?.scenes?.length) {
                return { ok: false, reason: "no plan generated" };
            }

            if (built?.memoryPatch && typeof built.memoryPatch === "object") {
                ctx.memory = {
                    ...(ctx.memory || {}),
                    ...built.memoryPatch,
                };
            }

            ctx.rolePlayPlan = rolePlayPlan;
            ctx.currentSceneIndex = 0;
            ctx.currentScene = null;
            ctx.activeSceneId = null;
            ctx.activeSceneStartHistoryIndex = 0;
            ctx.reviewComplete = false;
            ctx.currentSceneMode = "REVIEW";
            ctx.currentSceneStep = "NEED_SCENE";
            ctx.currentUserFocus = cleanedFocus;
            onModeChange?.("REVIEW");

            return {
                ok: true,
                sceneCount: rolePlayPlan.scenes.length,
                usedUserFocus: cleanedFocus.length > 0,
                rebuiltFromUserFocus: shouldRebuild,
            };
        },
    });

    const pauseReviewMode = tool({
        name: "pause_review_mode",
        description: "Pause scene-based review and switch to normal conversation mode.",
        parameters: z.object({}),
        execute: async (_, runContext) => {
            const ctx = runContext.context ?? {};
            if (ctx.currentSceneMode === "FREE_CHAT") {
                return { ok: false, reason: "already paused" };
            }

            ctx.currentSceneMode = "FREE_CHAT";
            ctx.currentSceneStep = "PAUSED";
            onModeChange?.("FREE_CHAT");
            onBreadcrumb?.("Review paused. Say 'continue review' when you're ready.");
            return { ok: true, mode: "FREE_CHAT" };
        },
    });

    const resumeReviewMode = tool({
        name: "resume_review_mode",
        description: "Resume the latest paused review progress.",
        parameters: z.object({}),
        execute: async (_, runContext) => {
            const ctx = runContext.context ?? {};
            if (!ctx.rolePlayPlan?.scenes?.length) {
                return { ok: false, reason: "no review plan yet" };
            }
            if (ctx.reviewComplete) {
                return { ok: false, reason: "review already completed" };
            }

            if (ctx.currentSceneMode === "REVIEW" && ctx.currentSceneStep !== "PAUSED") {
                return { ok: false, reason: "already reviewing" };
            }

            ctx.currentSceneMode = "REVIEW";
            onModeChange?.("REVIEW");
            if (ctx.currentScene && ctx.currentSceneStep === "PAUSED") {
                ctx.currentSceneStep = "IN_SCENE";
            } else {
                ctx.currentSceneStep = "NEED_SCENE";
            }

            onBreadcrumb?.("Resuming review from your last progress");
            return { ok: true, mode: "REVIEW", step: ctx.currentSceneStep };
        },
    });
    
    const getNextScene = tool({
        name: "get_next_scene",
        description: "Return the next scene from rolePlayPlan.",
        parameters: z.object({}),
        execute: async (_, runContext) => {

            const ctx = runContext.context ?? {};
            if (ctx.currentSceneMode !== "REVIEW") {
                return { ok: false, reason: "not in review mode" };
            }
            if (ctx.currentSceneStep === "IN_SCENE" || ctx.currentSceneStep === "SCENE_DONE") {
                return { ok: false, reason: "scene already active" };
            }

            const plan = ctx.rolePlayPlan;

            if (!plan?.scenes?.length) {
                return { ok: false, error: "No rolePlayPlan" };
            }

            if (ctx.currentSceneIndex == null) ctx.currentSceneIndex = 0;

            const scene = plan.scenes[ctx.currentSceneIndex];
            if (!scene) {
                ctx.currentSceneStep = "DONE";
                ctx.reviewComplete = true;
                onModeChange?.("DONE");
                onBreadcrumb?.("All scenes completed");
                return { ok: false, done: true };
            }

            ctx.currentScene = scene;
            ctx.currentSceneStep = "IN_SCENE";
            onBreadcrumb?.(
                `Now reviewing: ${(scene.targetWords || []).join(", ")}`,
                { kind: "NOW_REVIEWING", words: scene.targetWords || [] }
            );
            onBreadcrumb?.(`Scene ${ctx.currentSceneIndex + 1} / ${plan.scenes.length}: ${scene.title}`);

            return { scene };
        },
    });

    const startScene = tool({
        name: "start_scene",
        description: "Mark scene as started.",
        parameters: z.object({
            sceneId: z.string(),
            title: z.string(),
        }),
        execute: async ({ sceneId, title }, runContext) => {
            const ctx = runContext.context ?? {};
            if (ctx.currentSceneMode === "FREE_CHAT") {
                return { ok: false, reason: "review paused" };
            }

            if (ctx.activeSceneId === sceneId && ctx.currentSceneStep === "IN_SCENE") {
                return { ok: false, reason: "scene already started" };
            }

            if (ctx.currentSceneStep !== "IN_SCENE") {
                return { ok: false, reason: "not in scene" };
            }

            // boundary for evidence
            const history = runContext?.context?.history ?? [];
            ctx.activeSceneStartHistoryIndex = history.length;

            ctx.activeSceneId = sceneId;
            onSceneStart?.(ctx.currentScene);
            // onBreadcrumb?.(`Start scene: ${title}`);
            return { ok: true };
        },
    });

    const markSceneDone = tool({
        name: "mark_scene_done",
        description: "Mark current scene as completed.",
        parameters: z.object({}),
        execute: async (_, runContext) => {
            const ctx = runContext.context ?? {};
            if (ctx.currentSceneMode === "FREE_CHAT") {
                return { ok: false, reason: "review paused" };
            }
            if (!ctx.currentScene) {
                return { ok: false, reason: "no active scene" };
            }

            ctx.currentSceneStep = "SCENE_DONE";
            onBreadcrumb?.("Scene done");

            // Deterministic: once a scene is done, queue its rating immediately.
            const startIdx = ctx.activeSceneStartHistoryIndex ?? 0;
            const evidence = buildSceneEvidence(runContext, startIdx);

            onSceneRatingRequested?.({
                scene: ctx.currentScene,
                evidence,
            });

            ctx.currentSceneStep = "RATE_SCENE";
            if (ctx.currentSceneIndex != null) {
                ctx.currentSceneIndex += 1;
            }

            return { ok: true, queuedRating: true };
        },
    });

    const requestSceneRating = tool({
        name: "request_scene_rating",
        description: "Trigger background rating for all words in this scene.",
        parameters: z.object({}),
        execute: async (_, runContext) => {
            const ctx = runContext.context ?? {};
            if (ctx.currentSceneMode === "FREE_CHAT") {
                return { ok: false, reason: "review paused" };
            }
            if (!ctx.currentScene) {
                return { ok: false, reason: "no active scene" };
            }

            const startIdx = ctx.activeSceneStartHistoryIndex ?? 0;
            const evidence = buildSceneEvidence(runContext, startIdx);

            ctx.currentSceneStep = "RATE_SCENE";

            if (ctx.currentSceneIndex != null) {
                ctx.currentSceneIndex += 1;
            }

            onSceneRatingRequested?.({
                scene: ctx.currentScene,
                evidence,
            });

            return { ok: true };
        },
    });

    return {
        choosePracticeMode,
        prepareReviewMode,
        pauseReviewMode,
        resumeReviewMode,
        getNextScene,
        startScene,
        markSceneDone,
        requestSceneRating
    }
}
