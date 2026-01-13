import { z } from "zod";
import { tool } from "@openai/agents/realtime";

/**
 * Marks the start of reviewing a specific word.
 * We store a boundary in shared Realtime session context so later the rating tool
 * can pull "conversation since this started".
 */
export function createStartWordReviewTool({ onBreadcrumb }) {
    return tool({
        name: "start_word_review",
        description: "Mark the start of reviewing a vocabulary item (sets active word in context).",
        parameters: z.object({
            vocabularyId: z.string(),
            wordText: z.string().nullable(),
        }),
        execute: ({ vocabularyId, wordText }, runContext) => {
            const ctx = runContext?.context ?? {};

            
            if (ctx.currentStep && ctx.currentStep !== "ASK_VIDEO") {
                onBreadcrumb?.(`start_word_review blocked (step=${ctx.currentStep})`);
                return { ok: false, reason: "wrong step" };
            }

            const historyLen = Array.isArray(ctx.history)
                ? ctx.history.length
                : 0;

            ctx.activeWordId = vocabularyId;
            ctx.activeWordText = wordText ?? null;
            ctx.activeWordStartedAtMs = Date.now();
            ctx.activeWordStartHistoryIndex = historyLen;

            ctx.currentVocabularyId = vocabularyId;
            ctx.currentStep = "ASK_VIDEO";

            // onBreadcrumb?.(`Reviewing ${wordText ?? vocabularyId}`);
            return { ok: true };
        },
    });
}