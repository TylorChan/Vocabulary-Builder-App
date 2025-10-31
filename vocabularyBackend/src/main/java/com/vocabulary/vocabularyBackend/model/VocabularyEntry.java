package com.vocabulary.vocabularyBackend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

/**
 * MongoDB document model for vocabulary entries.
 * Stores words/phrases/sentences that users save from audio content.
 */
@Document(collection = "vocabulary_entries")
public class VocabularyEntry {

    @Id
    private String id; // Primary key (MongoDB auto-generates unique ObjectId)

    // Core vocabulary data
    private String text;              // The word, phrase, or sentence
    private String definition;        // Context-aware definition from Gemini API
    private String example;           // A sentence containing the selected word (showcase the usage of the selected words)
    private String exampleTrans;      // Chinese translation
    private String realLifeDef;       // How the selected words/phrases/sentences are used in real life.

    // Context from original source
    private String surroundingText;   // The caption text where the selected appeared (should be one or two sentence)
    private String videoTitle;        // YouTube Video title

    // Metadata
    private String userId;
    private LocalDateTime createdAt;

    /**
     * FSRS card data for spaced repetition scheduling.
     * This is an embedded document (stored inside this vocabulary entry).
     *
     * Automatically initialized when VocabularyEntry is created.
     * Tracks: difficulty, stability, due date, learning state, review history
     */
    private FSRSCard fsrsCard;


    // Constructors
    public VocabularyEntry() {
        this.createdAt = LocalDateTime.now();
        this.fsrsCard = new FSRSCard();
    }

    public VocabularyEntry(String text, String definition, String example, String exampleTrans, String realLifeDef, String surroundingText, String videoTitle, String userId) {
        this();
        this.text = text;
        this.definition = definition;
        this.example = example;
        this.exampleTrans = exampleTrans;
        this.realLifeDef = realLifeDef;
        this.surroundingText = surroundingText;
        this.videoTitle = videoTitle;
        this.userId = userId;
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
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
    }

    public String getExample() {
        return example;
    }

    public void setExample(String example) {
        this.example = example;
    }

    public String getExampleTrans() {
        return exampleTrans;
    }

    public void setExampleTrans(String exampleTrans) {
        this.exampleTrans = exampleTrans;
    }

    public String getRealLifeDef() {
        return realLifeDef;
    }

    public void setRealLifeDef(String realLifeDef) {
        this.realLifeDef = realLifeDef;
    }

    public String getSurroundingText() {
        return surroundingText;
    }

    public void setSurroundingText(String surroundingText) {
        this.surroundingText = surroundingText;
    }

    public String getVideoTitle() {
        return videoTitle;
    }

    public void setVideoTitle(String videoTitle) {
        this.videoTitle = videoTitle;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public FSRSCard getFsrsCard() {
        return fsrsCard;
    }

    public void setFsrsCard(FSRSCard fsrsCard) {
        this.fsrsCard = fsrsCard;
    }


    @Override
    public String toString() {
        return "VocabularyEntry{" +
                "id=" + id +
                ", text='" + text + '\'' +
                ", definition='" + definition + '\'' +
                ", realLifeDef='" + realLifeDef + '\'' +
                ", surroundingText='" + surroundingText + '\'' +
                ", example='" + example + '\'' +
                ", exampleTrans='" + exampleTrans + '\'' +
                ", userId='" + userId + '\'' +
                ", createdAt=" + createdAt +
                ", videoTitle='" + videoTitle + '\'' +
                ", fsrsCard=" + fsrsCard +
                '}';
    }
}