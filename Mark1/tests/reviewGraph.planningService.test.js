import test from "node:test";
import assert from "node:assert/strict";
import {
    createRolePlayPlanningService,
    MAX_GROUP_RETRIEVAL_QUERY_CHARS,
    MAX_SCENE_ABSTRACT_CHARS,
    MAX_SCENE_ABSTRACT_WORDS,
    validateScenePlanTeachingBeats,
} from "../services/rolePlayPlanningService.js";

const dueWords = [
    {
        id: "word-contender",
        text: "contender",
        definition: "A person likely to succeed.",
        surroundingText: "Doctor Doom is a serious contender.",
        videoTitle: "Marvel villains",
    },
    {
        id: "word-blue",
        text: "out of the blue",
        definition: "Unexpectedly.",
        surroundingText: "The news came out of the blue.",
        videoTitle: "Unexpected trades",
    },
];

function makeOpenAIClient() {
    const requests = [];
    return {
        requests,
        responses: {
            async create(request) {
                requests.push(request);
                if (requests.length === 1) {
                    return {
                        output_text: JSON.stringify({
                            groups: [
                                {
                                    groupId: "g-villain",
                                    theme: "debating a strong challenger",
                                    targetWordIds: ["word-contender"],
                                    targetWords: ["wrong model text"],
                                    retrievalQuery: "This model query is intentionally ignored.",
                                },
                                {
                                    groupId: "g-surprise",
                                    theme: "reacting to surprising news",
                                    targetWordIds: ["word-blue"],
                                    targetWords: ["wrong model text"],
                                    retrievalQuery: "This model query is intentionally ignored.",
                                },
                            ],
                        }),
                    };
                }
                return {
                    output_text: JSON.stringify({
                        mode: "role-play",
                        scenes: [{
                            sceneId: "scene-one",
                            title: "Villain debate",
                            abstract: "Debate a friend after a premiere and name a credible villain contender.",
                            setting: "After a movie premiere.",
                            background: "Two friends debate the next major villain.",
                            roles: ["Tutor: friend", "User: fan"],
                            goal: "Name a credible challenger.",
                            starterLine: "Who could challenge the heroes next?",
                            rationale: "Matches the word and retrieved interest.",
                            tone: "casual",
                            sensoryDetail: "Movie posters glow in the lobby.",
                            targetWordIds: ["word-contender"],
                            targetWords: ["contender"],
                            suggestedSlang: ["dark horse"],
                            teachingBeats: [{
                                beatId: "contender-elicit",
                                type: "ELICIT",
                                targetIds: ["word-contender"],
                                communicativeNeed: {
                                    situation: "Debate the strongest villain candidate.",
                                    reasonToSpeak: "Convince a skeptical friend.",
                                    userRole: "Marvel fan",
                                },
                                teacherMove: {
                                    intent: "Ask who is a serious candidate and why.",
                                    responseShape: "One reaction followed by one question.",
                                    doNotRevealTarget: true,
                                },
                                successCriteria: {
                                    semanticGoal: "Describe a serious candidate.",
                                    preferredExpression: "contender",
                                    meaningMustFit: true,
                                    contextMustFit: true,
                                    exactSentenceRequired: false,
                                    pronunciationCannotBeJudgedFromTranscriptOnly: true,
                                },
                                supportLadder: ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"],
                                branchPolicy: {
                                    achieved: "ADVANCE_BEAT",
                                    meaningCorrectTargetMissing: "RAISE_SUPPORT",
                                    partial: "DEEPEN",
                                    stuck: "RAISE_SUPPORT_OR_REPLAN",
                                    offTopic: "REANCHOR",
                                    asrUncertain: "CLARIFY_WITHOUT_PENALTY",
                                },
                                limits: { maxTurns: 4, maxExplicitRetries: 1 },
                            }],
                        }, {
                            sceneId: "scene-two",
                            title: "Surprise reaction",
                            abstract: "React to a friend's unexpected news naturally during a coffee catch-up.",
                            setting: "Two friends catch up after work.",
                            background: "One friend shares unexpected news.",
                            roles: ["Tutor: friend", "User: listener"],
                            goal: "React to unexpected news naturally.",
                            starterLine: "You will not believe what happened today.",
                            rationale: "Matches the surprise Expression and retrieval group.",
                            tone: "friendly",
                            sensoryDetail: "Coffee cups clink on the table.",
                            targetWordIds: ["word-blue"],
                            targetWords: ["out of the blue"],
                            suggestedSlang: ["no way"],
                            teachingBeats: [{
                                beatId: "blue-elicit",
                                type: "ELICIT",
                                targetIds: ["word-blue"],
                                communicativeNeed: {
                                    situation: "React to unexpected personal news.",
                                    reasonToSpeak: "Show why the timing was surprising.",
                                    userRole: "Friend hearing the news",
                                },
                                teacherMove: {
                                    intent: "Ask how surprising the news felt.",
                                    responseShape: "One reaction followed by one question.",
                                    doNotRevealTarget: true,
                                },
                                successCriteria: {
                                    semanticGoal: "Describe something happening unexpectedly.",
                                    preferredExpression: "out of the blue",
                                    meaningMustFit: true,
                                    contextMustFit: true,
                                    exactSentenceRequired: false,
                                    pronunciationCannotBeJudgedFromTranscriptOnly: true,
                                },
                                supportLadder: ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"],
                                branchPolicy: {
                                    achieved: "ADVANCE_BEAT",
                                    meaningCorrectTargetMissing: "RAISE_SUPPORT",
                                    partial: "DEEPEN",
                                    stuck: "RAISE_SUPPORT_OR_REPLAN",
                                    offTopic: "REANCHOR",
                                    asrUncertain: "CLARIFY_WITHOUT_PENALTY",
                                },
                                limits: { maxTurns: 4, maxExplicitRetries: 1 },
                            }],
                        }],
                    }),
                };
            },
        },
    };
}

test("builds group queries from deterministic word anchors rather than trusting model text", async () => {
    const openaiClient = makeOpenAIClient();
    const service = createRolePlayPlanningService({ openaiClient });
    const result = await service.createRetrievalPlan({
        dueWords,
        semantic: { profile: { topics: ["Marvel"] } },
        currentUserFocus: "Doctor Doom",
    });

    assert.equal(result.groups.length, 2);
    assert.deepEqual(result.groups[0].targetWords, ["contender"]);
    assert.match(result.groups[0].retrievalQuery, /Target phrases: contender/);
    assert.match(result.groups[0].retrievalQuery, /Current user focus: Doctor Doom/);
    assert.doesNotMatch(result.groups[0].retrievalQuery, /intentionally ignored/);
    assert.ok(result.groups.every((group) => group.retrievalQuery.length <= MAX_GROUP_RETRIEVAL_QUERY_CHARS));
});

test("runs retrieval planning, one Top-3 search per group, then scene planning", async () => {
    const openaiClient = makeOpenAIClient();
    const service = createRolePlayPlanningService({ openaiClient });
    const searches = [];
    const memoryService = {
        async loadBootstrap(userId) {
            assert.equal(userId, "learner@example.com");
            return { memory: { semantic: { profile: { topics: ["Marvel"] } } } };
        },
        async searchSemantic(input) {
            searches.push(input);
            return { results: [{ text: `memory for ${input.query.slice(0, 20)}`, metadata: {} }] };
        },
    };
    const result = await service.buildReviewPlan({
        userId: "learner@example.com",
        dueWords,
        currentUserFocus: "Doctor Doom",
        memoryService,
    });

    assert.equal(openaiClient.requests.length, 2);
    assert.equal(searches.length, 2);
    assert.ok(searches.every((search) => search.k === 3));
    assert.equal(result.rolePlayPlan.scenes[0].sceneId, "scene-one");
    assert.equal(
        result.rolePlayPlan.scenes[0].abstract,
        "Debate a friend after a premiere and name a credible villain contender.",
    );
    assert.equal(result.rolePlayPlan.scenes[0].teachingBeats[0].beatId, "contender-elicit");
    assert.equal(result.rolePlayPlan.scenes[1].teachingBeats[0].beatId, "blue-elicit");
    assert.equal(result.memoryPatch.groupSemanticHints.length, 2);
    assert.match(openaiClient.requests[1].input, /memory for Task: vocabulary_sc/);
    assert.match(openaiClient.requests[1].input, /maximum 24 words and 150 characters/);
});

test("bounds Scene abstracts for the three-line Progress summary", () => {
    const longAbstract = Array.from({ length: 40 }, (_, index) => `word${index + 1}`).join(" ");
    const plan = {
        mode: "role-play",
        scenes: [{
            sceneId: "scene-long-abstract",
            title: "Long abstract",
            abstract: longAbstract,
            targetWordIds: ["word-contender"],
            targetWords: ["contender"],
            teachingBeats: [{
                beatId: "contender-elicit",
                type: "ELICIT",
                targetIds: ["word-contender"],
                communicativeNeed: {
                    situation: "Debate a villain candidate.",
                    reasonToSpeak: "Convince a friend.",
                    userRole: "Marvel fan",
                },
                teacherMove: {
                    intent: "Ask for the strongest candidate.",
                    responseShape: "One answer and one reason.",
                    doNotRevealTarget: true,
                },
                successCriteria: {
                    semanticGoal: "Describe a serious candidate.",
                    preferredExpression: "contender",
                    meaningMustFit: true,
                    contextMustFit: true,
                    exactSentenceRequired: false,
                    pronunciationCannotBeJudgedFromTranscriptOnly: true,
                },
                supportLadder: ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"],
                branchPolicy: {
                    achieved: "ADVANCE_BEAT",
                    meaningCorrectTargetMissing: "RAISE_SUPPORT",
                    partial: "DEEPEN",
                    stuck: "RAISE_SUPPORT_OR_REPLAN",
                    offTopic: "REANCHOR",
                    asrUncertain: "CLARIFY_WITHOUT_PENALTY",
                },
                limits: { maxTurns: 4, maxExplicitRetries: 1 },
            }],
        }],
    };

    const validated = validateScenePlanTeachingBeats(plan, [dueWords[0]]);
    const abstract = validated.scenes[0].abstract;

    assert.ok(abstract.split(/\s+/).length <= MAX_SCENE_ABSTRACT_WORDS);
    assert.ok(abstract.length <= MAX_SCENE_ABSTRACT_CHARS);
    assert.match(abstract, /…$/);
});
