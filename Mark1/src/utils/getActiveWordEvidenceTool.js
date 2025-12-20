import { z } from "zod";
import { tool } from "@openai/agents/realtime";

function extractText(content = []) {
    if (!Array.isArray(content)) return "";
    return content
        .map((c) => c?.text || c?.transcript || "")
        .filter(Boolean)
        .join(" ");
}

export function createGetActiveWordEvidenceTool() {
    return tool({
        name: "get_active_word_evidence",
        description:
            "Return multi-turn evidence (USER + TEACHER transcripts) for the current active word.",
        parameters: z.object({
            maxMessages: z.number().int().min(4).max(50),
        }),
        execute: ({ maxMessages }, runContext) => {
            const history = runContext?.context?.history ?? [];
            const msgs = history.filter(
                (it) => it?.type === "message" && (it.role === "user" || it.role === "assistant")
            );

            const startIndex = runContext?.context?.activeWordStartHistoryIndex;
            let recent;

            if (typeof startIndex === "number" && startIndex >= 0) {
                // slice from word start → now
                const sliced = history.slice(startIndex);

                // keep only messages user/assistant
                const slicedMsgs = sliced.filter(
                    (it) => it?.type === "message" && (it.role === "user" || it.role === "assistant")
                );

                // optional cap as safety (in case the teacher forgot to call start_word_review)
                recent = slicedMsgs.slice(-maxMessages);
            } else {
                // fallback behavior (older sessions / missing boundary)
                recent = msgs.slice(-maxMessages);
            }
            const evidence = recent
                .map((it) => {
                    const role = it.role === "user" ? "USER" : "TEACHER";
                    const text = extractText(it.content);
                    return `${role}: ${text}`.trim();
                })
                .filter(Boolean)
                .join("\n");

            return {
                activeWordId: runContext?.context?.activeWordId ?? null,
                activeWordText: runContext?.context?.activeWordText ?? null,
                evidence,
            };
        },
    });
}