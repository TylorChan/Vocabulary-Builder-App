package com.vocabulary.vocabularyBackend.model;

import java.time.LocalDateTime;

/**
 * Embedded document representing FSRS (Free Spaced Repetition Scheduler) card data.
 * This is NOT a separate MongoDB collection - it's embedded inside VocabularyEntry.
 * <p>
 * FSRS Algorithm tracks:
 * - Difficulty: How hard this word is for the user (0.0-10.0)
 * - Stability: How well the user retains this word (days)
 * - Due Date: When this word should be reviewed next
 * - State: Learning progress (NEW → LEARNING → REVIEW)
 */
public class FSRSCard {

    // ===== FSRS Core Fields =====

    /**
     * Difficulty rating (0.0 to 10.0)
     * - Lower = easier word
     * - Higher = harder word
     * - Adjusted after each review based on user performance
     */
    private Double difficulty;

    /**
     * Stability (in days)
     * - Represents how long the user can remember this word
     * - Increases when user answers correctly
     * - Decreases when user struggles
     */
    private Double stability;

    /**
     * Next review due date
     * - Words with dueDate <= NOW are ready for review
     * - FSRSScheduler queries this field to select cards
     */
    private LocalDateTime dueDate;

    /**
     * Card state in the learning process
     * - NEW: Never reviewed (initial state)
     * - LEARNING: Currently being learned (user has seen it 1-3 times)
     * - REVIEW: Learned (in long-term memory, periodic review)
     * - RELEARNING: Was learned but user forgot (restart learning)
     */
    private FSRSState state;

    /**
     * Timestamp of last review
     * - Used to calculate intervals between reviews
     */
    private LocalDateTime lastReview;

    /**
     * Total number of reviews (repetitions)
     * - Tracks how many times user has practiced this word
     */
    private Integer reps;

    // ===== Constructors =====

    /**
     * Default constructor - initializes a NEW card with default FSRS values
     */
    public FSRSCard() {
        this.difficulty = null;
        this.stability = null;
        this.dueDate = LocalDateTime.now();
        this.state = FSRSState.LEARNING;
        this.lastReview = null;
        this.reps = 0;
    }


    /**
     * Full constructor for updating card after review
     */
    public FSRSCard(Double difficulty, Double stability, LocalDateTime dueDate, FSRSState state, LocalDateTime lastReview, Integer reps) {
        this.difficulty = difficulty;
        this.stability = stability;
        this.dueDate = dueDate;
        this.state = state;
        this.lastReview = lastReview;
        this.reps = reps;
    }

    // ===== Getters and Setters =====

    public Double getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(Double difficulty) {
        this.difficulty = difficulty;
    }

    public Double getStability() {
        return stability;
    }

    public void setStability(Double stability) {
        this.stability = stability;
    }

    public LocalDateTime getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDateTime dueDate) {
        this.dueDate = dueDate;
    }

    public FSRSState getState() {
        return state;
    }

    public void setState(FSRSState state) {
        this.state = state;
    }

    public LocalDateTime getLastReview() {
        return lastReview;
    }

    public void setLastReview(LocalDateTime lastReview) {
        this.lastReview = lastReview;
    }

    public Integer getReps() {
        return reps;
    }

    public void setReps(Integer reps) {
        this.reps = reps;
    }

    @Override
    public String toString() {
        return "FSRSCard{" + "difficulty=" + difficulty + ", stability=" + stability + ", dueDate=" + dueDate + ", state=" + state + ", lastReview=" + lastReview + ", reps=" + reps + '}';
    }
}

