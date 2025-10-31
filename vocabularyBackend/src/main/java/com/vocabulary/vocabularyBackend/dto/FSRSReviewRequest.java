package com.vocabulary.vocabularyBackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO for FSRS review API request.
 * Sent to Python FSRS service at POST /review endpoint.
 */
public class FSRSReviewRequest {

    private FSRSCardDTO card;
    private Integer rating;  // 1=Again, 2=Hard, 3=Good, 4=Easy

    @JsonProperty("review_time")
    private String reviewTime;  // ISO 8601 string: "2025-01-18T14:00:00Z"

    // Constructors
    public FSRSReviewRequest() {
    }

    public FSRSReviewRequest(FSRSCardDTO card, Integer rating, String reviewTime) {
        this.card = card;
        this.rating = rating;
        this.reviewTime = reviewTime;
    }

    // Getters and Setters
    public FSRSCardDTO getCard() {
        return card;
    }

    public void setCard(FSRSCardDTO card) {
        this.card = card;
    }

    public Integer getRating() {
        return rating;
    }

    public void setRating(Integer rating) {
        this.rating = rating;
    }

    public String getReviewTime() {
        return reviewTime;
    }

    public void setReviewTime(String reviewTime) {
        this.reviewTime = reviewTime;
    }
}