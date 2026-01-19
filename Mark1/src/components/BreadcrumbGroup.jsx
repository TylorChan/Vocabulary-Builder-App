import React, { useEffect, useMemo, useRef, useState } from "react";
import highlightWords from "../utils/boldWord";

export default function BreadcrumbGroup({ items }) {
    const STEP_DELAY_MS = 650;      // how long each breadcrumb stays visible
    const ACTIVE_WINDOW_MS = 1200;  // how long spinner stays on after last update

    const [expanded, setExpanded] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
    const [displayIndex, setDisplayIndex] = useState(0);
    const timerRef = useRef(null);
    const [activeTick, setActiveTick] = useState(0);

    // Update timestamp whenever new breadcrumb arrives
    useEffect(() => {
        setLastUpdatedAt(Date.now());
    }, [items.length]);

    useEffect(() => {
        const t = setTimeout(() => setActiveTick((n) => n + 1), ACTIVE_WINDOW_MS);
        return () => clearTimeout(t);
    }, [lastUpdatedAt]);

    // Spinner on if updated recently
    const isActive = useMemo(() => {
        return Date.now() - lastUpdatedAt < ACTIVE_WINDOW_MS;;
    }, [lastUpdatedAt, activeTick]);

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
    }, [items.length]);

    const latest = items[Math.max(0, displayIndex)];
    const nowReviewing = [...items]
        .reverse()
        .find((it) => it.data?.kind === "NOW_REVIEWING");

    return (
        <div className="breadcrumb-group">
            <div className="breadcrumb-group-row">
                <div className="breadcrumb-group-left">
                    <span key={displayIndex} className="breadcrumb-group-text breadcrumb-fade">
                        {latest?.data?.words
                            ? highlightWords(latest.title, latest.data.words)
                            : latest?.title}
                    </span>
                </div>

                {items.length > 1 && (
                    <button
                        className="breadcrumb-group-toggle"
                        onClick={() => setExpanded((v) => !v)}
                    >
                        {(expanded ? "⌄" : "⌃")}
                    </button>
                )}
            </div>

            {expanded && (
                <div className="breadcrumb-group-dropdown">
                    {items.map((b) => (
                        <div key={b.itemId} className="breadcrumb-group-item">
                            <span className="breadcrumb-group-title">
                                {b.data?.words ? highlightWords(b.title, b.data.words) : b.title}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}