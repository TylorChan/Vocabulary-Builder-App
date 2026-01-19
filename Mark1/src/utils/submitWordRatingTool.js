import { z } from "zod";
import { tool } from "@openai/agents/realtime";
import { fsrsReview } from "../utils/fsrsClient";
import { upsertPendingReviewUpdate } from "../utils/reviewSessionStorage";

/**
 * Tool called by the rater agent.
 *
 * It:
 * 1) finds the vocabulary entry (so we can access fsrsCard)
 * 2) calls Python FSRS to compute the next schedule
 * 3) stores the update in chrome.storage.local (durable across side panel close)
 */

function buildEvidenceFromHistory(runContext) {
    const history = runContext?.context?.history ?? [];
    const startedAtMs = runContext?.context?.activeWordStartedAtMs ?? null;

    // MVP fallback: just take last ~8 message items if we can't time-slice
    const messageItems = history.filter((it) => it?.type === "message" && (it.role === "user" ||
        it.role === "assistant"));

    const recent = messageItems.slice(-8);

    // Compact evidence: "U: ... / A: ..."
    return recent
        .map((it) => {
            const role = it.role === "user" ? "U" : "A";
            const text =
                Array.isArray(it.content)
                    ? it.content.map((c) => c?.text || c?.transcript || "").filter(Boolean).join(" ")
                    : "";
            return `${role}: ${text}`.trim();
        })
        .filter((line) => line.length > 3)
        .join("\n");
}

export function createSubmitWordRatingTool({ userId, getEntryById, onBreadcrumb }) {
    return tool({
        name: "submit_word_rating",
        description:
            "Store a 1-4 FSRS rating for a vocabulary item, compute next schedule, and persist it locally.",
        parameters: z.object({
            vocabularyId: z.string(),
            rating: z.number().int().min(1).max(4), // 1=Again, 2=Hard, 3=Good, 4=Easy
            evidence: z.string().nullable(), // optional: short reason/transcript excerpt
        }),
        execute: async ({ vocabularyId, rating, evidence }, runContext) => {
            const ctx = runContext?.context ?? {};
            ctx.ratedWordIds ??= new Map();
            ctx.ratingInProgressIds ??= new Map();

            if (ctx.ratedWordIds.get(vocabularyId)) {
                return { ok: false, reason: "already rated" };
            }
            if (ctx.ratingInProgressIds.get(vocabularyId)) {
                return { ok: false, reason: "rating in progress" };
            }

            ctx.ratingInProgressIds.set(vocabularyId, true);

            try {
                const entry = getEntryById(vocabularyId);
                if (!entry) {
                    throw new Error(`Unknown vocabularyId: ${vocabularyId}`);
                }

                const strongEvidence = buildEvidenceFromHistory(runContext);
                const finalEvidence = strongEvidence || evidence || null;

                console.log("[EVIDENCE]", {
                    vocabularyId,
                    word: entry.text,
                    strongEvidence,
                    toolEvidence: evidence,
                    finalEvidence,
                });

                onBreadcrumb?.(`Rated "${entry.text}" = ${rating} because Bob thinks ${evidence}`);

                const updated = await fsrsReview({
                    fsrsCard: entry.fsrsCard,
                    rating,
                });

                const updateForBackend = {
                    vocabularyId: entry.id,
                    difficulty: updated.difficulty,
                    stability: updated.stability,
                    dueDate: updated.dueDate,
                    state: updated.state,
                    lastReview: updated.lastReview,
                    reps: updated.reps,
                    rating,
                    evidence: finalEvidence,
                };

                const merged = await upsertPendingReviewUpdate(userId, updateForBackend);

                // success-only state updates
                ctx.ratedWordIds.set(vocabularyId, true);

                return {
                    ok: true,
                    pendingCount: merged.length,
                    nextDueDate: updated.dueDate,
                };
            } finally {
                // always release the lock even if an error happens
                ctx.ratingInProgressIds.set(vocabularyId, false);
            }
        },
    });
}