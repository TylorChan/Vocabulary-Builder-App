import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import { EXPRESSION_ASSIST_TRIGGER_REASONS } from "./expressionAssist.js";

const boundedText = (max) => z.string().trim().min(1).max(max);

export function createExpressionAssistTool({ onRequest }) {
    if (typeof onRequest !== "function") {
        throw new Error("createExpressionAssistTool requires onRequest");
    }
    return tool({
        name: "request_expression_assist",
        description: [
            "Request bounded spoken-English Expression assistance in FREE_CHAT only when the learner has a clear communicative gap.",
            "Always use this before directly answering an explicit request for a word, phrase, expression, idiom, or slang that could convey the learner's intended meaning.",
            "Examples include: 'Do you know any phrase for this?', 'Is there a word I can use?', and 'Can you suggest another expression?'.",
            "Also use it before offering a specific better or more natural Expression for substantive circumlocution or repeated failed repair.",
            "Do not speak the proposed Expression first and call the tool afterward; wait for the tool result.",
            "Do not use it for ordinary vocabulary discussion.",
            "The application owns retrieval, duplicate prevention, final policy, and cards.",
        ].join(" "),
        parameters: z.object({
            reasonCode: z.enum(Object.values(EXPRESSION_ASSIST_TRIGGER_REASONS)),
            intendedMeaning: boundedText(320),
            communicativeFunction: boundedText(240),
            situation: boundedText(320),
        }),
        execute: async (input) => {
            console.info("[ExpressionAssist] Realtime tool requested", {
                reasonCode: input.reasonCode,
            });
            const result = await onRequest(input);
            console.info("[ExpressionAssist] Realtime tool completed", {
                action: result?.action || null,
                gate: result?.gate || null,
            });
            return result;
        },
    });
}
