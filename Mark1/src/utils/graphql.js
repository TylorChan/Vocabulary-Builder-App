const GRAPHQL_ENDPOINT = 'http://localhost:8080/graphql';
export const DEFAULT_USER_ID = "default-user";

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
            userId: vocabularyData.userId || "default-user", // TODO: Replace with actua user ID
        },
    };

    return graphqlRequest(mutation, variables);
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
          createdAt
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




