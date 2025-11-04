package com.vocabulary.vocabularyBackend.service;

import com.vocabulary.vocabularyBackend.model.FSRSCard;
import com.vocabulary.vocabularyBackend.model.FSRSState;
import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import com.vocabulary.vocabularyBackend.repository.VocabularyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ReviewService {
    private static final Logger logger = LoggerFactory.getLogger(ReviewService.class);

    private final FSRSScheduler fsrsScheduler;
    private final VocabularyRepository vocabularyRepository;

    public ReviewService(FSRSScheduler fsrsScheduler, VocabularyRepository vocabularyRepository) {
        this.fsrsScheduler = fsrsScheduler;
        this.vocabularyRepository = vocabularyRepository;
    }

    /**
     * START REVIEW SESSION (MongoDB Call #1)
     * Load cards due for review from MongoDB
     *
     * @param userId User ID
     * @return List of vocabulary entries due for review (max 20)
     */
    public List<VocabularyEntry> startReviewSession(String userId) {
        logger.info("Starting review session for userId={}", userId);

        List<VocabularyEntry> dueCards = fsrsScheduler.getCardsForReview(userId);

        logger.info("Review session started: {} cards loaded", dueCards.size());

        return dueCards;
    }

    /**
     * SAVE REVIEW SESSION (MongoDB Call #2)
     * Batch save all FSRS card updates at session end
     *
     * @param updates List of card updates with vocabularyId and updated FSRS data
     * @return Result with success status and count of saved cards
     */
    public SaveSessionResult saveReviewSession(List<CardUpdate> updates) {
        logger.info("Saving review session: {} card updates", updates.size());

        try {
            // Extract all vocabulary IDs
            List<String> vocabularyIds = updates.stream()
                    .map(CardUpdate::getVocabularyId)
                    .collect(Collectors.toList());

            // Load all vocabulary entries by IDs (single batch query)
            List<VocabularyEntry> entries = vocabularyRepository.findAllById(vocabularyIds);

            // Create a map for quick lookup
            Map<String, VocabularyEntry> entryMap = entries.stream()
                    .collect(Collectors.toMap(VocabularyEntry::getId, entry -> entry));

            // Update each entry's fsrsCard with new data
            for (CardUpdate update : updates) {
                VocabularyEntry entry = entryMap.get(update.getVocabularyId());

                if (entry == null) {
                    logger.warn("Vocabulary entry not found: {}", update.getVocabularyId());
                    continue;
                }

                // Update FSRS card fields
                FSRSCard fsrsCard = entry.getFsrsCard();
                fsrsCard.setDifficulty(update.getDifficulty());
                fsrsCard.setStability(update.getStability());
                fsrsCard.setDueDate(parseDateTime(update.getDueDate()));
                fsrsCard.setState(FSRSState.valueOf(update.getState()));
                fsrsCard.setLastReview(parseDateTime(update.getLastReview()));
                fsrsCard.setReps(update.getReps());

                logger.debug("Updated card {}: state={}, due={}",
                    entry.getText(), fsrsCard.getState(), fsrsCard.getDueDate());
            }

            // Batch save all entries (single MongoDB operation)
            vocabularyRepository.saveAll(entries);

            logger.info("Review session saved successfully: {} cards updated", entries.size());

            return new SaveSessionResult(true, entries.size(), "Review session saved successfully");

        } catch (Exception e) {
            logger.error("Failed to save review session: {}", e.getMessage(), e);
            return new SaveSessionResult(false, 0, "Failed to save review session: " + e.getMessage());
        }
    }

    /**
     * Helper method to parse ISO 8601 datetime strings
     */
    private LocalDateTime parseDateTime(String dateTimeStr) {
        if (dateTimeStr == null || dateTimeStr.isEmpty()) {
            return null;
        }

        try {
            // Handle different formats: "2025-10-26T10:00:00Z" or "2025-10-26T10:00:00+00:00"
            String normalized = dateTimeStr.replace("Z", "");

            // Remove timezone offset if present
            if (normalized.contains("+")) {
                normalized = normalized.substring(0, normalized.indexOf('+'));
            }

            return LocalDateTime.parse(normalized, DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        } catch (Exception e) {
            logger.error("Failed to parse datetime: {}", dateTimeStr, e);
            return null;
        }
    }

    /**
     * DTO for card update data
     */
    public static class CardUpdate {
        private String vocabularyId;
        private Double difficulty;
        private Double stability;
        private String dueDate;
        private String state;
        private String lastReview;
        private Integer reps;

        // Constructors
        public CardUpdate() {}

        public CardUpdate(String vocabularyId, Double difficulty, Double stability,
                         String dueDate, String state, String lastReview, Integer reps) {
            this.vocabularyId = vocabularyId;
            this.difficulty = difficulty;
            this.stability = stability;
            this.dueDate = dueDate;
            this.state = state;
            this.lastReview = lastReview;
            this.reps = reps;
        }

        // Getters and setters
        public String getVocabularyId() { return vocabularyId; }
        public void setVocabularyId(String vocabularyId) { this.vocabularyId = vocabularyId; }

        public Double getDifficulty() { return difficulty; }
        public void setDifficulty(Double difficulty) { this.difficulty = difficulty; }

        public Double getStability() { return stability; }
        public void setStability(Double stability) { this.stability = stability; }

        public String getDueDate() { return dueDate; }
        public void setDueDate(String dueDate) { this.dueDate = dueDate; }

        public String getState() { return state; }
        public void setState(String state) { this.state = state; }

        public String getLastReview() { return lastReview; }
        public void setLastReview(String lastReview) { this.lastReview = lastReview; }

        public Integer getReps() { return reps; }
        public void setReps(Integer reps) { this.reps = reps; }
    }

    /**
     * DTO for save session result
     */
    public static class SaveSessionResult {
        private boolean success;
        private int savedCount;
        private String message;

        public SaveSessionResult(boolean success, int savedCount, String message) {
            this.success = success;
            this.savedCount = savedCount;
            this.message = message;
        }

        // Getters
        public boolean isSuccess() { return success; }
        public int getSavedCount() { return savedCount; }
        public String getMessage() { return message; }
    }
}
