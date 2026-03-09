const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "if", "so", "to", "of", "in", "on", "for", "with",
    "is", "are", "was", "were", "be", "been", "being", "i", "you", "he", "she", "it", "we",
    "they", "me", "my", "your", "our", "their", "this", "that", "these", "those", "as", "at",
    "from", "by", "about", "what", "why", "how", "when", "where", "who", "which", "can", "could",
    "would", "should", "do", "does", "did", "have", "has", "had", "just", "really", "like", "yeah",
    "um", "uh", "okay", "ok", "well", "not", "no", "yes", "then", "than", "also"
]);

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function topK(counter, k) {
    return [...counter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([key]) => key);
}

export function extractConversationInsights(transcriptItems = []) {
    const messages = transcriptItems.filter((it) => it?.type === "MESSAGE");
    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.title || "");

    const termCounter = new Map();

    for (const line of userMessages) {
        const tokens = tokenize(line);
        tokens.forEach((token) => {
            termCounter.set(token, (termCounter.get(token) || 0) + 1);
        });
    }

    const topics = topK(termCounter, 6);
    const stylePreferences = [];

    const recentTurns = messages
        .slice(-8)
        .map((m) => `${m.role === "user" ? "User" : "Tutor"}: ${m.title}`)
        .join(" ")
        .slice(0, 900);

    const summary = recentTurns || "No substantial conversation yet.";

    return {
        topics,
        stylePreferences,
        summary,
        messageCount: messages.length,
        userMessageCount: userMessages.length,
    };
}
