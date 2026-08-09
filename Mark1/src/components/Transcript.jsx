import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranscript } from "../contexts/TranscriptContext";
import BreadcrumbGroup from "./BreadcrumbGroup";
import highlightWords from "../utils/boldWord";
import ExpressionSaveCard from "./ExpressionSaveCard";

export function Transcript({
    userText, setUserText, onSendMessage, canSend, downloadRecording,
    isVoiceOnly = false,
    onDeferExpression = () => {},
    onLearnTodayExpression = () => {},
    onSaveExpression = () => {},
}) {

    const { transcriptItems, toggleTranscriptItemExpand, activeWords } = useTranscript();
    const transcriptRef = useRef(null);
    const [prevLogs, setPrevLogs] = useState([]);
    const inputRef = useRef(null);
    const transcriptItemRefs = useRef(new Map());
    const targetHighlightTimerRef = useRef(null);

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

    useEffect(() => () => {
        if (targetHighlightTimerRef.current) {
            clearTimeout(targetHighlightTimerRef.current);
        }
    }, []);

    const registerTranscriptItem = useCallback((itemId, node) => {
        if (node) {
            transcriptItemRefs.current.set(itemId, node);
        } else {
            transcriptItemRefs.current.delete(itemId);
        }
    }, []);

    const scrollToTranscriptItem = useCallback((itemId) => {
        const node = transcriptItemRefs.current.get(itemId);
        if (!node) return false;

        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        node.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "center",
        });
        node.focus({ preventScroll: true });

        if (targetHighlightTimerRef.current) {
            clearTimeout(targetHighlightTimerRef.current);
        }
        node.classList.remove("is-transcript-target");
        window.requestAnimationFrame(() => node.classList.add("is-transcript-target"));
        targetHighlightTimerRef.current = window.setTimeout(() => {
            node.classList.remove("is-transcript-target");
        }, 1400);
        return true;
    }, []);

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
        {/* Scrollable transcript content */}
        <div ref={transcriptRef} className="transcript-content">
            {groupedItems.map((item) => {
                if (item.type === "BREADCRUMB_GROUP") {
                    return (
                        <BreadcrumbGroup
                            key={item.items[0].itemId}
                            items={item.items}
                            onNavigate={scrollToTranscriptItem}
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
                    // console.log("activeWords", activeWords);

                    return (<div key={itemId} className={containerClasses}>
                        <div className="message-bubble">
                            {/*<div className="message-timestamp">{timestamp}</div>*/}
                            <div className="message-timestamp">{isUser ? 'YOU' : 'Bob'}</div>
                            <div className="message-text">{highlightWords(title, activeWords)}</div>                        </div>
                    </div>);
                } else if (type === "EXPRESSION_CARD") {
                    return (
                        <ExpressionSaveCard
                            key={itemId}
                            ref={(node) => registerTranscriptItem(itemId, node)}
                            item={item}
                            onDefer={onDeferExpression}
                            onLearnToday={onLearnTodayExpression}
                            onSave={onSaveExpression}
                        />
                    );
                } else if (type === "BREADCRUMB") {
                    return (<div key={itemId} className="breadcrumb">
                        <span className="breadcrumb-timestamp">{timestamp}</span>
                        <div
                            className="breadcrumb-text"
                            onClick={() => item.data && toggleTranscriptItemExpand(itemId)}
                        >
                            {item.data?.words ? highlightWords(title, item.data.words) : title}                        </div>
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
