import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";
import {v4 as uuidv4} from "uuid";
import {
    createExpressionCardData,
    EXPRESSION_CARD_TYPE,
    normalizeExpressionCardItems,
    transitionExpressionCardItem,
} from "../utils/expressionSave";

// Context provides these functions to child components
const TranscriptContext = createContext(undefined);

// Generate timestamp in HH:MM:SS.mmm format
function newTimestampPretty() {
    const now = new Date();
    const time = now.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const ms = now.getMilliseconds().toString().padStart(3, "0");
    return `${time}.${ms}`;
}

export function TranscriptProvider({children}) {
    const [transcriptItems, setTranscriptItems] = useState([]);
    const [activeWords, setActiveWords] = useState([]);

    const setTranscriptSnapshot = useCallback(({items = [], words = []}) => {
        setTranscriptItems(normalizeExpressionCardItems(items));
        setActiveWords(Array.isArray(words) ? words : []);
    }, []);

    const clearTranscript = useCallback(() => {
        setTranscriptItems([]);
        setActiveWords([]);
    }, []);

    // Add a new message to the transcript
    const addTranscriptMessage = useCallback((itemId, role, text = "", isHidden = false) => {
        setTranscriptItems((prev) => {
            // Prevent duplicate messages
            if (prev.some((log) => log.itemId === itemId && log.type === "MESSAGE")) {
                console.warn(`Message already exists for itemId=${itemId}`);
                return prev;
            }

            const newItem = {
                itemId,
                type: "MESSAGE",
                role, // "user" or "assistant"
                title: text,
                expanded: false,
                timestamp: newTimestampPretty(),
                createdAtMs: Date.now(),
                status: "IN_PROGRESS",
                isHidden,
            };

            return [...prev, newItem];
        });
    }, []);

    // Update existing message (for streaming responses)
    const updateTranscriptMessage = useCallback((itemId, newText, append = false) => {
        setTranscriptItems((prev) =>
            prev.map((item) => {
                if (item.itemId === itemId && item.type === "MESSAGE") {
                    return {
                        ...item,
                        title: append ? (item.title ?? "") + newText : newText,
                    };
                }
                return item;
            })
        );
    }, []);

    // Add system messages like "Agent: vocabularyTeacher"
    const addTranscriptBreadcrumb = useCallback((title, data) => {
        const itemId = `breadcrumb-${uuidv4()}`;
        setTranscriptItems((prev) => [
            ...prev,
            {
                itemId,
                type: "BREADCRUMB",
                title,
                data,
                expanded: false,
                timestamp: newTimestampPretty(),
                createdAtMs: Date.now(),
                status: "DONE",
                isHidden: false,
            },
        ]);
        return itemId;
    }, []);

    const addExpressionCard = useCallback((proposal, metadata = {}) => {
        const requestedItemId = String(metadata?.itemId || "").trim();
        const itemId = requestedItemId || `expression-card-${uuidv4()}`;
        const data = createExpressionCardData(proposal, metadata);
        setTranscriptItems((prev) => {
            if (prev.some((item) => item.itemId === itemId)) return prev;
            return [...prev, {
                itemId,
                type: EXPRESSION_CARD_TYPE,
                title: data.expression,
                data,
                expanded: false,
                timestamp: newTimestampPretty(),
                createdAtMs: Date.now(),
                status: "DONE",
                isHidden: false,
            }];
        });
        return itemId;
    }, []);

    const transitionExpressionCard = useCallback((itemId, action) => {
        setTranscriptItems((prev) => prev.map((item) => (
            item.itemId === itemId
                ? transitionExpressionCardItem(item, action)
                : item
        )));
    }, []);

    // Toggle expand/collapse for messages with extra data
    const toggleTranscriptItemExpand = useCallback((itemId) => {
        setTranscriptItems((prev) =>
            prev.map((log) =>
                log.itemId === itemId ? {...log, expanded: !log.expanded} : log
            )
        );
    }, []);

    // Update any property of a transcript item
    const updateTranscriptItem = useCallback((itemId, updatedProperties) => {
        setTranscriptItems((prev) =>
            prev.map((item) =>
                item.itemId === itemId ? {...item, ...updatedProperties} : item
            )
        );
    }, []);

    // Remove breadcrumb items by data.kind (used for replaceable status breadcrumbs)
    const removeBreadcrumbsByKinds = useCallback((kinds = [], titlePrefixes = []) => {
        const kindSet = new Set(kinds.filter(Boolean));
        const prefixes = titlePrefixes.filter(Boolean);
        if (kindSet.size === 0 && prefixes.length === 0) return;

        setTranscriptItems((prev) =>
            prev.filter((item) => {
                if (item.type !== "BREADCRUMB") return true;
                const itemKind = item?.data?.kind;
                const byKind = kindSet.has(itemKind);
                const byTitle = prefixes.some((prefix) => String(item.title || "").startsWith(prefix));
                return !(byKind || byTitle);
            })
        );
    }, []);

    const removeTranscriptItem = useCallback((itemId) => {
        const normalizedItemId = String(itemId || "").trim();
        if (!normalizedItemId) return;
        setTranscriptItems((prev) => prev.filter((item) => item.itemId !== normalizedItemId));
    }, []);

    const contextValue = useMemo(() => ({
        transcriptItems,
        addTranscriptMessage,
        updateTranscriptMessage,
        addTranscriptBreadcrumb,
        addExpressionCard,
        transitionExpressionCard,
        toggleTranscriptItemExpand,
        updateTranscriptItem,
        activeWords,
        setActiveWords,
        setTranscriptSnapshot,
        clearTranscript,
        removeBreadcrumbsByKinds,
        removeTranscriptItem,
    }), [
        transcriptItems,
        addTranscriptMessage,
        updateTranscriptMessage,
        addTranscriptBreadcrumb,
        addExpressionCard,
        transitionExpressionCard,
        toggleTranscriptItemExpand,
        updateTranscriptItem,
        activeWords,
        setTranscriptSnapshot,
        clearTranscript,
        removeBreadcrumbsByKinds,
        removeTranscriptItem,
    ]);

    return (
        <TranscriptContext.Provider
            value={contextValue}
        >
            {children}
        </TranscriptContext.Provider>
    );
}

// Custom hook to use transcript context
export function useTranscript() {
    const context = useContext(TranscriptContext);
    if (!context) {
        throw new Error("useTranscript must be used within a TranscriptProvider");
    }
    return context;
}
