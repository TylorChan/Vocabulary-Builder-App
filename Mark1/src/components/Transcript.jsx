import React, { useEffect, useRef, useState } from "react";
import { useTranscript } from "../contexts/TranscriptContext";
import BreadcrumbGroup from "./BreadcrumbGroup";

export function Transcript({
    userText, setUserText, onSendMessage, canSend, downloadRecording,
    isVoiceOnly = false,
}) {

    const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
    const transcriptRef = useRef(null);
    const [prevLogs, setPrevLogs] = useState([]);
    const [justCopied, setJustCopied] = useState(false);
    const inputRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    function scrollToBottom() {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }

    useEffect(() => {
        const hasNewMessage = transcriptItems.length > prevLogs.length;
        const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
            const oldItem = prevLogs[index];
            return (oldItem && (newItem.title !== oldItem.title || newItem.data !== oldItem.data));
        });

        if (hasNewMessage || hasUpdatedMessage) {
            scrollToBottom();
        }

        setPrevLogs(transcriptItems);
    }, [transcriptItems]);

    // Auto-focus text input when ready
    useEffect(() => {
        if (canSend && inputRef.current) {
            inputRef.current.focus();
        }
    }, [canSend]);

    const handleCopyTranscript = async () => {
        if (!transcriptRef.current) return;
        try {
            await navigator.clipboard.writeText(transcriptRef.current.innerText);
            setJustCopied(true);
            setTimeout(() => setJustCopied(false), 3000);
        } catch (error) {
            console.error("Failed to copy transcript:", error);
        }
    };

    // Group consecutive breadcrumb items together
    const groupedItems = React.useMemo(() => {
        const sorted = [...transcriptItems].sort((a, b) => a.createdAtMs - b.createdAtMs);
        const result = [];
        let buffer = [];

        for (const item of sorted) {
            if (item.type === "BREADCRUMB") {
                buffer.push(item);
                continue;
            }

            // flush any breadcrumb buffer before a normal message
            if (buffer.length > 0) {
                result.push({ type: "BREADCRUMB_GROUP", items: buffer });
                buffer = [];
            }
            result.push(item);
        }

        // flush at end
        if (buffer.length > 0) {
            result.push({ type: "BREADCRUMB_GROUP", items: buffer });
        }
        return result;
    }, [transcriptItems]);

    return (<div className="transcript-container">
        <div className="transcript-header">
            <span className="transcript-title">Conversation</span>
            <div className="transcript-actions">
                <button onClick={handleCopyTranscript} className="transcript-copy-button">
                    {justCopied ? "✓ Copied" : "⧉ Copy"}
                </button>
            </div>
        </div>

        {/* Scrollable transcript content */}
        <div ref={transcriptRef} className="transcript-content">
            {groupedItems.map((item) => {
                if (item.type === "BREADCRUMB_GROUP") {
                    return (
                        <BreadcrumbGroup
                            key={item.items[0].itemId}
                            items={item.items}
                        />
                    );
                }

                const {
                    itemId, type, role, title = "", expanded, timestamp, isHidden,
                } = item;

                if (isHidden) {
                    return null;
                }

                if (type === "MESSAGE") {
                    const isUser = role === "user";
                    const containerClasses = `message-container ${isUser ? "user-message" : "assistant-message"}`;

                    return (<div key={itemId} className={containerClasses}>
                        <div className="message-bubble">
                            {/*<div className="message-timestamp">{timestamp}</div>*/}
                            <div className="message-timestamp">{isUser ? 'YOU' : 'Bob'}</div>
                            <div className="message-text">{title}</div>
                        </div>
                    </div>);
                } else if (type === "BREADCRUMB") {
                    return (<div key={itemId} className="breadcrumb">
                        <span className="breadcrumb-timestamp">{timestamp}</span>
                        <div
                            className="breadcrumb-text"
                            onClick={() => item.data && toggleTranscriptItemExpand(itemId)}
                        >
                            {title}
                        </div>
                        {expanded && item.data && (<pre className="breadcrumb-data">
                            {JSON.stringify(item.data, null, 2)}
                        </pre>)}
                    </div>);
                }

                return null;
            })}
        </div>

        {/* Text input for sending messages (hidden in voice-only mode) */}
        {!isVoiceOnly && (
            <div className="transcript-input">
                <input
                    ref={inputRef}
                    type="text"
                    value={userText}
                    onChange={(e) => setUserText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canSend) {
                            onSendMessage();
                        }
                    }}
                    placeholder="Type a message..."
                />
                <button
                    onClick={onSendMessage}
                    disabled={!canSend || !userText.trim()}
                    className="send-button"
                >
                    Send
                </button>
            </div>
        )}

    </div>);
}
