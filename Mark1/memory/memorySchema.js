export const memorySchema = {
    shortTerm: {
        sceneId: null,
        remainingWords: [],
        currentWordId: null,
        attemptCount: 0,
        lastHint: null,
        usedWordsInScene: []
    },

    // longer-term memories based on 
    // https://docs.langchain.com/oss/python/concepts/memory#long-term-memory
    semantic: {
        interests: [],
        videoTopics: [],
        preferences: [],
        interestSignals: [],
        videoTopicSignals: [],
        preferenceSignals: [],
        profile: {
            coreInterests: [],
            coreVideoTopics: [],
            corePreferences: [],
            agentTone: {
                raw: "",
                sanitized: "",
                updatedAt: null,
                source: "user_settings",
            },
            agentVoice: {
                tone: {
                    raw: "",
                    sanitized: "",
                    updatedAt: null,
                    source: "user_settings",
                },
                soundProfile: "shimmer",
                testingText: {
                    raw: "",
                    sanitized: "",
                    updatedAt: null,
                    source: "user_settings",
                },
                updatedAt: null,
            },
            agentBehavior: {
                correctionLevel: "default",
                updatedAt: null,
                source: "user_settings",
            },
            correctionLevel: "default",
            summary: "",
            updatedAt: null,
            version: 1,
        },
        conversationSummaries: [],
        level: "B1",
        style: "short"
    },
    episodic: {
        lastScenes: [],
        difficultWords: [],
        typicalMistakes: [],
        slangSuggestions: [] // [{ sceneId, phrase, example }]
    },
    procedural: {
        rules: []
    }
};
