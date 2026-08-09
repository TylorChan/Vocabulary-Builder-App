package com.vocabulary.vocabularyBackend.model;

public class ExpressionLearningContext {
    private int schemaVersion;
    private String discoveryMode;
    private ExpressionMeaning meaning;
    private ExpressionOrigin origin;
    private ExpressionProvenance provenance;
    private ExpressionGap gap;

    public ExpressionLearningContext() {}

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getDiscoveryMode() {
        return discoveryMode;
    }

    public void setDiscoveryMode(String discoveryMode) {
        this.discoveryMode = discoveryMode;
    }

    public ExpressionMeaning getMeaning() {
        return meaning;
    }

    public void setMeaning(ExpressionMeaning meaning) {
        this.meaning = meaning;
    }

    public ExpressionOrigin getOrigin() {
        return origin;
    }

    public void setOrigin(ExpressionOrigin origin) {
        this.origin = origin;
    }

    public ExpressionProvenance getProvenance() {
        return provenance;
    }

    public void setProvenance(ExpressionProvenance provenance) {
        this.provenance = provenance;
    }

    public ExpressionGap getGap() {
        return gap;
    }

    public void setGap(ExpressionGap gap) {
        this.gap = gap;
    }
}
