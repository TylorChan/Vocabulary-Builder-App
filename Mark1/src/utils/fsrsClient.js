/**
   * Calls the Python FSRS service to compute the next schedule.
   * Note: The Python service uses `step` (not `reps`), and returns `state` like "Learning".
   */
const IS_LOCAL_BUILD =
    (typeof import.meta !== "undefined" && import.meta?.env?.DEV) ||
    (typeof import.meta !== "undefined" && import.meta?.env?.MODE === "prodlocal");

const LOCAL_FSRS_ENDPOINTS = IS_LOCAL_BUILD
    ? [
        "http://localhost:6060/review",
        "http://localhost:6000/review",
    ]
    : [];

const DEFAULT_FSRS_ENDPOINTS = [
    ...String((typeof import.meta !== "undefined" && import.meta?.env?.VITE_FSRS_REVIEW_ENDPOINTS) || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    (typeof import.meta !== "undefined" && import.meta?.env?.VITE_FSRS_REVIEW_ENDPOINT) || "",
    ...LOCAL_FSRS_ENDPOINTS,
].filter(Boolean);

async function callFsrsWithFallback(payload) {
    const tried = [];
    let lastError = null;

    for (const endpoint of [...new Set(DEFAULT_FSRS_ENDPOINTS)]) {
        tried.push(endpoint);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                // Endpoint is reachable but request invalid; stop fallback and surface directly.
                throw new Error(`FSRS error ${res.status} @ ${endpoint}: ${text}`);
            }

            const data = await res.json();
            return { data, endpoint };
        } catch (error) {
            lastError = error;
            const msg = String(error?.message || error);
            const isNetworkError = msg.includes("Failed to fetch") || msg.includes("NetworkError");
            if (!isNetworkError) {
                throw error;
            }
        }
    }

    throw new Error(`FSRS network unavailable. Tried: ${tried.join(", ")}. Last error: ${lastError?.message || lastError}`);
}

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

    const { data } = await callFsrsWithFallback(payload);

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
