package com.vocabulary.vocabularyBackend.model;

import java.util.List;

public class ExpressionGap {
    private String gapType;
    private String learnerAttempt;
    private String suggestedRecast;
    private List<String> triggerEvidenceMessageIds;

    public ExpressionGap() {}

    public String getGapType() {
        return gapType;
    }

    public void setGapType(String gapType) {
        this.gapType = gapType;
    }

    public String getLearnerAttempt() {
        return learnerAttempt;
    }

    public void setLearnerAttempt(String learnerAttempt) {
        this.learnerAttempt = learnerAttempt;
    }

    public String getSuggestedRecast() {
        return suggestedRecast;
    }

    public void setSuggestedRecast(String suggestedRecast) {
        this.suggestedRecast = suggestedRecast;
    }

    public List<String> getTriggerEvidenceMessageIds() {
        return triggerEvidenceMessageIds;
    }

    public void setTriggerEvidenceMessageIds(List<String> triggerEvidenceMessageIds) {
        this.triggerEvidenceMessageIds = triggerEvidenceMessageIds;
    }
}
