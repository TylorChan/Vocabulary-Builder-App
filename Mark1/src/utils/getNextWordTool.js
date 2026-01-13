import { z } from "zod";
import { tool } from "@openai/agents/realtime";

export function createGetNextWordTool({ onBreadcrumb }) {
    return tool({
        name: "get_next_word",
        description: "Return the next vocabulary item in order and advance the session pointer.",
        parameters: z.object({}),
        execute: (_input, runContext) => {
            const words = runContext?.context?.vocabularyWords ?? [];
            const total = words.length;

            const idx =
                typeof runContext?.context?.currentWordIndex === "number"
                    ? runContext.context.currentWordIndex
                    : 0;

            if (idx >= total) {
                onBreadcrumb?.("No more words (session complete).");
                return { done: true, total, word: null };
            }

            const w = words[idx];
            runContext.context.currentWordIndex = idx + 1;

            const word = {
                id: w.id,
                text: w.text,
                videoTitle: w.videoTitle ?? "",
                surroundingText: w.surroundingText ?? "",
                definition: w.definition ?? "",
                realLifeDef: w.realLifeDef ?? "",
            };

            onBreadcrumb?.(`Word ${idx + 1}/${total}: ${word.text}`);
            return { done: false, total, word };
        },
    });
}