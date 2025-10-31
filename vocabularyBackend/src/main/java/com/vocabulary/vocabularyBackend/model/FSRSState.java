
package com.vocabulary.vocabularyBackend.model;

/**
 * Enum representing the 4 states in FSRS (Free Spaced Repetition Scheduler).
 * Each vocabulary word transitions through these states based on user performance.
 * State Transitions:
 * NEW → LEARNING (first review)
 * LEARNING → REVIEW (after 2-3 successful reviews)
 * REVIEW → RELEARNING (if user forgets)
 * RELEARNING → REVIEW (after re-learning)
 */
public enum FSRSState {
    /**
     * LEARNING: Card is being actively learned (short intervals)
     * - User has reviewed 1-3 times but hasn't mastered it yet
     * - Review intervals: 1 minute → 10 minutes → 1 day
     * - Still in short-term memory
     * <p>
     * Example: User reviewed "ubiquitous" once yesterday, now reviewing again
     * <p>
     * Transition to REVIEW: After 2-3 correct answers
     */
    LEARNING,

    /**
     * REVIEW: Card is learned (long intervals)
     * - User has mastered the word, now in long-term memory
     * - Review intervals: 3 days → 1 week → 2 weeks → 1 month → 3 months...
     * - Intervals grow exponentially based on stability
     * <p>
     * Example: User confidently remembers "ubiquitous" after 2 weeks
     * <p>
     * Transition to RELEARNING: If user forgets (rates 1="Again")
     */
    REVIEW,

    /**
     * RELEARNING: Card was forgotten, needs re-learning
     * - User failed a REVIEW card (clicked "Again")
     * - Treated like LEARNING but may have shorter intervals
     * - System knows user has seen this before
     * <p>
     * Example: User forgot "ubiquitous" after 3 months, needs refresher
     * <p>
     * Transition to REVIEW: After successfully re-learning (2-3 correct answers)
     */
    RELEARNING;

    /**
     * Helper method: Check if card is in short-term learning phase
     *
     * @return true if NEW, LEARNING, or RELEARNING
     */
    public boolean isLearning() {
        return this == LEARNING || this == RELEARNING;
    }

    /**
     * Helper method: Check if card is in long-term memory
     *
     * @return true if REVIEW
     */
    public boolean isReview() {
        return this == REVIEW;
    }
}
