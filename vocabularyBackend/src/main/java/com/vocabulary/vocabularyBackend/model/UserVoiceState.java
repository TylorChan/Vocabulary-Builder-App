package com.vocabulary.vocabularyBackend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "voice_user_state")
public class UserVoiceState {

    @Id
    private String id;
    @Indexed(unique = true)
    private String userId;
    private String activeSessionId;
    private String globalReviewProgressJson;
    private String updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getActiveSessionId() {
        return activeSessionId;
    }

    public void setActiveSessionId(String activeSessionId) {
        this.activeSessionId = activeSessionId;
    }

    public String getGlobalReviewProgressJson() {
        return globalReviewProgressJson;
    }

    public void setGlobalReviewProgressJson(String globalReviewProgressJson) {
        this.globalReviewProgressJson = globalReviewProgressJson;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }
}
