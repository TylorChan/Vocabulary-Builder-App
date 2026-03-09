package com.vocabulary.vocabularyBackend.controller;

import com.vocabulary.vocabularyBackend.model.VoiceSessionDocument;
import com.vocabulary.vocabularyBackend.service.VoiceSessionService;
import com.vocabulary.vocabularyBackend.service.VoiceSessionService.DeleteVoiceSessionsResult;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.stereotype.Controller;

import java.util.List;

@Controller
public class VoiceSessionController {

    private final VoiceSessionService voiceSessionService;

    public VoiceSessionController(VoiceSessionService voiceSessionService) {
        this.voiceSessionService = voiceSessionService;
    }

    @QueryMapping
    public List<VoiceSessionDocument> voiceSessions(@Argument String userId) {
        return voiceSessionService.loadSessions(userId);
    }

    @QueryMapping
    public VoiceSessionDocument voiceSessionSnapshot(@Argument String userId, @Argument String sessionId) {
        return voiceSessionService.loadSessionSnapshot(userId, sessionId).orElse(null);
    }

    @QueryMapping
    public String activeVoiceSession(@Argument String userId) {
        return voiceSessionService.loadActiveSession(userId);
    }

    @QueryMapping
    public String globalReviewProgress(@Argument String userId) {
        return voiceSessionService.loadGlobalReviewProgress(userId);
    }

    @MutationMapping
    public VoiceSessionDocument createVoiceSession(@Argument String userId, @Argument String title) {
        return voiceSessionService.createSession(userId, title);
    }

    @MutationMapping
    public VoiceSessionDocument saveVoiceSessionSnapshot(
            @Argument String userId,
            @Argument String sessionId,
            @Argument String title,
            @Argument String titleSource,
            @Argument String transcriptJson,
            @Argument String activeWordsJson,
            @Argument String runtimeContextJson
    ) {
        return voiceSessionService.saveSessionSnapshot(
                userId,
                sessionId,
                title,
                titleSource,
                transcriptJson,
                activeWordsJson,
                runtimeContextJson
        );
    }

    @MutationMapping
    public VoiceSessionDocument updateVoiceSessionMeta(
            @Argument String userId,
            @Argument String sessionId,
            @Argument String title,
            @Argument String titleSource
    ) {
        return voiceSessionService.updateSessionMeta(userId, sessionId, title, titleSource).orElse(null);
    }

    @MutationMapping
    public DeleteVoiceSessionsResult deleteVoiceSessions(@Argument String userId, @Argument List<String> sessionIds) {
        return voiceSessionService.deleteSessions(userId, sessionIds);
    }

    @MutationMapping
    public String setActiveVoiceSession(@Argument String userId, @Argument String sessionId) {
        return voiceSessionService.setActiveSession(userId, sessionId);
    }

    @MutationMapping
    public String saveGlobalReviewProgress(@Argument String userId, @Argument String progressJson) {
        return voiceSessionService.saveGlobalReviewProgress(userId, progressJson);
    }

    @MutationMapping
    public Boolean clearGlobalReviewProgress(@Argument String userId) {
        return voiceSessionService.clearGlobalReviewProgress(userId);
    }
}
