package com.vocabulary.vocabularyBackend.service;

import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import com.vocabulary.vocabularyBackend.repository.VocabularyRepository;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;


import java.time.LocalDateTime;
import java.util.List;

/**
 * FSRS scheduler service for managing spaced repetition review sessions.
 * Queries MongoDB for vocabulary cards due for review.
 */
@Service
public class FSRSScheduler {
    private static final Logger logger = LoggerFactory.getLogger(FSRSScheduler.class);
    private static final int DEFAULT_REVIEW_LIMIT = 20;

    private final VocabularyRepository vocabularyRepository;
    public FSRSScheduler(VocabularyRepository vocabularyRepository) {
        this.vocabularyRepository = vocabularyRepository;
    }

    public List<VocabularyEntry> getCardsForReview(String userId) {
        LocalDateTime now = LocalDateTime.now();

        logger.info("Finding cards for review: userId={}, currentTime={}", userId, now);

        // Create sort: ORDER BY fsrsCard.dueDate ASC
        Sort sort = Sort.by(Sort.Direction.ASC, "fsrsCard.dueDate");

        // Query MongoDB with @Query annotation
        List<VocabularyEntry> dueCards = vocabularyRepository.findDueCards(userId, now, sort);

        // Limit to 20 cards
        List<VocabularyEntry> reviewSession = dueCards.size() > DEFAULT_REVIEW_LIMIT
                ? dueCards.subList(0, DEFAULT_REVIEW_LIMIT)
                : dueCards;

        logger.info("Found {} cards due for review (returning {})",
                dueCards.size(), reviewSession.size());
        return reviewSession;

    }


}
