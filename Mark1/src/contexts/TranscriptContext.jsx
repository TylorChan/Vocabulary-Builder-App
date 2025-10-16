import React, {
    createContext,
    useContext,
    useState,
} from "react";
import {v4 as uuidv4} from "uuid";

// Context provides these functions to child components
const TranscriptContext = createContext(undefined);

export function TranscriptProvider({children}) {
    const [transcriptItems, setTranscriptItems] = useState([]);

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

    // Add a new message to the transcript
    const addTranscriptMessage = (itemId, role, text = "", isHidden = false) => {
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
    };

    // Update existing message (for streaming responses)
    const updateTranscriptMessage = (itemId, newText, append = false) => {
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
    };

    // Add system messages like "Agent: vocabularyTeacher"
    const addTranscriptBreadcrumb = (title, data) => {
        setTranscriptItems((prev) => [
            ...prev,
            {
                itemId: `breadcrumb-${uuidv4()}`,
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
    };

    // Toggle expand/collapse for messages with extra data
    const toggleTranscriptItemExpand = (itemId) => {
        setTranscriptItems((prev) =>
            prev.map((log) =>
                log.itemId === itemId ? {...log, expanded: !log.expanded} : log
            )
        );
    };

    // Update any property of a transcript item
    const updateTranscriptItem = (itemId, updatedProperties) => {
        setTranscriptItems((prev) =>
            prev.map((item) =>
                item.itemId === itemId ? {...item, ...updatedProperties} : item
            )
        );
    };

    return (
        <TranscriptContext.Provider
            value={{
                transcriptItems,
                addTranscriptMessage,
                updateTranscriptMessage,
                addTranscriptBreadcrumb,
                toggleTranscriptItemExpand,
                updateTranscriptItem,
            }}
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
