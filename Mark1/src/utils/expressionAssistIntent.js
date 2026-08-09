const EXPLICIT_EXPRESSION_REQUEST_PATTERNS = Object.freeze([
    /\bhow (?:do|can|could|would|should) i (?:say|express|describe|phrase)\b/iu,
    /\bwhat(?:'s| is) (?:(?:any|a|one|the|some|another|other|new|better|more|natural|useful|casual|formal|concise|common|spoken|english|idiomatic)\s+){0,5}(?:word|phrase|expression|idiom|slang)\b/iu,
    /\b(?:do|can|could|would) you (?:know|suggest|recommend|give me|think of) (?:(?:any|a|one|some|another|other|new|better|more|natural|useful|casual|formal|concise|common|spoken|english|idiomatic)\s+){0,5}(?:word|words|phrase|phrases|expression|expressions|idiom|idioms|slang)\b/iu,
    /\b(?:do|did|can|could|would) you have (?:(?:any|a|one|some|another|other|new|better|more|natural|useful|casual|formal|concise|common|spoken|english|idiomatic)\s+){0,5}(?:word|words|phrase|phrases|expression|expressions|idiom|idioms|slang)\b/iu,
    /\bdo i have (?:(?:any|a|one|some|saved|learned|previously learned)\s+){0,5}(?:word|words|phrase|phrases|expression|expressions|idiom|idioms)\b/iu,
    /\b(?:is|are) there (?:(?:any|a|one|some|another|other|new|better|more|natural|useful|casual|formal|concise|common|spoken|english|idiomatic)\s+){0,5}(?:word|words|phrase|phrases|expression|expressions|idiom|idioms|slang)\b/iu,
    /\b(?:which|what) (?:word|phrase|expression|idiom|slang) (?:can|could|would|should) (?:i|we) use\b/iu,
    /\bwhat (?:can|could|would|should) (?:i|we) (?:call|say|use) (?:this|that|it)\b/iu,
    /\bi (?:do not|don't|cannot|can't) know how to (?:say|express|describe|phrase)\b/iu,
    /怎么说|如何表达|有什么(?:单词|词组|短语|表达|俚语)(?:可以|能|适合)?/u,
]);

export const EXPRESSION_RETRIEVAL_SCOPES = Object.freeze({
    PREFER_EXISTING: "PREFER_EXISTING",
    EXISTING_ONLY: "EXISTING_ONLY",
});

const EXISTING_ONLY_REQUEST_PATTERNS = Object.freeze([
    /\b(?:from|in|inside|on)\s+(?:my\s+)?(?:vocabulary|word|expression|phrase)(?:\s+(?:bank|list))?\b/iu,
    /\bmy\s+(?:saved|learned|previously learned)\s+(?:word|words|phrase|phrases|expression|expressions|idiom|idioms)\b/iu,
    /\b(?:do|did)\s+i\s+have\s+(?:(?:any|a|one|some)\s+)?(?:saved|learned)\s+(?:word|words|phrase|phrases|expression|expressions|idiom|idioms)\b/iu,
    /\b(?:word|words|phrase|phrases|expression|expressions|idiom|idioms)\s+(?:that|which)?\s*i(?:'ve| have)?\s+(?:saved|learned|added)\b/iu,
    /(?:从|在|查看|检查)(?:我(?:的)?)(?:单词本|词库|表达库|已学表达|已保存表达)/u,
]);

function normalizeExpressionIntent(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(/(?:\s*[,;:]\s*)?\b(?:i\s+mean|uh+|um+)\b\s*[,;:]?/giu, " ")
        .replace(/\s*[,;:]\s*\byou\s+know\b\s*[,;:]?\s*/giu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isExplicitExpressionRequest(value) {
    const text = normalizeExpressionIntent(value);
    return Boolean(text) && EXPLICIT_EXPRESSION_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectExpressionRetrievalScope(value) {
    const text = normalizeExpressionIntent(value);
    return text && EXISTING_ONLY_REQUEST_PATTERNS.some((pattern) => pattern.test(text))
        ? EXPRESSION_RETRIEVAL_SCOPES.EXISTING_ONLY
        : EXPRESSION_RETRIEVAL_SCOPES.PREFER_EXISTING;
}
