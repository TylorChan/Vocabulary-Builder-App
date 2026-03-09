package com.vocabulary.vocabularyBackend.service;

import com.vocabulary.vocabularyBackend.model.UserVoiceState;
import com.vocabulary.vocabularyBackend.model.VoiceSessionDocument;
import com.vocabulary.vocabularyBackend.repository.UserVoiceStateRepository;
import com.vocabulary.vocabularyBackend.repository.VoiceSessionRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class VoiceSessionService {

    public static class DeleteVoiceSessionsResult {
        private int deletedCount;

        public DeleteVoiceSessionsResult(int deletedCount) {
            this.deletedCount = deletedCount;
        }

        public int getDeletedCount() {
            return deletedCount;
        }

        public void setDeletedCount(int deletedCount) {
            this.deletedCount = deletedCount;
        }
    }

    private static final int MAX_SESSIONS_PER_USER = 30;

    private final VoiceSessionRepository voiceSessionRepository;
    private final UserVoiceStateRepository userVoiceStateRepository;

    public VoiceSessionService(
            VoiceSessionRepository voiceSessionRepository,
            UserVoiceStateRepository userVoiceStateRepository
    ) {
        this.voiceSessionRepository = voiceSessionRepository;
        this.userVoiceStateRepository = userVoiceStateRepository;
    }

    public List<VoiceSessionDocument> loadSessions(String userId) {
        return voiceSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    public Optional<VoiceSessionDocument> loadSessionSnapshot(String userId, String sessionId) {
        return voiceSessionRepository.findByUserIdAndSessionId(userId, sessionId);
    }

    public VoiceSessionDocument createSession(String userId, String title) {
        String now = Instant.now().toString();
        String resolvedTitle = title == null || title.isBlank() ? "New session" : title.trim();

        VoiceSessionDocument doc = new VoiceSessionDocument();
        doc.setSessionId(UUID.randomUUID().toString());
        doc.setUserId(userId);
        doc.setTitle(resolvedTitle);
        doc.setTitleSource("auto");
        doc.setCreatedAt(now);
        doc.setUpdatedAt(now);
        doc.setMessageCount(0);
        doc.setTranscriptJson("[]");
        doc.setActiveWordsJson("[]");
        doc.setRuntimeContextJson(null);

        VoiceSessionDocument saved = voiceSessionRepository.save(doc);
        pruneOverflowSessions(userId);
        setActiveSession(userId, saved.getSessionId());
        return saved;
    }

    public VoiceSessionDocument saveSessionSnapshot(
            String userId,
            String sessionId,
            String title,
            String titleSource,
            String transcriptJson,
            String activeWordsJson,
            String runtimeContextJson
    ) {
        String now = Instant.now().toString();
        VoiceSessionDocument doc = voiceSessionRepository
                .findByUserIdAndSessionId(userId, sessionId)
                .orElseGet(VoiceSessionDocument::new);

        if (doc.getSessionId() == null || doc.getSessionId().isBlank()) {
            doc.setSessionId(sessionId);
            doc.setUserId(userId);
            doc.setCreatedAt(now);
        }

        doc.setTitle((title == null || title.isBlank()) ? "Untitled session" : title.trim());
        doc.setTitleSource((titleSource == null || titleSource.isBlank()) ? "auto" : titleSource.trim());
        doc.setUpdatedAt(now);
        doc.setTranscriptJson(transcriptJson == null ? "[]" : transcriptJson);
        doc.setActiveWordsJson(activeWordsJson == null ? "[]" : activeWordsJson);
        doc.setRuntimeContextJson(runtimeContextJson);
        doc.setMessageCount(estimateMessageCount(doc.getTranscriptJson()));

        VoiceSessionDocument saved = voiceSessionRepository.save(doc);
        pruneOverflowSessions(userId);
        return saved;
    }

    public Optional<VoiceSessionDocument> updateSessionMeta(
            String userId,
            String sessionId,
            String title,
            String titleSource
    ) {
        Optional<VoiceSessionDocument> existing = voiceSessionRepository.findByUserIdAndSessionId(userId, sessionId);
        if (existing.isEmpty()) {
            return Optional.empty();
        }

        VoiceSessionDocument doc = existing.get();
        doc.setTitle((title == null || title.isBlank()) ? doc.getTitle() : title.trim());
        if (titleSource != null && !titleSource.isBlank()) {
            doc.setTitleSource(titleSource.trim());
        }
        doc.setUpdatedAt(Instant.now().toString());
        return Optional.of(voiceSessionRepository.save(doc));
    }

    public DeleteVoiceSessionsResult deleteSessions(String userId, List<String> sessionIds) {
        List<String> ids = (sessionIds == null ? List.<String>of() : sessionIds)
                .stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        if (ids.isEmpty()) {
            return new DeleteVoiceSessionsResult(0);
        }

        int before = voiceSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId).size();
        voiceSessionRepository.deleteByUserIdAndSessionIdIn(userId, ids);
        int after = voiceSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId).size();

        Optional<UserVoiceState> stateOpt = userVoiceStateRepository.findByUserId(userId);
        if (stateOpt.isPresent()) {
            UserVoiceState state = stateOpt.get();
            if (state.getActiveSessionId() != null && ids.contains(state.getActiveSessionId())) {
                state.setActiveSessionId(null);
                state.setUpdatedAt(Instant.now().toString());
                userVoiceStateRepository.save(state);
            }
        }

        return new DeleteVoiceSessionsResult(Math.max(0, before - after));
    }

    public String setActiveSession(String userId, String sessionId) {
        UserVoiceState state = userVoiceStateRepository.findByUserId(userId).orElseGet(UserVoiceState::new);
        state.setUserId(userId);
        state.setActiveSessionId(sessionId);
        state.setUpdatedAt(Instant.now().toString());
        userVoiceStateRepository.save(state);
        return state.getActiveSessionId();
    }

    public String loadActiveSession(String userId) {
        return userVoiceStateRepository.findByUserId(userId)
                .map(UserVoiceState::getActiveSessionId)
                .orElse(null);
    }

    public String saveGlobalReviewProgress(String userId, String progressJson) {
        UserVoiceState state = userVoiceStateRepository.findByUserId(userId).orElseGet(UserVoiceState::new);
        state.setUserId(userId);
        state.setGlobalReviewProgressJson(progressJson);
        state.setUpdatedAt(Instant.now().toString());
        userVoiceStateRepository.save(state);
        return state.getGlobalReviewProgressJson();
    }

    public String loadGlobalReviewProgress(String userId) {
        return userVoiceStateRepository.findByUserId(userId)
                .map(UserVoiceState::getGlobalReviewProgressJson)
                .orElse(null);
    }

    public boolean clearGlobalReviewProgress(String userId) {
        Optional<UserVoiceState> stateOpt = userVoiceStateRepository.findByUserId(userId);
        if (stateOpt.isEmpty()) {
            return true;
        }

        UserVoiceState state = stateOpt.get();
        state.setGlobalReviewProgressJson(null);
        state.setUpdatedAt(Instant.now().toString());
        userVoiceStateRepository.save(state);
        return true;
    }

    private int estimateMessageCount(String transcriptJson) {
        if (transcriptJson == null || transcriptJson.isBlank()) {
            return 0;
        }
        int count = 0;
        int index = 0;
        String marker = "\"type\":\"MESSAGE\"";
        while ((index = transcriptJson.indexOf(marker, index)) >= 0) {
            count += 1;
            index += marker.length();
        }
        return count;
    }

    private void pruneOverflowSessions(String userId) {
        List<VoiceSessionDocument> ordered = voiceSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        if (ordered.size() <= MAX_SESSIONS_PER_USER) {
            return;
        }

        List<VoiceSessionDocument> toDelete = new ArrayList<>(ordered.subList(MAX_SESSIONS_PER_USER, ordered.size()));
        voiceSessionRepository.deleteAll(toDelete);
    }
}
