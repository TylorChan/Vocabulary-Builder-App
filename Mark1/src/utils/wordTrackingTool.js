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
            const historyLen = Array.isArray(runContext?.context?.history)
                ? runContext.context.history.length
                : 0;

            runContext.context.activeWordId = vocabularyId;
            runContext.context.activeWordText = wordText ?? null;
            runContext.context.activeWordStartedAtMs = Date.now();
            runContext.context.activeWordStartHistoryIndex = historyLen;

            onBreadcrumb?.(`Reviewing ${wordText ?? vocabularyId}`);
            return { ok: true };
        },
    });
}