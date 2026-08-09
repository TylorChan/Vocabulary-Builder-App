package com.vocabulary.vocabularyBackend.model;

import java.util.List;

public class ExpressionOrigin {
    private String situationSummary;
    private String sourceType;
    private String sourceSpeaker;
    private String sessionId;
    private String sourceMessageId;
    private String sourceExcerpt;
    private List<String> evidenceMessageIds;

    public ExpressionOrigin() {}

    public String getSituationSummary() {
        return situationSummary;
    }

    public void setSituationSummary(String situationSummary) {
        this.situationSummary = situationSummary;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getSourceSpeaker() {
        return sourceSpeaker;
    }

    public void setSourceSpeaker(String sourceSpeaker) {
        this.sourceSpeaker = sourceSpeaker;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getSourceMessageId() {
        return sourceMessageId;
    }

    public void setSourceMessageId(String sourceMessageId) {
        this.sourceMessageId = sourceMessageId;
    }

    public String getSourceExcerpt() {
        return sourceExcerpt;
    }

    public void setSourceExcerpt(String sourceExcerpt) {
        this.sourceExcerpt = sourceExcerpt;
    }

    public List<String> getEvidenceMessageIds() {
        return evidenceMessageIds;
    }

    public void setEvidenceMessageIds(List<String> evidenceMessageIds) {
        this.evidenceMessageIds = evidenceMessageIds;
    }
}
