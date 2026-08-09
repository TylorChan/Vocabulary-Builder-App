import React, { useEffect, useRef, useState } from "react";
import highlightWords from "../utils/boldWord";
import { getBreadcrumbTargetItemId } from "../utils/expressionSave";

function SceneProgressRing({ sceneIndex, sceneCount }) {
    const total = Math.max(1, Math.floor(Number(sceneCount) || 1));
    const current = Math.min(
        total,
        Math.max(1, Math.floor(Number(sceneIndex) || 0) + 1),
    );
    const progress = current / total;

    return (
        <svg
            className="breadcrumb-scene-progress"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
        >
            <circle
                className="breadcrumb-scene-progress-track"
                cx="8"
                cy="8"
                r="6"
            />
            <circle
                className="breadcrumb-scene-progress-value"
                cx="8"
                cy="8"
                r="6"
                pathLength="1"
                strokeDasharray={`${progress} ${Math.max(0, 1 - progress)}`}
            />
        </svg>
    );
}

function BreadcrumbLabel({ item, className, onNavigate }) {
    const targetItemId = getBreadcrumbTargetItemId(item);
    const content = item?.data?.words
        ? highlightWords(item.title, item.data.words)
        : item?.title;
    const isReviewScene = item?.data?.kind === "REVIEW_SCENE";
    const isLoading = item?.data?.loading === true;
    const resolvedClassName = `${className}${isReviewScene ? " breadcrumb-scene-label" : ""}${isLoading ? " breadcrumb-status-label" : ""}`;
    const labelContent = isReviewScene ? (
        <>
            <SceneProgressRing
                sceneIndex={item.data.sceneIndex}
                sceneCount={item.data.sceneCount}
            />
            <span className="breadcrumb-scene-label-copy">{content}</span>
        </>
    ) : (
        <>
            {isLoading && <span className="breadcrumb-spinner" aria-hidden="true" />}
            <span>{content}</span>
        </>
    );

    if (!targetItemId) {
        return <span className={resolvedClassName}>{labelContent}</span>;
    }

    return (
        <button
            type="button"
            className={`breadcrumb-target-button ${resolvedClassName}`}
            onClick={() => onNavigate?.(targetItemId)}
            aria-label={`Go to ${item.title}`}
        >
            {labelContent}
        </button>
    );
}

export default function BreadcrumbGroup({ items, onNavigate }) {
    const STEP_DELAY_MS = 650;      // how long each breadcrumb stays visible
    const ACTIVE_WINDOW_MS = 1200;  // how long spinner stays on after last update

    const initialLatest = items[Math.max(0, items.length - 1)];
    const isHistoricalOnMount =
        typeof initialLatest?.createdAtMs === "number" &&
        Date.now() - initialLatest.createdAtMs > ACTIVE_WINDOW_MS;

    const [expanded, setExpanded] = useState(false);
    const [displayIndex, setDisplayIndex] = useState(
        () => (isHistoricalOnMount ? Math.max(0, items.length - 1) : 0)
    );
    const timerRef = useRef(null);

    // Step through new items in collapsed view
    useEffect(() => {
        if (expanded) return; // no animation when expanded

        const target = items.length - 1;
        let current = Math.min(displayIndex, target);

        // If we already show latest, nothing to do
        if (current >= target) return;

        const step = () => {
            current += 1;
            setDisplayIndex(current);
            if (current < target) {
                timerRef.current = setTimeout(step, STEP_DELAY_MS); // change speed as needed
            }
        };

        timerRef.current = setTimeout(step, STEP_DELAY_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [items.length, expanded]);

    // Ensure displayIndex stays in range if list shrinks
    useEffect(() => {
        const maxIdx = items.length - 1;
        if (displayIndex > maxIdx) setDisplayIndex(maxIdx);
    }, [items.length, displayIndex]);

    const latest = items[Math.max(0, displayIndex)];

    return (
        <div className="breadcrumb-group">
            <div className="breadcrumb-group-row">
                <div className="breadcrumb-group-left">
                    <BreadcrumbLabel
                        key={displayIndex}
                        item={latest}
                        className="breadcrumb-group-text breadcrumb-fade"
                        onNavigate={onNavigate}
                    />
                </div>

                {items.length > 1 && (
                    <button
                        type="button"
                        className="breadcrumb-group-toggle word-list-expand-btn"
                        onClick={() => setExpanded((v) => !v)}
                        aria-label={expanded ? "Collapse breadcrumbs" : "Expand breadcrumbs"}
                    >
                        <span className={`word-list-chevron${expanded ? "" : " is-collapsed"}`}>⌄</span>
                    </button>
                )}
            </div>

            {expanded && (
                <div className="breadcrumb-group-dropdown">
                    {items.map((b) => (
                        <div key={b.itemId} className="breadcrumb-group-item">
                            <BreadcrumbLabel
                                item={b}
                                className="breadcrumb-group-title"
                                onNavigate={onNavigate}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
