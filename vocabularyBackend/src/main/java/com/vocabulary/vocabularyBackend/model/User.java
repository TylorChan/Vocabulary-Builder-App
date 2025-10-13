package com.vocabulary.vocabularyBackend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * MongoDB document model for user accounts.
 * Stores user information and references to their saved vocabulary entries.
 */
@Document(collection = "users")
public class User {

    @Id
    private String id; // Primary key (MongoDB auto-generates unique ObjectId)

    // User's vocabulary collection
    private List<String> vocabIds;  // List of VocabularyEntry IDs

    // Metadata
    private LocalDateTime createdAt;

    // Constructors
    public User() {
        this.createdAt = LocalDateTime.now();
        this.vocabIds = new ArrayList<>();  // Initialize empty list
    }

    public User(String id) {
        this();
        this.id = id;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public List<String> getVocabIds() {
        return vocabIds;
    }

    public void setVocabIds(List<String> vocabIds) {
        this.vocabIds = vocabIds;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    // Helper methods for managing vocabulary list
    public void addVocabId(String vocabId) {
        if (this.vocabIds == null) {
            this.vocabIds = new ArrayList<>();
        }
        this.vocabIds.add(vocabId);
    }

    public void removeVocabId(String vocabId) {
        if (this.vocabIds != null) {
            this.vocabIds.remove(vocabId);
        }
    }

    public boolean hasVocabId(String vocabId) {
        return this.vocabIds != null && this.vocabIds.contains(vocabId);
    }

    public int getVocabCount() {
        return this.vocabIds != null ? this.vocabIds.size() : 0;
    }

    @Override
    public String toString() {
        return "User{" +
                "id=" + id +
                ", vocabCount=" + getVocabCount() +
                ", createdAt=" + createdAt +
                '}';
    }
}