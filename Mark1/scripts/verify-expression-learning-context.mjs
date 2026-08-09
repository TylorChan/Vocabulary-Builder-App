const apiBaseUrl = process.env.EXPRESSION_API_BASE_URL || "http://127.0.0.1:3000";
const graphqlUrl = process.env.EXPRESSION_GRAPHQL_URL || "http://127.0.0.1:8080/graphql";

const expressionRequest = {
    expression: "contender",
    sessionId: "expression-live-verification",
    userId: "expression-live-verification@local.test",
    discoveryMode: "USER_EXPLICIT_SAVE",
    source: {
        messageId: "assistant-anchor",
        speaker: "assistant",
        excerpt: "Doctor Doom is a serious contender because he can challenge the heroes politically and physically.",
        matchMethod: "EXACT",
    },
    evidenceMessages: [
        {
            messageId: "user-topic",
            role: "user",
            text: "In the Marvel universe, who could become the main villain after Kang?",
        },
        {
            messageId: "assistant-anchor",
            role: "assistant",
            text: "Doctor Doom is a serious contender because he can challenge the heroes politically and physically.",
        },
    ],
};

const learningContextFields = `
    id text definition realLifeDef surroundingText userId
    learningContext {
        schemaVersion discoveryMode
        meaning { senseDefinition communicativeFunction usagePattern }
        origin {
            situationSummary sourceType sourceSpeaker sessionId sourceMessageId
            sourceExcerpt evidenceMessageIds
        }
        provenance {
            matchMethod extractorModel extractorPromptVersion validated validatedAt
        }
    }
`;

async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`${url} failed (${response.status}): ${JSON.stringify(result)}`);
    }
    return result;
}

async function graphql(query, variables) {
    const result = await postJson(graphqlUrl, {query, variables});
    if (result.errors) {
        throw new Error(`GraphQL failed: ${JSON.stringify(result.errors)}`);
    }
    return result.data;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const userId = `expression-live-verification-${Date.now()}@local.test`;
let savedId = null;

try {
    const enrichment = await postJson(`${apiBaseUrl}/api/expression/enrich`, expressionRequest);
    assert(enrichment.learningContext?.provenance?.extractorModel === "gpt-5.6-terra", "Terra provenance is missing");
    assert(!enrichment.surroundingText.includes("I want to save"), "Save command leaked into enrichment");

    const saved = await graphql(
        `mutation Save($input: VocabularyInput!) {
            saveVocabulary(input: $input) { ${learningContextFields} }
        }`,
        {
            input: {
                text: expressionRequest.expression,
                definition: enrichment.definition,
                example: "",
                exampleTrans: "",
                realLifeDef: enrichment.usage,
                surroundingText: enrichment.surroundingText,
                videoTitle: "Voice conversation",
                sourceVideoUrl: null,
                userId,
                learningContext: enrichment.learningContext,
            },
        },
    );
    savedId = saved.saveVocabulary.id;

    const queried = await graphql(
        `query Entries($userId: String!) {
            vocabularyEntries(userId: $userId) { ${learningContextFields} }
        }`,
        {userId},
    );
    const entry = queried.vocabularyEntries.find((item) => item.id === savedId);
    assert(entry, "Saved entry was not returned from MongoDB");
    assert(entry.learningContext.origin.sourceMessageId === "assistant-anchor", "Source provenance was not persisted");
    assert(entry.learningContext.origin.evidenceMessageIds.length === 2, "Evidence IDs were not persisted");

    const dueWords = [{
        ...entry,
        videoTitle: "Voice conversation",
        fsrsCard: {state: "LEARNING", reps: 1, dueDate: new Date().toISOString()},
    }];
    const currentUserFocus = "debating who should be the next major Marvel villain";
    const semantic = {profile: {coreInterests: [{label: "Marvel"}]}};
    const retrieval = await postJson(`${apiBaseUrl}/api/roleplay/retrieval-plan`, {
        dueWords,
        semantic,
        currentUserFocus,
    });
    assert(retrieval.groups?.length, "Retrieval planner returned no groups");

    const groupSemanticHints = retrieval.groups.map((group) => ({
        groupId: group.groupId,
        targetWordIds: group.targetWordIds,
        targetWords: group.targetWords,
        retrievalQuery: group.retrievalQuery,
        hints: [],
    }));
    const plan = await postJson(`${apiBaseUrl}/api/roleplay/plan`, {
        dueWords,
        memory: {semantic},
        semanticHints: [],
        wordGroups: retrieval.groups,
        groupSemanticHints,
        currentUserFocus,
    });
    assert(plan.scenes?.length, "Scene Planner returned no scenes");
    assert(
        plan.scenes.some((scene) => scene.targetWordIds?.includes(savedId)),
        "Scene Planner omitted the saved Expression",
    );

    console.log(JSON.stringify({
        ok: true,
        savedId,
        extractorModel: entry.learningContext.provenance.extractorModel,
        surroundingText: entry.surroundingText,
        retrievalGroupCount: retrieval.groups.length,
        sceneCount: plan.scenes.length,
        firstSceneTitle: plan.scenes[0].title,
    }, null, 2));
} finally {
    if (savedId) {
        const cleanup = await graphql(
            `mutation Delete($userId: String!, $id: ID!) {
                deleteVocabularyEntry(userId: $userId, vocabularyId: $id)
            }`,
            {userId, id: savedId},
        );
        assert(cleanup.deleteVocabularyEntry, "Integration record cleanup failed");
        console.log("cleanup: deleted integration vocabulary record");
    }
}
