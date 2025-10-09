package com.vocabulary.vocabularyBackend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;
import java.util.List;

/**
 * MongoDB document model for vocabulary entries.
 * Stores words/phrases/sentences that users save from audio content.
 */
@Document(collection = "vocabulary_entries")
public class VocabularyEntry {

    @Id
    private String id; // Primiary key

    // Core vocabulary data
    private String text;              // The word, phrase, or sentence
    private String type;              // "word", "phrase", or "sentence"
    private String definition;        // Definition from Gemini API
    private String translation;       // Chinese translation

    // Context from original source
    private String originalContext;   // The caption text where this appeared
    private String sourceUrl;         // YouTube/Spotify URL
    private Double timestamp;         // Time in video (seconds)
    private String audioClipUrl;      // URL/path to saved audio clip

    // Spaced repetition data
    private LocalDateTime nextReviewDate;
    private Integer reviewCount;
    private Integer successCount;
    private Integer failureCount;
    private Double difficultyLevel;   // User's difficulty rating (1-5)

    // Metadata
    private String userId;            // For multi-user support
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<String> tags;        // User-defined tags/categories

    // Constructors
    public VocabularyEntry() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        this.reviewCount = 0;
        this.successCount = 0;
        this.failureCount = 0;
    }

    public VocabularyEntry(String text, String type, String definition, String translation) {
        this();
        this.text = text;
        this.type = type;
        this.definition = definition;
        this.translation = translation;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
        this.updatedAt = LocalDateTime.now();
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
        this.updatedAt = LocalDateTime.now();
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
        this.updatedAt = LocalDateTime.now();
    }

    public String getTranslation() {
        return translation;
    }

    public void setTranslation(String translation) {
        this.translation = translation;
        this.updatedAt = LocalDateTime.now();
    }

    public String getOriginalContext() {
        return originalContext;
    }

    public void setOriginalContext(String originalContext) {
        this.originalContext = originalContext;
        this.updatedAt = LocalDateTime.now();
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
        this.updatedAt = LocalDateTime.now();
    }

    public Double getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Double timestamp) {
        this.timestamp = timestamp;
        this.updatedAt = LocalDateTime.now();
    }

    public String getAudioClipUrl() {
        return audioClipUrl;
    }

    public void setAudioClipUrl(String audioClipUrl) {
        this.audioClipUrl = audioClipUrl;
        this.updatedAt = LocalDateTime.now();
    }

    public LocalDateTime getNextReviewDate() {
        return nextReviewDate;
    }

    public void setNextReviewDate(LocalDateTime nextReviewDate) {
        this.nextReviewDate = nextReviewDate;
        this.updatedAt = LocalDateTime.now();
    }

    public Integer getReviewCount() {
        return reviewCount;
    }

    public void setReviewCount(Integer reviewCount) {
        this.reviewCount = reviewCount;
        this.updatedAt = LocalDateTime.now();
    }

    public Integer getSuccessCount() {
        return successCount;
    }

    public void setSuccessCount(Integer successCount) {
        this.successCount = successCount;
        this.updatedAt = LocalDateTime.now();
    }

    public Integer getFailureCount() {
        return failureCount;
    }

    public void setFailureCount(Integer failureCount) {
        this.failureCount = failureCount;
        this.updatedAt = LocalDateTime.now();
    }

    public Double getDifficultyLevel() {
        return difficultyLevel;
    }

    public void setDifficultyLevel(Double difficultyLevel) {
        this.difficultyLevel = difficultyLevel;
        this.updatedAt = LocalDateTime.now();
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
        this.updatedAt = LocalDateTime.now();
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
        this.updatedAt = LocalDateTime.now();
    }

    // Helper methods for spaced repetition
    public void incrementReviewCount() {
        this.reviewCount++;
        this.updatedAt = LocalDateTime.now();
    }

    public void recordSuccess() {
        this.successCount++;
        incrementReviewCount();
    }

    public void recordFailure() {
        this.failureCount++;
        incrementReviewCount();
    }

    public double getSuccessRate() {
        if (reviewCount == 0) return 0.0;
        return (double) successCount / reviewCount;
    }

    @Override
    public String toString() {
        return "VocabularyEntry{" +
                "id='" + id + '\'' +
                ", text='" + text + '\'' +
                ", type='" + type + '\'' +
                ", definition='" + definition + '\'' +
                ", sourceUrl='" + sourceUrl + '\'' +
                ", reviewCount=" + reviewCount +
                ", successRate=" + getSuccessRate() +
                '}';
    }
}
