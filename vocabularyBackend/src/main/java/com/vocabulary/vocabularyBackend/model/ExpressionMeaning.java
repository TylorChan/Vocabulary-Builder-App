package com.vocabulary.vocabularyBackend.model;

public class ExpressionMeaning {
    private String senseDefinition;
    private String communicativeFunction;
    private String usagePattern;

    public ExpressionMeaning() {}

    public String getSenseDefinition() {
        return senseDefinition;
    }

    public void setSenseDefinition(String senseDefinition) {
        this.senseDefinition = senseDefinition;
    }

    public String getCommunicativeFunction() {
        return communicativeFunction;
    }

    public void setCommunicativeFunction(String communicativeFunction) {
        this.communicativeFunction = communicativeFunction;
    }

    public String getUsagePattern() {
        return usagePattern;
    }

    public void setUsagePattern(String usagePattern) {
        this.usagePattern = usagePattern;
    }
}
