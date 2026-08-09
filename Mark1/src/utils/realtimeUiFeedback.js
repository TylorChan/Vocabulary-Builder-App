const UI_FEEDBACK_OUTCOMES = Object.freeze({
    deferred: "The user chose not to save the Expression right now.",
    saved: "The Expression was saved successfully to the Word List.",
    save_failed: "The Expression could not be saved, and the card now offers Retry.",
    learn_today: "The saved Expression was moved into today's review queue.",
    learn_today_failed: "The saved Expression could not be moved into today's review queue, and the card now offers Retry.",
});

export const UI_FEEDBACK_METADATA_KEY = "mark2_ui_feedback_id";

export function buildUiFeedbackInstruction({
    kind,
    expression,
    resumeAnchor = "",
    mode = "UNKNOWN",
}) {
    const outcome = UI_FEEDBACK_OUTCOMES[kind];
    if (!outcome) {
        throw new Error(`Unsupported UI feedback kind: ${kind}`);
    }

    const cleanedExpression = String(expression || "this expression").replace(/\s+/g, " ").trim();
    const cleanedAnchor = String(resumeAnchor || "").replace(/\s+/g, " ").trim();
    const modeRule = String(mode || "").toUpperCase() === "REVIEW"
        ? "Resume the current review scene without changing its target Expressions or state."
        : "Resume the active ordinary-conversation topic.";
    const resumeRule = cleanedAnchor
        ? `The interrupted assistant output ended around: "${cleanedAnchor.slice(-320)}". Continue from the next unfinished idea without repeating completed sentences.`
        : "There is no reliable interrupted-sentence anchor. Do not invent one; use only a minimal natural bridge if the recent topic supports it.";

    return `APP UI EVENT (authoritative): ${outcome}
Expression: "${cleanedExpression}"

Respond now using these rules:
- Start with exactly one brief acknowledgment, ideally 12 words or fewer.
- Make it witty, funny, and lightly sarcastic.
- Joke about the card, save action, or situation. Never mock the user's English, accent, mistake, or decision.
- State only the real UI result. Do not claim a failed or deferred item was saved.
- Do not call any tool and do not ask the user to confirm again.
- ${modeRule}
- ${resumeRule}`;
}
