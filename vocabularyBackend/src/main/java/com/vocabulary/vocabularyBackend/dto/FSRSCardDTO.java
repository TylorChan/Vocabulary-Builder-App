package com.vocabulary.vocabularyBackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO representing the card object in FSRS API requests/responses.
 * Matches the Python FSRS service JSON structure.
 */
public class FSRSCardDTO {

    private Double difficulty;
    private Double stability;
    private String due;  // ISO 8601 string format: "2025-01-18T10:30:00Z"
    private String state;  // "NEW", "LEARNING", "REVIEW", "RELEARNING"

    @JsonProperty("last_review")
    private String lastReview;  // ISO 8601 string, can be null

    private Integer step;  // Learning step (0 for Review cards)

    // Constructors
    public FSRSCardDTO() {
    }

    public FSRSCardDTO(Double difficulty, Double stability, String due, String state, String lastReview, Integer step) {
        this.difficulty = difficulty;
        this.stability = stability;
        this.due = due;
        this.state = state;
        this.lastReview = lastReview;
        this.step = step;
    }

    // Getters and Setters
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

    public String getDue() {
        return due;
    }

    public void setDue(String due) {
        this.due = due;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getLastReview() {
        return lastReview;
    }

    public void setLastReview(String lastReview) {
        this.lastReview = lastReview;
    }

    public Integer getStep() {
        return step;
    }

    public void setStep(Integer step) {
        this.step = step;
    }
}