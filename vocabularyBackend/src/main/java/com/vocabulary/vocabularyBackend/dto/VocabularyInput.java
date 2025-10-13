package com.vocabulary.vocabularyBackend.dto;

public class VocabularyInput {

    private String text;
    private String definition;
    private String example;
    private String exampleTrans;
    private String realLifeDef;
    private String surroundingText;
    private String videoTitle;
    private String userId;

    // No-arg constructor (required for Spring)
    public VocabularyInput() {}

    // Getters and Setters
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
}
