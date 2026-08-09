export const EXPRESSION_CARD_TYPE = "EXPRESSION_CARD";

export const EXPRESSION_CARD_PRIMARY_ACTIONS = Object.freeze({
    SAVE: "SAVE",
    LEARN_TODAY: "LEARN_TODAY",
});

export const EXPRESSION_SAVE_STATES = Object.freeze({
    PROPOSED: "proposed",
    DEFERRED: "deferred",
    SAVING: "saving",
    SAVED: "saved",
    ERROR: "error",
});

export const EXPRESSION_SAVE_ACTIONS = Object.freeze({
    DEFER: "DEFER",
    SAVE_START: "SAVE_START",
    SAVE_SUCCESS: "SAVE_SUCCESS",
    SAVE_ERROR: "SAVE_ERROR",
});

export const EXPRESSION_FIELD_LIMITS = Object.freeze({
    expression: 160,
    definition: 260,
    usage: 260,
    sourceText: 600,
});

const VALID_STATES = new Set(Object.values(EXPRESSION_SAVE_STATES));
const VALID_PRIMARY_ACTIONS = new Set(Object.values(EXPRESSION_CARD_PRIMARY_ACTIONS));
const SUBMITTABLE_STATES = new Set([
    EXPRESSION_SAVE_STATES.PROPOSED,
    EXPRESSION_SAVE_STATES.DEFERRED,
    EXPRESSION_SAVE_STATES.ERROR,
]);

function cleanText(value, field, { required = true } = {}) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (required && !text) {
        throw new Error(`${field} is required`);
    }

    const limit = EXPRESSION_FIELD_LIMITS[field];
    if (limit && text.length > limit) {
        throw new Error(`${field} must be ${limit} characters or fewer`);
    }
    return text;
}

export function normalizeExpressionProposal(input = {}) {
    return {
        expression: cleanText(input.expression, "expression"),
        definition: cleanText(input.definition, "definition"),
        usage: cleanText(input.usage, "usage"),
        sourceText: cleanText(input.sourceText, "sourceText", {required: false}),
    };
}

export function createExpressionCardData(proposal, metadata = {}) {
    const primaryAction = VALID_PRIMARY_ACTIONS.has(metadata.primaryAction)
        ? metadata.primaryAction
        : EXPRESSION_CARD_PRIMARY_ACTIONS.SAVE;
    const savedVocabularyId = metadata.savedVocabularyId
        ? String(metadata.savedVocabularyId)
        : null;
    if (primaryAction === EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY && !savedVocabularyId) {
        throw new Error("Learn Today cards require an existing vocabulary id");
    }

    return {
        ...normalizeExpressionProposal(proposal),
        primaryAction,
        discoveryMode: String(metadata.discoveryMode || "USER_EXPLICIT_SAVE"),
        assistRequestId: metadata.assistRequestId
            ? String(metadata.assistRequestId)
            : null,
        requestMessageId: metadata.requestMessageId
            ? String(metadata.requestMessageId)
            : null,
        sourceResolution: metadata.sourceResolution?.ok
            ? {...metadata.sourceResolution}
            : null,
        learningContext: metadata.learningContext && typeof metadata.learningContext === "object"
            ? metadata.learningContext
            : null,
        saveState: EXPRESSION_SAVE_STATES.PROPOSED,
        savedVocabularyId,
        errorMessage: "",
    };
}

export function normalizeExpressionCardItem(item) {
    if (item?.type !== EXPRESSION_CARD_TYPE) return item;

    const rawData = item?.data ?? {};
    const rawState = VALID_STATES.has(rawData.saveState)
        ? rawData.saveState
        : EXPRESSION_SAVE_STATES.PROPOSED;
    const interruptedSave = rawState === EXPRESSION_SAVE_STATES.SAVING;
    const primaryAction = VALID_PRIMARY_ACTIONS.has(rawData.primaryAction)
        ? rawData.primaryAction
        : EXPRESSION_CARD_PRIMARY_ACTIONS.SAVE;
    const savedVocabularyId = rawData.savedVocabularyId
        ? String(rawData.savedVocabularyId)
        : null;
    if (primaryAction === EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY && !savedVocabularyId) {
        throw new Error("Learn Today cards require an existing vocabulary id");
    }

    return {
        ...item,
        title: cleanText(rawData.expression || item.title, "expression"),
        data: {
            ...rawData,
            primaryAction,
            expression: cleanText(rawData.expression || item.title, "expression"),
            definition: cleanText(rawData.definition, "definition"),
            usage: cleanText(rawData.usage, "usage"),
            sourceText: cleanText(rawData.sourceText, "sourceText", {required: false}),
            requestMessageId: rawData.requestMessageId
                ? String(rawData.requestMessageId)
                : null,
            sourceResolution: rawData.sourceResolution?.ok
                ? {...rawData.sourceResolution}
                : null,
            discoveryMode: String(rawData.discoveryMode || "USER_EXPLICIT_SAVE"),
            assistRequestId: rawData.assistRequestId
                ? String(rawData.assistRequestId)
                : null,
            learningContext: rawData.learningContext && typeof rawData.learningContext === "object"
                ? rawData.learningContext
                : null,
            saveState: interruptedSave ? EXPRESSION_SAVE_STATES.ERROR : rawState,
            savedVocabularyId,
            errorMessage: interruptedSave
                ? "The previous card action was interrupted. Try again."
                : String(rawData.errorMessage || ""),
        },
    };
}

export function normalizeExpressionCardItems(items = []) {
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
        if (item?.type !== EXPRESSION_CARD_TYPE) return [item];

        try {
            return [normalizeExpressionCardItem(item)];
        } catch (error) {
            console.warn("Skipping an invalid saved Expression card:", error);
            return [];
        }
    });
}

export function canSubmitExpressionCard(item) {
    return item?.type === EXPRESSION_CARD_TYPE
        && SUBMITTABLE_STATES.has(item?.data?.saveState);
}

export function createExpressionSaveSubmissionLock() {
    const pendingItemIds = new Set();

    return {
        acquire(itemId) {
            const key = String(itemId ?? "").trim();
            if (!key || pendingItemIds.has(key)) return false;
            pendingItemIds.add(key);
            return true;
        },
        release(itemId) {
            pendingItemIds.delete(String(itemId ?? "").trim());
        },
        has(itemId) {
            return pendingItemIds.has(String(itemId ?? "").trim());
        },
    };
}

export function transitionExpressionCardItem(item, action = {}) {
    if (item?.type !== EXPRESSION_CARD_TYPE) return item;

    const state = item?.data?.saveState;
    let patch = null;

    switch (action.type) {
        case EXPRESSION_SAVE_ACTIONS.DEFER:
            if (state === EXPRESSION_SAVE_STATES.PROPOSED) {
                patch = {
                    saveState: EXPRESSION_SAVE_STATES.DEFERRED,
                    errorMessage: "",
                };
            }
            break;
        case EXPRESSION_SAVE_ACTIONS.SAVE_START:
            if (SUBMITTABLE_STATES.has(state)) {
                patch = {
                    saveState: EXPRESSION_SAVE_STATES.SAVING,
                    errorMessage: "",
                };
            }
            break;
        case EXPRESSION_SAVE_ACTIONS.SAVE_SUCCESS:
            if (state === EXPRESSION_SAVE_STATES.SAVING) {
                patch = {
                    saveState: EXPRESSION_SAVE_STATES.SAVED,
                    savedVocabularyId: action.savedVocabularyId
                        ? String(action.savedVocabularyId)
                        : null,
                    errorMessage: "",
                    ...(action.enrichment ? {
                        definition: action.enrichment.definition,
                        usage: action.enrichment.usage,
                        sourceText: action.enrichment.surroundingText,
                        learningContext: action.enrichment.learningContext,
                    } : {}),
                };
            }
            break;
        case EXPRESSION_SAVE_ACTIONS.SAVE_ERROR:
            if (state === EXPRESSION_SAVE_STATES.SAVING) {
                patch = {
                    saveState: EXPRESSION_SAVE_STATES.ERROR,
                    errorMessage: String(action.errorMessage || "Unable to save. Try again."),
                };
            }
            break;
        default:
            break;
    }

    if (!patch) return item;
    return {
        ...item,
        data: {
            ...item.data,
            ...patch,
        },
    };
}

export function buildExpressionSavePayload(cardData, userId, enrichment = null) {
    const proposal = normalizeExpressionProposal(cardData);
    const definition = enrichment?.definition || proposal.definition;
    const usage = enrichment?.usage || proposal.usage;
    const surroundingText = enrichment?.surroundingText || proposal.sourceText;
    const learningContext = enrichment?.learningContext || cardData?.learningContext || null;
    return {
        text: proposal.expression,
        definition,
        example: "",
        exampleTrans: "",
        realLifeDef: usage,
        surroundingText,
        videoTitle: "Voice conversation",
        sourceVideoUrl: null,
        userId,
        ...(learningContext ? {
            learningContext,
        } : {}),
    };
}

export function getSavedVocabulary(result) {
    const entry = result?.saveVocabulary ?? null;
    if (!entry?.id) {
        throw new Error("Save completed without a vocabulary id");
    }
    return entry;
}

export function getBreadcrumbTargetItemId(item) {
    const targetItemId = item?.data?.targetItemId;
    return targetItemId ? String(targetItemId) : null;
}
