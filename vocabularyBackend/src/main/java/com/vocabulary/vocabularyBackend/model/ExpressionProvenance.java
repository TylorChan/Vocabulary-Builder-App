package com.vocabulary.vocabularyBackend.model;

public class ExpressionProvenance {
    private String matchMethod;
    private String extractorModel;
    private String extractorPromptVersion;
    private boolean validated;
    private String validatedAt;

    public ExpressionProvenance() {}

    public String getMatchMethod() {
        return matchMethod;
    }

    public void setMatchMethod(String matchMethod) {
        this.matchMethod = matchMethod;
    }

    public String getExtractorModel() {
        return extractorModel;
    }

    public void setExtractorModel(String extractorModel) {
        this.extractorModel = extractorModel;
    }

    public String getExtractorPromptVersion() {
        return extractorPromptVersion;
    }

    public void setExtractorPromptVersion(String extractorPromptVersion) {
        this.extractorPromptVersion = extractorPromptVersion;
    }

    public boolean isValidated() {
        return validated;
    }

    public void setValidated(boolean validated) {
        this.validated = validated;
    }

    public String getValidatedAt() {
        return validatedAt;
    }

    public void setValidatedAt(String validatedAt) {
        this.validatedAt = validatedAt;
    }
}
