export const EXPRESSION_CONTEXT_SCHEMA_VERSION = 1;
export const EXPRESSION_CONTEXT_PROMPT_VERSION = "expression-context-v1";

export const EXPRESSION_MATCH_METHODS = Object.freeze({
    EXACT: "EXACT",
    NORMALIZED: "NORMALIZED",
    LEMMA: "LEMMA",
});

export const EXPRESSION_CONTEXT_LIMITS = Object.freeze({
    expression: 160,
    evidenceMessages: 6,
    evidenceMessageText: 1600,
    sourceExcerpt: 600,
    senseDefinition: 140,
    communicativeFunction: 120,
    usagePattern: 80,
    situationSummary: 180,
});

const ALLOWED_ROLES = new Set(["user", "assistant"]);
const ALLOWED_MATCH_METHODS = new Set(Object.values(EXPRESSION_MATCH_METHODS));
const IRREGULAR_TOKEN_LEMMAS = new Map([
    ["am", "be"],
    ["are", "be"],
    ["been", "be"],
    ["being", "be"],
    ["caught", "catch"],
    ["came", "come"],
    ["come", "come"],
    ["did", "do"],
    ["done", "do"],
    ["does", "do"],
    ["got", "get"],
    ["gotten", "get"],
    ["had", "have"],
    ["has", "have"],
    ["having", "have"],
    ["is", "be"],
    ["made", "make"],
    ["said", "say"],
    ["was", "be"],
    ["were", "be"],
    ["went", "go"],
    ["gone", "go"],
]);
const ALLOWED_UNGROUNDED_LABELS = new Set([
    "a",
    "an",
    "during",
    "english",
    "in",
    "teacher agent",
    "the",
    "user",
]);

function cleanText(value, field, maxChars, { required = true } = {}) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (required && !text) {
        throw new Error(`${field} is required`);
    }
    if (maxChars && text.length > maxChars) {
        throw new Error(`${field} must be ${maxChars} characters or fewer`);
    }
    return text;
}

function cleanId(value, field) {
    return cleanText(value, field, 200);
}

function normalizeToken(value) {
    return String(value || "")
        .normalize("NFKC")
        .replace(/[’]/g, "'")
        .toLocaleLowerCase("en-US");
}

function tokenizeWithOffsets(value) {
    const text = String(value || "");
    const tokens = [];
    const regex = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.push({
            value: normalizeToken(match[0]),
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return tokens;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRawExactMatch(text, expression) {
    const parts = String(expression || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;

    const phrase = parts.map(escapeRegExp).join("\\s+");
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${phrase})(?=$|[^\\p{L}\\p{N}])`, "iu");
    const match = regex.exec(String(text || ""));
    if (!match) return null;

    const start = match.index + match[1].length;
    return {
        start,
        end: start + match[2].length,
        matchMethod: EXPRESSION_MATCH_METHODS.EXACT,
    };
}

function simpleTokenForms(value) {
    const token = normalizeToken(value).replace(/'(?:s)?$/u, "");
    const forms = new Set([token]);
    const irregularLemma = IRREGULAR_TOKEN_LEMMAS.get(token);
    if (irregularLemma) forms.add(irregularLemma);
    if (token.length <= 3) return forms;

    if (token.endsWith("ies") && token.length > 4) {
        forms.add(`${token.slice(0, -3)}y`);
    }
    if (token.endsWith("es") && token.length > 4) {
        forms.add(token.slice(0, -2));
    }
    if (token.endsWith("s") && !token.endsWith("ss") && token.length > 4) {
        forms.add(token.slice(0, -1));
    }
    if (token.endsWith("ied") && token.length > 4) {
        forms.add(`${token.slice(0, -3)}y`);
    }
    if (token.endsWith("ed") && token.length > 4) {
        const stem = token.slice(0, -2);
        forms.add(stem);
        forms.add(`${stem}e`);
    }
    if (token.endsWith("ing") && token.length > 5) {
        const stem = token.slice(0, -3);
        forms.add(stem);
        forms.add(`${stem}e`);
    }
    return forms;
}

function tokenFormsIntersect(left, right) {
    const leftForms = simpleTokenForms(left);
    const rightForms = simpleTokenForms(right);
    return [...leftForms].some((form) => rightForms.has(form));
}

export function findExpressionMatch(text, expression) {
    const exact = findRawExactMatch(text, expression);
    if (exact) return exact;

    const messageTokens = tokenizeWithOffsets(text);
    const expressionTokens = tokenizeWithOffsets(expression);
    if (!messageTokens.length || !expressionTokens.length) return null;

    for (let startIndex = 0; startIndex <= messageTokens.length - expressionTokens.length; startIndex += 1) {
        const slice = messageTokens.slice(startIndex, startIndex + expressionTokens.length);
        const normalizedMatch = slice.every((token, index) => (
            token.value === expressionTokens[index].value
        ));
        if (normalizedMatch) {
            return {
                start: slice[0].start,
                end: slice.at(-1).end,
                matchMethod: EXPRESSION_MATCH_METHODS.NORMALIZED,
            };
        }
    }

    for (let startIndex = 0; startIndex <= messageTokens.length - expressionTokens.length; startIndex += 1) {
        const slice = messageTokens.slice(startIndex, startIndex + expressionTokens.length);
        const lemmaMatch = slice.every((token, index) => (
            tokenFormsIntersect(token.value, expressionTokens[index].value)
        ));
        if (lemmaMatch) {
            return {
                start: slice[0].start,
                end: slice.at(-1).end,
                matchMethod: EXPRESSION_MATCH_METHODS.LEMMA,
            };
        }
    }

    return null;
}

function extractSourceExcerpt(text, start, end) {
    const source = String(text || "");
    const maxChars = EXPRESSION_CONTEXT_LIMITS.sourceExcerpt;
    const leftBoundary = Math.max(
        source.lastIndexOf(".", Math.max(0, start - 1)),
        source.lastIndexOf("!", Math.max(0, start - 1)),
        source.lastIndexOf("?", Math.max(0, start - 1)),
        source.lastIndexOf("。", Math.max(0, start - 1)),
        source.lastIndexOf("！", Math.max(0, start - 1)),
        source.lastIndexOf("？", Math.max(0, start - 1)),
        source.lastIndexOf("\n", Math.max(0, start - 1)),
    );
    const sentenceStart = leftBoundary >= 0 ? leftBoundary + 1 : 0;
    const rightCandidates = [".", "!", "?", "。", "！", "？", "\n"]
        .map((separator) => source.indexOf(separator, end))
        .filter((index) => index >= 0);
    const sentenceEnd = rightCandidates.length ? Math.min(...rightCandidates) + 1 : source.length;
    let excerpt = source.slice(sentenceStart, sentenceEnd).trim();

    if (excerpt.length > maxChars) {
        const localStart = Math.max(0, start - Math.floor(maxChars / 2));
        const localEnd = Math.min(source.length, Math.max(end, localStart + maxChars));
        excerpt = source.slice(localStart, localEnd).trim();
    }
    return excerpt;
}

function normalizeTranscriptMessages(transcriptItems = []) {
    return (Array.isArray(transcriptItems) ? transcriptItems : [])
        .filter((item) => (
            item?.type === "MESSAGE"
            && ALLOWED_ROLES.has(item?.role)
            && !item?.isHidden
            && item?.status !== "IN_PROGRESS"
        ))
        .map((item) => ({
            messageId: String(item.itemId || "").trim(),
            role: item.role,
            text: String(item.title || "").trim(),
        }))
        .filter((item) => item.messageId && item.text);
}

export function findLatestCompletedUserMessageId(transcriptItems = []) {
    return normalizeTranscriptMessages(transcriptItems)
        .filter((message) => message.role === "user")
        .at(-1)?.messageId ?? null;
}

export function findLatestUserMessageId(transcriptItems = []) {
    return (Array.isArray(transcriptItems) ? transcriptItems : [])
        .filter((item) => (
            item?.type === "MESSAGE"
            && item?.role === "user"
            && !item?.isHidden
            && String(item?.itemId || "").trim()
        ))
        .at(-1)?.itemId ?? null;
}

export function resolveExpressionSource({
    expression,
    transcriptItems = [],
    requestMessageId = null,
}) {
    const target = cleanText(
        expression,
        "expression",
        EXPRESSION_CONTEXT_LIMITS.expression,
    );
    const messages = normalizeTranscriptMessages(transcriptItems);
    const resolvedRequestId = requestMessageId || findLatestCompletedUserMessageId(transcriptItems);
    const requestIndex = resolvedRequestId
        ? messages.findIndex((message) => message.messageId === resolvedRequestId)
        : messages.length;
    const sourceLimit = requestIndex >= 0 ? requestIndex : messages.length;
    const eligibleMessages = messages.slice(0, sourceLimit);

    let anchor = null;
    let anchorIndex = -1;
    for (let index = eligibleMessages.length - 1; index >= 0; index -= 1) {
        const match = findExpressionMatch(eligibleMessages[index].text, target);
        if (!match) continue;
        anchor = {
            ...eligibleMessages[index],
            ...match,
        };
        anchorIndex = index;
        break;
    }

    if (!anchor) {
        return {
            ok: false,
            reason: "expression_not_in_prior_conversation",
            requestMessageId: resolvedRequestId,
        };
    }

    const evidenceStart = Math.max(0, anchorIndex - 3);
    const evidenceEnd = Math.min(eligibleMessages.length, anchorIndex + 3);
    const evidenceMessages = eligibleMessages.slice(evidenceStart, evidenceEnd);

    return {
        ok: true,
        requestMessageId: resolvedRequestId,
        sourceMessageId: anchor.messageId,
        sourceSpeaker: anchor.role,
        matchedExpression: anchor.text.slice(anchor.start, anchor.end).trim(),
        sourceExcerpt: extractSourceExcerpt(anchor.text, anchor.start, anchor.end),
        evidenceMessageIds: evidenceMessages.map((message) => message.messageId),
        matchMethod: anchor.matchMethod,
    };
}

export function buildExpressionEnrichmentRequest({
    card,
    transcriptItems = [],
    sessionId,
    userId,
}) {
    const cardData = card?.data ?? card ?? {};
    const expression = cleanText(
        cardData.expression,
        "expression",
        EXPRESSION_CONTEXT_LIMITS.expression,
    );
    const sourceResolution = cardData.sourceResolution?.ok
        ? cardData.sourceResolution
        : resolveExpressionSource({
            expression,
            transcriptItems,
            requestMessageId: cardData.requestMessageId,
        });

    if (!sourceResolution?.ok) {
        const error = new Error("Expression was not found in the conversation before the save request.");
        error.code = sourceResolution?.reason || "expression_source_not_found";
        throw error;
    }

    const messagesById = new Map(
        normalizeTranscriptMessages(transcriptItems)
            .map((message) => [message.messageId, message]),
    );
    const evidenceMessages = sourceResolution.evidenceMessageIds
        .map((messageId) => messagesById.get(messageId))
        .filter(Boolean)
        .slice(0, EXPRESSION_CONTEXT_LIMITS.evidenceMessages);

    return validateExpressionEnrichmentRequest({
        expression,
        sessionId,
        userId,
        discoveryMode: "USER_EXPLICIT_SAVE",
        source: {
            messageId: sourceResolution.sourceMessageId,
            speaker: sourceResolution.sourceSpeaker,
            excerpt: sourceResolution.sourceExcerpt,
            matchMethod: sourceResolution.matchMethod,
        },
        evidenceMessages,
    });
}

export function validateExpressionEnrichmentRequest(input = {}) {
    const expression = cleanText(
        input.expression,
        "expression",
        EXPRESSION_CONTEXT_LIMITS.expression,
    );
    const sessionId = cleanId(input.sessionId, "sessionId");
    const userId = cleanId(input.userId, "userId");
    const source = {
        messageId: cleanId(input?.source?.messageId, "source.messageId"),
        speaker: cleanText(input?.source?.speaker, "source.speaker", 20),
        excerpt: cleanText(
            input?.source?.excerpt,
            "source.excerpt",
            EXPRESSION_CONTEXT_LIMITS.sourceExcerpt,
        ),
        matchMethod: cleanText(input?.source?.matchMethod, "source.matchMethod", 20),
    };
    if (!ALLOWED_ROLES.has(source.speaker)) {
        throw new Error("source.speaker must be user or assistant");
    }
    if (!ALLOWED_MATCH_METHODS.has(source.matchMethod)) {
        throw new Error("source.matchMethod is invalid");
    }

    const evidenceMessages = (Array.isArray(input.evidenceMessages) ? input.evidenceMessages : [])
        .slice(0, EXPRESSION_CONTEXT_LIMITS.evidenceMessages)
        .map((message, index) => ({
            messageId: cleanId(message?.messageId, `evidenceMessages[${index}].messageId`),
            role: cleanText(message?.role, `evidenceMessages[${index}].role`, 20),
            text: cleanText(
                message?.text,
                `evidenceMessages[${index}].text`,
                EXPRESSION_CONTEXT_LIMITS.evidenceMessageText,
            ),
        }));
    if (!evidenceMessages.length) {
        throw new Error("evidenceMessages is required");
    }
    if (evidenceMessages.some((message) => !ALLOWED_ROLES.has(message.role))) {
        throw new Error("evidence message role must be user or assistant");
    }

    const sourceMessage = evidenceMessages.find((message) => message.messageId === source.messageId);
    if (!sourceMessage) {
        throw new Error("source.messageId must be included in evidenceMessages");
    }
    if (sourceMessage.role !== source.speaker) {
        throw new Error("source speaker does not match the evidence message");
    }
    if (!sourceMessage.text.includes(source.excerpt)) {
        throw new Error("source excerpt must be verbatim evidence text");
    }
    if (!findExpressionMatch(source.excerpt, expression)) {
        throw new Error("source excerpt must contain the Expression");
    }

    return {
        expression,
        sessionId,
        userId,
        discoveryMode: cleanText(input.discoveryMode || "USER_EXPLICIT_SAVE", "discoveryMode", 60),
        source,
        evidenceMessages,
    };
}

function findUnsupportedNamedEntities(summary, evidenceMessages) {
    const evidenceText = evidenceMessages.map((message) => message.text).join(" ").toLocaleLowerCase("en-US");
    const entityMatches = String(summary || "").match(/\b[A-Z][\p{L}\p{N}'’-]*(?:\s+[A-Z][\p{L}\p{N}'’-]*)*/gu) || [];
    return entityMatches.filter((entity) => {
        const normalized = entity.toLocaleLowerCase("en-US");
        return !ALLOWED_UNGROUNDED_LABELS.has(normalized) && !evidenceText.includes(normalized);
    });
}

export function normalizeExpressionExtraction({
    payload,
    request,
    extractorModel,
    validatedAt = new Date().toISOString(),
}) {
    const validatedRequest = validateExpressionEnrichmentRequest(request);
    const status = String(payload?.status || "").trim();
    if (status === "insufficient_evidence") {
        const error = new Error(String(payload?.reason || "The conversation did not provide enough evidence."));
        error.code = "insufficient_evidence";
        throw error;
    }
    if (status !== "ok") {
        throw new Error("Expression extraction returned an invalid status");
    }

    const meaning = {
        senseDefinition: cleanText(
            payload.senseDefinition,
            "senseDefinition",
            EXPRESSION_CONTEXT_LIMITS.senseDefinition,
        ),
        communicativeFunction: cleanText(
            payload.communicativeFunction,
            "communicativeFunction",
            EXPRESSION_CONTEXT_LIMITS.communicativeFunction,
        ),
        usagePattern: cleanText(
            payload.usagePattern,
            "usagePattern",
            EXPRESSION_CONTEXT_LIMITS.usagePattern,
        ),
    };
    const situationSummary = cleanText(
        payload.situationSummary,
        "situationSummary",
        EXPRESSION_CONTEXT_LIMITS.situationSummary,
    );
    if (!findExpressionMatch(meaning.usagePattern, validatedRequest.expression)
        && !/(?:\{expression\}|<expression>|\[expression\])/iu.test(meaning.usagePattern)) {
        throw new Error("usagePattern must contain the Expression or an expression placeholder");
    }

    const unsupportedEntities = findUnsupportedNamedEntities(
        situationSummary,
        validatedRequest.evidenceMessages,
    );
    if (unsupportedEntities.length) {
        throw new Error(`situationSummary contains unsupported entities: ${unsupportedEntities.join(", ")}`);
    }

    const learningContext = {
        schemaVersion: EXPRESSION_CONTEXT_SCHEMA_VERSION,
        discoveryMode: validatedRequest.discoveryMode,
        meaning,
        origin: {
            situationSummary,
            sourceType: "VOICE_CONVERSATION",
            sourceSpeaker: validatedRequest.source.speaker,
            sessionId: validatedRequest.sessionId,
            sourceMessageId: validatedRequest.source.messageId,
            sourceExcerpt: validatedRequest.source.excerpt,
            evidenceMessageIds: validatedRequest.evidenceMessages.map((message) => message.messageId),
        },
        provenance: {
            matchMethod: validatedRequest.source.matchMethod,
            extractorModel: cleanText(extractorModel, "extractorModel", 100),
            extractorPromptVersion: EXPRESSION_CONTEXT_PROMPT_VERSION,
            validated: true,
            validatedAt: cleanText(validatedAt, "validatedAt", 80),
        },
    };

    return {
        definition: meaning.senseDefinition,
        usage: toUseItWhenText(meaning.communicativeFunction),
        surroundingText: situationSummary,
        learningContext,
    };
}

export function toUseItWhenText(communicativeFunction) {
    const value = cleanText(
        communicativeFunction,
        "communicativeFunction",
        EXPRESSION_CONTEXT_LIMITS.communicativeFunction,
    ).replace(/[.!?]+$/u, "");
    if (/^use it\b/iu.test(value)) return `${value}.`;
    return `Use it to ${value.charAt(0).toLocaleLowerCase("en-US")}${value.slice(1)}.`;
}

export function projectExpressionContextForScene(learningContext) {
    const meaning = learningContext?.meaning || {};
    const situationSummary = learningContext?.origin?.situationSummary;
    if (!meaning.senseDefinition || !meaning.communicativeFunction
        || !meaning.usagePattern || !situationSummary) {
        return null;
    }
    return {
        senseDefinition: cleanText(
            meaning.senseDefinition,
            "senseDefinition",
            EXPRESSION_CONTEXT_LIMITS.senseDefinition,
        ),
        communicativeFunction: cleanText(
            meaning.communicativeFunction,
            "communicativeFunction",
            EXPRESSION_CONTEXT_LIMITS.communicativeFunction,
        ),
        usagePattern: cleanText(
            meaning.usagePattern,
            "usagePattern",
            EXPRESSION_CONTEXT_LIMITS.usagePattern,
        ),
        situationSummary: cleanText(
            situationSummary,
            "situationSummary",
            EXPRESSION_CONTEXT_LIMITS.situationSummary,
        ),
    };
}
