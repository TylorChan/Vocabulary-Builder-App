/**
   * Calls the Python FSRS service to compute the next schedule.
   * Note: The Python service uses `step` (not `reps`), and returns `state` like "Learning".
   */
const FSRS_REVIEW_ENDPOINT = "http://localhost:6060/review";

export async function fsrsReview({ fsrsCard, rating, reviewTime = new Date() }) {
    const payload = {
        card: {
            difficulty: fsrsCard?.difficulty ?? null,
            stability: fsrsCard?.stability ?? null,
            due: fsrsCard?.dueDate ?? new Date().toISOString(),      // backend uses dueDate
            state: fsrsCard?.state ?? "LEARNING",
            last_review: fsrsCard?.lastReview ?? null,               // backend uses lastReview
            step: fsrsCard?.reps ?? 0,                               // map reps -> step (temporary)
        },
        rating,                                                    // 1-4 (Again/Hard/Good/Easy)
        review_time: reviewTime.toISOString(),
    };

    const res = await fetch(FSRS_REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`FSRS error ${res.status}: ${text}`);
    }

    const data = await res.json();

    // Python returns: { difficulty, stability, due, state, last_review, step }
    // Backend expects: dueDate, lastReview, reps, state in ALLCAPS
    return {
        difficulty: data.difficulty ?? null,
        stability: data.stability ?? null,
        dueDate: data.due ?? null,
        state: (data.state ?? "LEARNING").toUpperCase(),
        lastReview: data.last_review ?? null,
        reps: data.step ?? (fsrsCard?.reps ?? 0),
    };
}