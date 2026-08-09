const teachingBeatSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        beatId: { type: "string" },
        type: { type: "string", enum: ["ELICIT", "DEEPEN", "REPAIR", "TRANSFER", "WRAP"] },
        targetIds: { type: "array", items: { type: "string" } },
        communicativeNeed: {
            type: "object",
            additionalProperties: false,
            properties: {
                situation: { type: "string" },
                reasonToSpeak: { type: "string" },
                userRole: { type: "string" },
            },
            required: ["situation", "reasonToSpeak", "userRole"],
        },
        teacherMove: {
            type: "object",
            additionalProperties: false,
            properties: {
                intent: { type: "string" },
                responseShape: { type: "string" },
                doNotRevealTarget: { type: "boolean" },
            },
            required: ["intent", "responseShape", "doNotRevealTarget"],
        },
        successCriteria: {
            type: "object",
            additionalProperties: false,
            properties: {
                semanticGoal: { type: "string" },
                preferredExpression: { type: "string" },
                meaningMustFit: { type: "boolean" },
                contextMustFit: { type: "boolean" },
                exactSentenceRequired: { type: "boolean" },
                pronunciationCannotBeJudgedFromTranscriptOnly: { type: "boolean" },
            },
            required: [
                "semanticGoal",
                "preferredExpression",
                "meaningMustFit",
                "contextMustFit",
                "exactSentenceRequired",
                "pronunciationCannotBeJudgedFromTranscriptOnly",
            ],
        },
        supportLadder: {
            type: "array",
            items: { type: "string", enum: ["CONTEXT_CUE", "EXPRESSION_HINT", "SHORT_RECAST"] },
        },
        branchPolicy: {
            type: "object",
            additionalProperties: false,
            properties: {
                achieved: { type: "string", enum: ["ADVANCE_BEAT"] },
                meaningCorrectTargetMissing: { type: "string", enum: ["RAISE_SUPPORT"] },
                partial: { type: "string", enum: ["DEEPEN"] },
                stuck: { type: "string", enum: ["RAISE_SUPPORT_OR_REPLAN"] },
                offTopic: { type: "string", enum: ["REANCHOR"] },
                asrUncertain: { type: "string", enum: ["CLARIFY_WITHOUT_PENALTY"] },
            },
            required: [
                "achieved",
                "meaningCorrectTargetMissing",
                "partial",
                "stuck",
                "offTopic",
                "asrUncertain",
            ],
        },
        limits: {
            type: "object",
            additionalProperties: false,
            properties: {
                maxTurns: { type: "integer" },
                maxExplicitRetries: { type: "integer" },
            },
            required: ["maxTurns", "maxExplicitRetries"],
        },
    },
    required: [
        "beatId",
        "type",
        "targetIds",
        "communicativeNeed",
        "teacherMove",
        "successCriteria",
        "supportLadder",
        "branchPolicy",
        "limits",
    ],
};

export const scenePlanSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        mode: { type: "string", enum: ["role-play"] },
        scenes: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    sceneId: { type: "string" },
                    title: { type: "string" },

                    // Rich scene context
                    setting: { type: "string" },        // 1–2 sentences: where/when
                    background: { type: "string" },     // why this scene is happening
                    roles: { type: "array", items: { type: "string" } },
                    goal: { type: "string" },           // user objective
                    starterLine: { type: "string" },    // teacher's first line
                    tone: { type: "string" },           // "casual", "urgent", etc.
                    sensoryDetail: { type: "string" },  // one vivid detail

                    rationale: { type: "string" },
                    targetWordIds: { type: "array", items: { type: "string" } },
                    targetWords: { type: "array", items: { type: "string" } },
                    suggestedSlang: { type: "array", items: { type: "string" } },
                    teachingBeats: { type: "array", items: teachingBeatSchema },
                },
                required: [
                    "sceneId",
                    "title",
                    "setting",
                    "background",
                    "roles",
                    "goal",
                    "starterLine",
                    "rationale",
                    "tone",
                    "sensoryDetail",
                    "targetWordIds",
                    "targetWords",
                    "suggestedSlang",
                    "teachingBeats",
                ]
            }
        }
    },
    required: ["mode", "scenes"]
};
