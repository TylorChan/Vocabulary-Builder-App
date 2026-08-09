import { useCallback, useEffect, useMemo, useRef } from "react";
import { saveVocabulary, updateVocabularyDueDate } from "../utils/graphql";
import { formatLocalDateTime } from "../utils/dateTime";
import {
    buildExpressionEnrichmentRequest,
    findLatestUserMessageId,
    resolveExpressionSource,
} from "../utils/expressionContext";
import { enrichExpressionContext } from "../utils/expressionContextClient";
import { createExpressionSaveTool } from "../utils/expressionSaveTool";
import {
    buildExpressionSavePayload,
    canSubmitExpressionCard,
    EXPRESSION_CARD_PRIMARY_ACTIONS,
    createExpressionSaveSubmissionLock,
    EXPRESSION_CARD_TYPE,
    EXPRESSION_SAVE_ACTIONS,
    EXPRESSION_SAVE_STATES,
    getSavedVocabulary,
} from "../utils/expressionSave";
import {
    EXPRESSION_ASSIST_DISCOVERY_MODE,
} from "../utils/expressionAssist";
import { reportExpressionAssistEvent } from "../utils/expressionAssistClient";

const SAFE_SAVE_ERROR = "That save missed the basket. Try again.";
const SAFE_LEARN_TODAY_ERROR = "That review update missed the basket. Try again.";

export function useExpressionSaveFlow({
    userId,
    sessionId,
    mode,
    transcriptItems,
    addExpressionCard,
    transitionExpressionCard,
    addTranscriptBreadcrumb,
    requestUiFeedback,
    onWordListChanged,
    onTrace = () => {},
}) {
    const transcriptItemsRef = useRef(transcriptItems);
    const saveLocksRef = useRef(null);
    const deferredItemsRef = useRef(new Set());

    if (!saveLocksRef.current) {
        saveLocksRef.current = createExpressionSaveSubmissionLock();
    }

    useEffect(() => {
        transcriptItemsRef.current = transcriptItems;
    }, [transcriptItems]);

    const findCard = useCallback((itemId) => (
        transcriptItemsRef.current.find((item) => (
            item?.itemId === itemId && item?.type === EXPRESSION_CARD_TYPE
        )) ?? null
    ), []);

    const trace = useCallback((event, data = {}) => {
        try {
            onTrace(event, data);
        } catch {
            // Debug tracing must never affect card interaction.
        }
    }, [onTrace]);

    const expressionSaveTool = useMemo(() => createExpressionSaveTool({
        onProposal: (proposal) => {
            const requestMessageId = findLatestUserMessageId(transcriptItemsRef.current);
            const sourceResolution = resolveExpressionSource({
                expression: proposal.expression,
                transcriptItems: transcriptItemsRef.current,
                requestMessageId,
            });
            if (!sourceResolution.ok) {
                return {
                    ok: false,
                    reason: sourceResolution.reason,
                    nextAction: "Say briefly that this save flow only accepts Expressions already used earlier in this conversation, and invite the user to use or discuss it first.",
                };
            }

            const itemId = addExpressionCard({
                ...proposal,
                expression: sourceResolution.matchedExpression || proposal.expression,
                sourceText: sourceResolution.sourceExcerpt,
            }, {
                requestMessageId,
                sourceResolution,
            });
            return {ok: true, itemId};
        },
    }), [addExpressionCard]);

    const sendVoiceFeedback = useCallback((kind, expression) => {
        const result = requestUiFeedback?.({
            kind,
            expression,
            mode,
        });
        if (result && !result.ok && result.reason !== "not_connected") {
            console.warn("Expression UI feedback was not queued:", result.reason);
        }
    }, [mode, requestUiFeedback]);

    const handleDeferExpression = useCallback((itemId) => {
        if (deferredItemsRef.current.has(itemId)) return;
        const card = findCard(itemId);
        if (card?.data?.saveState !== EXPRESSION_SAVE_STATES.PROPOSED) return;

        deferredItemsRef.current.add(itemId);
        trace("expression_card_deferred", {
            itemId,
            expression: card.data.expression,
        });
        transitionExpressionCard(itemId, {
            type: EXPRESSION_SAVE_ACTIONS.DEFER,
        });
        if (card.data.discoveryMode === EXPRESSION_ASSIST_DISCOVERY_MODE) {
            void reportExpressionAssistEvent({
                assistRequestId: card.data.assistRequestId,
                event: "card_deferred",
            });
        }
        sendVoiceFeedback("deferred", card.data.expression);
    }, [findCard, sendVoiceFeedback, trace, transitionExpressionCard]);

    const handleSaveExpression = useCallback(async (itemId) => {
        if (!saveLocksRef.current.acquire(itemId)) return;
        const card = findCard(itemId);
        if (!canSubmitExpressionCard(card)) {
            saveLocksRef.current.release(itemId);
            return;
        }

        transitionExpressionCard(itemId, {
            type: EXPRESSION_SAVE_ACTIONS.SAVE_START,
        });
        trace("expression_card_save_started", {
            itemId,
            expression: card.data.expression,
        });

        try {
            const isProactive = card.data.discoveryMode === EXPRESSION_ASSIST_DISCOVERY_MODE;
            if (isProactive && !card.data.learningContext) {
                throw new Error("Proactive Expression card is missing validated learning context");
            }
            const enrichment = isProactive
                ? {
                    definition: card.data.definition,
                    usage: card.data.usage,
                    surroundingText: card.data.sourceText,
                    learningContext: card.data.learningContext,
                }
                : await enrichExpressionContext(buildExpressionEnrichmentRequest({
                    card,
                    transcriptItems: transcriptItemsRef.current,
                    sessionId,
                    userId,
                }));
            const result = await saveVocabulary(
                buildExpressionSavePayload(card.data, userId, enrichment),
            );
            const savedEntry = getSavedVocabulary(result);

            transitionExpressionCard(itemId, {
                type: EXPRESSION_SAVE_ACTIONS.SAVE_SUCCESS,
                savedVocabularyId: savedEntry.id,
                enrichment,
            });
            trace("expression_card_save_succeeded", {
                itemId,
                expression: card.data.expression,
                vocabularyId: savedEntry.id,
            });
            addTranscriptBreadcrumb(`Saved "${card.data.expression}" to Word List`, {
                kind: "EXPRESSION_SAVED",
                expression: card.data.expression,
                words: [card.data.expression],
                targetItemId: itemId,
                vocabularyId: savedEntry.id,
            });
            sendVoiceFeedback("saved", card.data.expression);
            if (isProactive) {
                void reportExpressionAssistEvent({
                    assistRequestId: card.data.assistRequestId,
                    event: "card_saved",
                    vocabularyId: savedEntry.id,
                });
            }

            try {
                await onWordListChanged?.();
            } catch (refreshError) {
                console.warn("Expression saved, but Word List refresh failed:", refreshError);
            }
        } catch (error) {
            console.error("Failed to save Expression:", error);
            trace("expression_card_save_failed", {
                itemId,
                expression: card.data.expression,
                message: error?.message || String(error),
            });
            transitionExpressionCard(itemId, {
                type: EXPRESSION_SAVE_ACTIONS.SAVE_ERROR,
                errorMessage: SAFE_SAVE_ERROR,
            });
            sendVoiceFeedback("save_failed", card.data.expression);
            if (card.data.discoveryMode === EXPRESSION_ASSIST_DISCOVERY_MODE) {
                void reportExpressionAssistEvent({
                    assistRequestId: card.data.assistRequestId,
                    event: "card_save_failed",
                });
            }
        } finally {
            saveLocksRef.current.release(itemId);
        }
    }, [
        addTranscriptBreadcrumb,
        findCard,
        onWordListChanged,
        sendVoiceFeedback,
        transitionExpressionCard,
        sessionId,
        trace,
        userId,
    ]);

    const handleLearnTodayExpression = useCallback(async (itemId) => {
        if (!saveLocksRef.current.acquire(itemId)) return;
        const card = findCard(itemId);
        const vocabularyId = card?.data?.savedVocabularyId;
        if (
            !canSubmitExpressionCard(card)
            || card?.data?.primaryAction !== EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY
            || !vocabularyId
        ) {
            saveLocksRef.current.release(itemId);
            return;
        }

        transitionExpressionCard(itemId, {
            type: EXPRESSION_SAVE_ACTIONS.SAVE_START,
        });
        trace("expression_card_learn_today_started", {
            itemId,
            expression: card.data.expression,
            vocabularyId,
        });

        try {
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            const updatedEntry = await updateVocabularyDueDate(
                userId,
                vocabularyId,
                formatLocalDateTime(end),
            );
            if (!updatedEntry?.id) {
                throw new Error("Learn Today update did not return a vocabulary id");
            }

            transitionExpressionCard(itemId, {
                type: EXPRESSION_SAVE_ACTIONS.SAVE_SUCCESS,
                savedVocabularyId: updatedEntry.id,
            });
            trace("expression_card_learn_today_succeeded", {
                itemId,
                expression: card.data.expression,
                vocabularyId: updatedEntry.id,
            });
            addTranscriptBreadcrumb(`Learning "${card.data.expression}" today`, {
                kind: "EXPRESSION_LEARN_TODAY",
                expression: card.data.expression,
                words: [card.data.expression],
                targetItemId: itemId,
                vocabularyId: updatedEntry.id,
            });
            sendVoiceFeedback("learn_today", card.data.expression);
            void reportExpressionAssistEvent({
                assistRequestId: card.data.assistRequestId,
                event: "card_learn_today",
                vocabularyId: updatedEntry.id,
            });

            try {
                await onWordListChanged?.();
            } catch (refreshError) {
                console.warn("Expression review updated, but Word List refresh failed:", refreshError);
            }
        } catch (error) {
            console.error("Failed to move Expression into today's review:", error);
            trace("expression_card_learn_today_failed", {
                itemId,
                expression: card.data.expression,
                vocabularyId,
                message: error?.message || String(error),
            });
            transitionExpressionCard(itemId, {
                type: EXPRESSION_SAVE_ACTIONS.SAVE_ERROR,
                errorMessage: SAFE_LEARN_TODAY_ERROR,
            });
            sendVoiceFeedback("learn_today_failed", card.data.expression);
            void reportExpressionAssistEvent({
                assistRequestId: card.data.assistRequestId,
                event: "card_learn_today_failed",
            });
        } finally {
            saveLocksRef.current.release(itemId);
        }
    }, [
        addTranscriptBreadcrumb,
        findCard,
        onWordListChanged,
        sendVoiceFeedback,
        trace,
        transitionExpressionCard,
        userId,
    ]);

    return {
        expressionSaveTool,
        handleDeferExpression,
        handleLearnTodayExpression,
        handleSaveExpression,
    };
}
