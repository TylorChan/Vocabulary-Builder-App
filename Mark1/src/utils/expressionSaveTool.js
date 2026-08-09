import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import {
    EXPRESSION_FIELD_LIMITS,
    normalizeExpressionProposal,
} from "./expressionSave.js";

const requiredText = (field) => z.string()
    .trim()
    .min(1, `${field} is required`)
    .max(EXPRESSION_FIELD_LIMITS[field], `${field} is too long`);

export function createExpressionSaveTool({ onProposal }) {
    if (typeof onProposal !== "function") {
        throw new Error("createExpressionSaveTool requires onProposal");
    }

    return tool({
        name: "propose_expression_save",
        description: [
            "Show one non-blocking Expression save card after the user explicitly asks to save a word, phrase, or short sentence from the current conversation.",
            "Copy the Expression's exact surface form from an earlier user or assistant message; do not paraphrase it or change its tense, number, or wording.",
            "This tool only proposes the card; it does not save anything and must not pause the conversation.",
        ].join(" "),
        parameters: z.object({
            expression: requiredText("expression"),
            definition: requiredText("definition"),
            usage: requiredText("usage"),
        }),
        execute: async (input) => {
            const proposal = normalizeExpressionProposal(input);
            const result = await onProposal(proposal);
            if (!result?.ok) {
                return {
                    ok: false,
                    status: "not_proposed",
                    saved: false,
                    reason: result?.reason || "expression_card_could_not_be_created",
                    nextAction: result?.nextAction || "Briefly explain that only an Expression already used in this conversation can be saved, then continue naturally.",
                };
            }
            if (!result.itemId) {
                throw new Error("Expression card could not be created");
            }

            return {
                ok: true,
                itemId: result.itemId,
                status: "proposed",
                saved: false,
                nextAction: "Briefly introduce the optional card, then continue the prior topic.",
            };
        },
    });
}
