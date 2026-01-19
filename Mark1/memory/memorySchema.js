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