const GRAPHQL_ENDPOINT = 'http://localhost:8080/graphql';

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


