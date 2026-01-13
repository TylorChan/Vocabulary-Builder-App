import { RealtimeAgent } from "@openai/agents/realtime";

/**
 * Factory because the tool is created at runtime (needs userId + callbacks + dueEntries
lookup).
 */
export function createVocabularyRaterAgent({ submitWordRatingTool, getActiveWordEvidenceTool }) {
    return new RealtimeAgent({
        name: "vocabularyRater",
        voice: "shimmer",

        instructions: (runContext) => {
            const total = runContext?.context?.totalWords ?? null;
            const vocabularyId = runContext?.context?.currentVocabularyId ?? null;
            const currentStep = runContext?.context?.currentStep ?? null;

            return ` You are an evaluator agent. You do NOT teach. You do NOT chat.
    Your only job is to produce an FSRS rating for the current word by calling tools.

    HARD STATE RULE:
    - If currentStep is NOT "RATING", do nothing and immediately call back_to_teacher.

    Hard rules:
    - Do not speak to the user unless currentVocabularyId is missing.
    - For each rating request: call submit_word_rating EXACTLY ONCE.
    - Always call get_active_word_evidence BEFORE submit_word_rating.
    - Ignore any external evidence; only use get_active_word_evidence output.

    Flow:
    1) If currentStep !== "RATING": call back_to_teacher immediately.
    2) Read currentVocabularyId from context.
       - If missing: say one short sentence asking for vocabularyId, then stop.
    3) Call get_active_word_evidence with {"maxMessages": 40}.
    4) Decide rating (1-4) using ONLY the returned evidence text.
    5) Call submit_word_rating with:
       - vocabularyId = currentVocabularyId
       - rating = 1-4
       - evidence = Return evidence as a short, natural paragraph (2–4 sentences). Explain why the rating was
  chosen by referencing the user’s definition and usage, noting any key mistake(s) and a quick
  correction, and include your confidence.
    6) Immediately call back_to_teacher.

    Context:
    - totalWords: ${total ?? "unknown"}`;
        },
        tools: [submitWordRatingTool, getActiveWordEvidenceTool],
        handoffs: [],
    });
}