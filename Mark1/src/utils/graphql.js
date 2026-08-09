import { GRAPHQL_ENDPOINT } from "../config/apiConfig";
import {
    deleteExpressionRetrievalIndex,
    syncExpressionRetrievalIndex,
} from "./expressionAssistClient";
export const DEFAULT_USER_ID = "default-user";

const EXPRESSION_LEARNING_CONTEXT_FIELDS = `
  learningContext {
    schemaVersion
    discoveryMode
    meaning {
      senseDefinition
      communicativeFunction
      usagePattern
    }
    origin {
      situationSummary
      sourceType
      sourceSpeaker
      sessionId
      sourceMessageId
      sourceExcerpt
      evidenceMessageIds
    }
    provenance {
      matchMethod
      extractorModel
      extractorPromptVersion
      validated
      validatedAt
    }
    gap {
      gapType
      learnerAttempt
      suggestedRecast
      triggerEvidenceMessageIds
    }
  }
`;

/**
* Make a GraphQL request
* @param {string} query - GraphQL query (read)/mutation string
* @param {object} variables - Variables for the query
* @returns {Promise<object>} - Response data
 * */
async function graphqlRequest(query, variables = {}) {
    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            variables,
        }),
    });

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors[0].message);
    }
    return result.data;
}


/**
 * Save a vocabulary entry to the database
 * @param {object} vocabularyData - Vocabulary entry data from DTO
 * @returns {Promise<object>} - Saved vocabulary entry with id and createdAt
 */

export async function saveVocabulary(vocabularyData) {
    const mutation = `
      mutation SaveVocabulary($input: VocabularyInput!) {
        saveVocabulary(input: $input) {
          id
          text
          definition
          createdAt
          ${EXPRESSION_LEARNING_CONTEXT_FIELDS}
        }
      }
    `;

    const variables = {
        input: {
            text: vocabularyData.text,
            definition: vocabularyData.definition,
            example: vocabularyData.example || "",
          exampleTrans: vocabularyData.exampleTrans || "",
          realLifeDef: vocabularyData.realLifeDef || "",
          surroundingText: vocabularyData.surroundingText || "",
          videoTitle: vocabularyData.videoTitle || "",
            sourceVideoUrl: vocabularyData.sourceVideoUrl || null,
            userId: vocabularyData.userId || DEFAULT_USER_ID,
            ...(vocabularyData.learningContext ? {
                learningContext: vocabularyData.learningContext,
            } : {}),
        },
    };

    const result = await graphqlRequest(mutation, variables);
    const savedVocabularyId = result?.saveVocabulary?.id;
    if (savedVocabularyId) {
        void syncExpressionRetrievalIndex({
            userId: variables.input.userId,
            vocabularyId: savedVocabularyId,
        }).catch((error) => {
            console.warn("Vocabulary saved, but Expression index sync failed:", error);
        });
    }
    return result;
}

export async function startReviewSession(userId = DEFAULT_USER_ID) {
    const mutation = `
      mutation StartReviewSession($userId: String!) {
        startReviewSession(userId: $userId) {
          id
          text
          definition
          example
          exampleTrans
          realLifeDef
          surroundingText
          videoTitle
          sourceVideoUrl
          createdAt
          ${EXPRESSION_LEARNING_CONTEXT_FIELDS}
          fsrsCard {
            difficulty
            stability
            dueDate
            state
            lastReview
            reps
          }
        }
      }
    `;

    const data = await graphqlRequest(mutation, { userId });
    return data?.startReviewSession ?? []
}

export async function fetchVocabularyEntries(userId = DEFAULT_USER_ID) {
    const query = `
      query VocabularyEntries($userId: String!) {
        vocabularyEntries(userId: $userId) {
          id
          text
          definition
          example
          exampleTrans
          realLifeDef
          surroundingText
          videoTitle
          sourceVideoUrl
          createdAt
          ${EXPRESSION_LEARNING_CONTEXT_FIELDS}
          fsrsCard {
            difficulty
            stability
            dueDate
            state
            lastReview
            reps
          }
        }
      }
    `;

    const data = await graphqlRequest(query, { userId });
    return data?.vocabularyEntries ?? [];
}

export async function updateVocabularyDueDate(
    userId = DEFAULT_USER_ID,
    vocabularyId,
    dueDate
) {
    const mutation = `
      mutation UpdateVocabularyDueDate(
        $userId: String!
        $vocabularyId: ID!
        $dueDate: String!
      ) {
        updateVocabularyDueDate(
          userId: $userId
          vocabularyId: $vocabularyId
          dueDate: $dueDate
        ) {
          id
          fsrsCard {
            dueDate
          }
        }
      }
    `;

    const data = await graphqlRequest(mutation, {
        userId,
        vocabularyId,
        dueDate,
    });
    return data?.updateVocabularyDueDate ?? null;
}

export async function deleteVocabularyEntry(userId = DEFAULT_USER_ID, vocabularyId) {
    const mutation = `
      mutation DeleteVocabularyEntry($userId: String!, $vocabularyId: ID!) {
        deleteVocabularyEntry(userId: $userId, vocabularyId: $vocabularyId)
      }
    `;
    const data = await graphqlRequest(mutation, {
        userId,
        vocabularyId,
    });
    const deleted = Boolean(data?.deleteVocabularyEntry);
    if (deleted) {
        void deleteExpressionRetrievalIndex({ userId, vocabularyId }).catch((error) => {
            console.warn("Vocabulary deleted, but Expression index cleanup failed:", error);
        });
    }
    return deleted;
}

// Save review session updates
export async function saveReviewSession(updates) {
    const mutation = `
      mutation SaveReviewSession($updates: [CardUpdateInput!]!) {
        saveReviewSession(updates: $updates) {
          success
          savedCount
          message
        }
      }
    `;

    const data = await graphqlRequest(mutation, { updates });
    return data?.saveReviewSession;
  }
