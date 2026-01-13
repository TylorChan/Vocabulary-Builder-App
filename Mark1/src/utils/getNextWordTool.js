import { z } from "zod";
import { tool } from "@openai/agents/realtime";

export function createGetNextWordTool({ onBreadcrumb }) {
    return tool({
        name: "get_next_word",
        description: "Return the next vocabulary item in order and advance the session pointer.",
        parameters: z.object({}),
        execute: (_input, runContext) => {
            const ctx = runContext?.context ?? {};
            if (ctx.currentWordRated !== true && ctx.currentStep !== "NEED_WORD") {
                onBreadcrumb?.("Cannot advance: current word not rated yet.");
                return { ok: false, reason: "not rated yet" };
            }

            const words = ctx.vocabularyWords ?? [];
            const total = words.length;

            const idx =
                typeof ctx.currentWordIndex === "number"
                    ? ctx.currentWordIndex
                    : 0;

            if (idx >= total) {
                onBreadcrumb?.("No more words (session complete)");
                return { done: true, total, word: null };
            }

            const w = words[idx];
            ctx.currentWordIndex = idx + 1;

            const word = {
                id: w.id,
                text: w.text,
                videoTitle: w.videoTitle ?? "",
                surroundingText: w.surroundingText ?? "",
                definition: w.definition ?? "",
                realLifeDef: w.realLifeDef ?? "",
            };

            ctx.currentWordRated = false;
            ctx.ratingInProgress = false;
            ctx.currentVocabularyId = w.id;
            ctx.currentStep = "ASK_VIDEO";

            onBreadcrumb?.(`Word ${idx + 1} / ${total}: ${word.text}`);
            return { done: false, total, word };
        },
    });
}