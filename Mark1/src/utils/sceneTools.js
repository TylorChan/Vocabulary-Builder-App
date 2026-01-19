import { tool } from "@openai/agents/realtime";
import { z } from "zod";

function extractText(content = []) {
    if (!Array.isArray(content)) return "";
    return content
        .map((c) => c?.text || c?.transcript || "")
        .filter(Boolean)
        .join(" ");
}

export function createSceneTools({ onBreadcrumb, onSceneRatingRequested, onSceneStart }) {
    
    const getNextScene = tool({
        name: "get_next_scene",
        description: "Return the next scene from rolePlayPlan.",
        parameters: z.object({}),
        execute: async (_, runContext) => {

            const ctx = runContext.context ?? {};
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
            ctx.currentSceneStep = "SCENE_DONE";
            onBreadcrumb?.("Scene done");
            return { ok: true };
        },
    });

    const requestSceneRating = tool({
        name: "request_scene_rating",
        description: "Trigger background rating for all words in this scene.",
        parameters: z.object({}),
        execute: async (_, runContext) => {
            const ctx = runContext.context ?? {};
            if (ctx.currentSceneStep !== "SCENE_DONE") {
                return { ok: false, reason: "scene not done" };
            }

            // build scene evidence
            const history = runContext?.context?.history ?? [];
            const startIdx = ctx.activeSceneStartHistoryIndex ?? 0;

            const sliced = history.slice(startIdx);
            const msgs = sliced.filter(
                (it) => it?.type === "message" && (it.role === "user" || it.role === "assistant")
            );

            const evidence = msgs
                .map((it) => {
                    const role = it.role === "user" ? "USER" : "TEACHER";
                    const text = extractText(it.content);
                    return `${role}: ${text}`.trim();
                })
                .filter(Boolean)
                .join("\n");

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

    return { getNextScene, startScene, markSceneDone, requestSceneRating }
}