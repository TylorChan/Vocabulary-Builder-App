package com.vocabulary.vocabularyBackend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "voice_sessions")
@CompoundIndexes({
        @CompoundIndex(name = "user_session_idx", def = "{'userId': 1, 'sessionId': 1}", unique = true),
        @CompoundIndex(name = "user_updated_idx", def = "{'userId': 1, 'updatedAt': -1}")
})
public class VoiceSessionDocument {

    @Id
    private String id;
    @Indexed
    private String sessionId;
    @Indexed
    private String userId;
    private String title;
    private String titleSource;
    private String createdAt;
    private String updatedAt;
    private int messageCount;

    private String transcriptJson;
    private String activeWordsJson;
    private String runtimeContextJson;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTitleSource() {
        return titleSource;
    }

    public void setTitleSource(String titleSource) {
        this.titleSource = titleSource;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }

    public int getMessageCount() {
        return messageCount;
    }

    public void setMessageCount(int messageCount) {
        this.messageCount = messageCount;
    }

    public String getTranscriptJson() {
        return transcriptJson;
    }

    public void setTranscriptJson(String transcriptJson) {
        this.transcriptJson = transcriptJson;
    }

    public String getActiveWordsJson() {
        return activeWordsJson;
    }

    public void setActiveWordsJson(String activeWordsJson) {
        this.activeWordsJson = activeWordsJson;
    }

    public String getRuntimeContextJson() {
        return runtimeContextJson;
    }

    public void setRuntimeContextJson(String runtimeContextJson) {
        this.runtimeContextJson = runtimeContextJson;
    }
}
