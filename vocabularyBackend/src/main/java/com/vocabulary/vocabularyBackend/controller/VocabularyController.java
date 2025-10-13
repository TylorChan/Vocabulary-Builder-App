package com.vocabulary.vocabularyBackend.controller;


import com.vocabulary.vocabularyBackend.dto.VocabularyInput;
import com.vocabulary.vocabularyBackend.model.VocabularyEntry;
import com.vocabulary.vocabularyBackend.repository.VocabularyRepository;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.stereotype.Controller;


/**
 * GraphQL controller for vocabulary operations.
 * Handles mutations (create/update/delete) and queries (read).
 */
@Controller
public class VocabularyController {
    private final VocabularyRepository vocabularyRepository;

    /**
     * injects VocabularyRepository.
     * @param vocabularyRepository The repository for database operations
     */
    public VocabularyController(VocabularyRepository vocabularyRepository) {
        this.vocabularyRepository = vocabularyRepository;
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
}
