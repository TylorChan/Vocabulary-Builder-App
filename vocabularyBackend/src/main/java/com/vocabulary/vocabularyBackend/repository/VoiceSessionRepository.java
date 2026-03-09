package com.vocabulary.vocabularyBackend.repository;

import com.vocabulary.vocabularyBackend.model.VoiceSessionDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VoiceSessionRepository extends MongoRepository<VoiceSessionDocument, String> {

    List<VoiceSessionDocument> findByUserIdOrderByUpdatedAtDesc(String userId);

    Optional<VoiceSessionDocument> findByUserIdAndSessionId(String userId, String sessionId);

    void deleteByUserIdAndSessionIdIn(String userId, List<String> sessionIds);
}
