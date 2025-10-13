package com.vocabulary.vocabularyBackend.repository;

import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository interface for VocabularyEntry CRUD operations.
 * Spring Data MongoDB automatically implements these methods.
 */
@Repository
public interface VocabularyRepository extends MongoRepository<VocabularyEntry, String> {

    // ===== Basic Query Methods (Spring Data auto-implements these) =====
    /**
     * Find all the entries.
     * @return List of vocabulary entries
     * */
    List<VocabularyEntry> findAll();

    /**
     * Find a vocabulary entry by its ID.
     * @param id The vocabulary entry ID
     * @return Optional containing the entry if found
     */
    Optional<VocabularyEntry> findById(String id);

    /**
     * Find all vocabulary entries for a specific user.
     * @param userId The user's ID
     * @return List of vocabulary entries belonging to the user
     */
    List<VocabularyEntry> findByUserId(String userId);

    /**
     * Find all entries from a specific video.
     * @param videoTitle The YouTube video title
     * @return List of entries from that video
     */
    List<VocabularyEntry> findByVideoTitle(String videoTitle);

    /**
     * Find all entries for a user from a specific video.
     * @param userId The user's ID
     * @param videoTitle The video title
     * @return List of entries
     */
    List<VocabularyEntry> findByUserIdAndVideoTitle(String userId, String videoTitle);

    /**
     * Check if a user has already saved a specific word/phrase.
     * @param userId The user's ID
     * @param text The word/phrase text
     * @return true if exists, false otherwise
     */
    boolean existsByUserIdAndText(String userId, String text);

    /**
     * Delete all vocabulary entries for a specific user.
     * @param userId The user's ID
     */
    void deleteByUserId(String userId);

    /**
     * Count total vocabulary entries for a user.
     * @param userId The user's ID
     * @return Number of entries
     */
    long countByUserId(String userId);

    /**
     * Get the most recently added entries for a user.
     * @param userId The user's ID
     * @return List of recent entries (sorted by createdAt descending)
     */
    List<VocabularyEntry> findByUserIdOrderByCreatedAtDesc(String userId);

}