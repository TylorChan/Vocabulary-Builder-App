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
                    suggestedSlang: { type: "array", items: { type: "string" } }
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
                ]
            }
        }
    },
    required: ["mode", "scenes"]
};