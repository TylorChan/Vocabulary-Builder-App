package com.vocabulary.vocabularyBackend.controller;


import com.vocabulary.vocabularyBackend.dto.VocabularyInput;
import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import com.vocabulary.vocabularyBackend.repository.VocabularyRepository;
import com.vocabulary.vocabularyBackend.service.ReviewService;
import com.vocabulary.vocabularyBackend.service.ReviewService.CardUpdate;
import com.vocabulary.vocabularyBackend.service.ReviewService.SaveSessionResult;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.stereotype.Controller;

import java.util.List;


/**
 * GraphQL controller for vocabulary operations.
 * Handles mutations (create/update/delete) and queries (read).
 */
@Controller
public class VocabularyController {
    private final VocabularyRepository vocabularyRepository;
    private final ReviewService reviewService;

    /**
     * Injects VocabularyRepository and ReviewService.
     * @param vocabularyRepository The repository for database operations
     * @param reviewService The service for review session management
     */
    public VocabularyController(VocabularyRepository vocabularyRepository, ReviewService reviewService) {
        this.vocabularyRepository = vocabularyRepository;
        this.reviewService = reviewService;
    }

    /**
     * Handles the saveVocabulary GraphQL mutation.
     *
     * Flow example:
     * 1. Client sends GraphQL mutation with VocabularyInput data
     * 2. Spring validates input against schema (schema.graphqls)
     * 3. Spring converts JSON to VocabularyInput object (using setters)
     * 4. This method receives the populated input object
     * 5. Creates VocabularyEntry entity from DTO
     * 6. Saves to MongoDB (repository generates id and uses createdAt from
     constructor)
     * 7. Returns saved entry to client (Spring converts to GraphQL response)
     *
     * @param input The vocabulary data from the GraphQL mutation (validated by
    schema)
     * @return The saved VocabularyEntry with MongoDB-generated id and createdAt
     */
    @MutationMapping
    public VocabularyEntry saveVocabulary(@Argument VocabularyInput input) {
        // Convert DTO to Entity
        // DTO = what client sends (no id, no createdAt)
        // Entity = what database stores (has id, has createdAt)
        VocabularyEntry entry = new VocabularyEntry(
                input.getText(),
                input.getDefinition(),
                input.getExample(),
                input.getExampleTrans(),
                input.getRealLifeDef(),
                input.getSurroundingText(),
                input.getVideoTitle(),
                input.getUserId()
        );

        // Save to MongoDB
        return vocabularyRepository.save(entry);
    }

    /**
     * Handles the startReviewSession GraphQL mutation.
     *
     * Flow:
     * 1. Client sends userId via GraphQL mutation
     * 2. This method receives userId as argument
     * 3. Calls ReviewService.startReviewSession(userId)
     * 4. ReviewService calls FSRSScheduler to load cards from MongoDB
     * 5. Returns list of VocabularyEntry objects due for review
     *
     * @param userId User ID to load review cards for
     * @return List of vocabulary entries due for review (max 20)
     */
    @MutationMapping
    public List<VocabularyEntry> startReviewSession(@Argument String userId)
    {
        return reviewService.startReviewSession(userId);
    }

    /**
     * Handles the saveReviewSession GraphQL mutation.
     *
     * Flow:
     * 1. Client sends array of CardUpdateInput objects via GraphQL
     * 2. Spring automatically converts GraphQL input to List<CardUpdate>
     * 3. This method receives the list as argument
     * 4. Calls ReviewService.saveReviewSession() for batch save
     * 5. Returns SaveSessionResult with success status and count
     *
     * @param updates List of card updates from frontend (after review session)
     * @return Result object with success status, count, and message
     */
    @MutationMapping
    public SaveSessionResult saveReviewSession(@Argument List<CardUpdate> updates)
    {
        return reviewService.saveReviewSession(updates);
    }

}
