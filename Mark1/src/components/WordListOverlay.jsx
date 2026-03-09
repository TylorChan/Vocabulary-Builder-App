import React, { useEffect, useMemo, useRef, useState } from "react";

function parseDueDate(entry) {
    const raw = entry?.fsrsCard?.dueDate;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfToday() {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    d.setMilliseconds(-1);
    return d;
}

function formatDueLabel(entry) {
    const due = parseDueDate(entry);
    if (!due) return "No due date";

    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    if (due >= todayStart && due <= todayEnd) {
        return "Due today";
    }

    return `Due ${due.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })}`;
}

function splitEntries(entries = []) {
    const todayEnd = endOfToday();
    const today = [];
    const notToday = [];

    for (const entry of entries) {
        const due = parseDueDate(entry);
        if (due && due <= todayEnd) {
            today.push(entry);
        } else {
            notToday.push(entry);
        }
    }

    const sortByDue = (a, b) => {
        const da = parseDueDate(a);
        const db = parseDueDate(b);
        const ta = da ? da.getTime() : Number.POSITIVE_INFINITY;
        const tb = db ? db.getTime() : Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
    };

    today.sort(sortByDue);
    notToday.sort(sortByDue);
    return { today, notToday };
}

export default function WordListOverlay({
    entries = [],
    loading = false,
    error = "",
    open = true,
    variant = "initial",
    drawerAnchorX = null,
    reviewModeLabel = "",
    reviewStatusByWordId = {},
    disableEditing = false,
    disableEditingHint = "",
    onLearnToday,
    onDelete,
    onClose,
}) {
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [menuState, setMenuState] = useState(null);
    const cardRef = useRef(null);
    const variantClass =
        variant === "drawer"
            ? "is-drawer"
            : variant === "panel"
                ? "is-panel"
                : "is-initial";
    const isDrawerSimple = variant === "drawer";
    const showBackdrop = variant !== "drawer";

    useEffect(() => {
        function handleOutsideClick(evt) {
            if (!cardRef.current) return;
            if (!cardRef.current.contains(evt.target)) {
                setMenuState(null);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    useEffect(() => {
        setMenuState(null);
    }, [open]);

    useEffect(() => {
        if (disableEditing) {
            setMenuState(null);
        }
    }, [disableEditing]);

    const grouped = useMemo(() => splitEntries(entries), [entries]);

    const toggleExpanded = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const renderCard = (entry, { isNoDueSection = false } = {}) => {
        const isExpanded = expandedIds.has(entry.id);
        const status = reviewStatusByWordId?.[entry.id] || "";
        const sourceLabel = entry.videoTitle || "Source video";
        const showMenu = !disableEditing;

        return (
            <div key={entry.id} className={`word-list-row${isExpanded ? " is-expanded" : ""}`}>
                <div className="word-list-row-head">
                    <button
                        type="button"
                        className="word-list-expand-btn"
                        onClick={() => toggleExpanded(entry.id)}
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                        <span className={`word-list-chevron${isExpanded ? "" : " is-collapsed"}`}>⌄</span>
                    </button>

                    <div className="word-list-main">
                        <div className="word-list-title-line">
                            {status === "in_progress" ? <span className="word-status-dot active" /> : null}
                            {status === "done" ? <span className="word-status-dot done" /> : null}
                            <span className="word-list-term" title={entry.text}>{entry.text}</span>
                        </div>
                        <span className="word-list-due">{formatDueLabel(entry)}</span>
                    </div>

                    <div
                        className="word-list-row-menu-wrap"
                        title={showMenu ? "Word actions" : disableEditingHint}
                    >
                        <button
                            type="button"
                            className={`word-list-row-menu-trigger${showMenu ? "" : " is-disabled"}`}
                            aria-disabled={!showMenu}
                            aria-label={showMenu ? "Word actions" : "Editing disabled"}
                            onClick={(evt) => {
                                evt.stopPropagation();
                                if (!showMenu) return;
                                const cardRect = cardRef.current?.getBoundingClientRect();
                                if (!cardRect) return;
                                const triggerRect = evt.currentTarget.getBoundingClientRect();
                                const next = {
                                    id: entry.id,
                                    y: triggerRect.bottom - cardRect.top + 4,
                                    isNoDueSection,
                                };
                                setMenuState((prev) => (prev?.id === entry.id ? null : next));
                            }}
                        >
                            •••
                        </button>
                    </div>
                </div>

                {isExpanded ? (
                    <div className="word-list-expanded">
                        {entry.definition ? (
                            <div className="word-list-definition">{entry.definition}</div>
                        ) : null}
                        {entry.example ? (
                            <div className="word-list-example">e.g. {entry.example}</div>
                        ) : null}
                        <div className="word-list-source">
                            {entry.sourceVideoUrl ? (
                                <a href={entry.sourceVideoUrl} target="_blank" rel="noreferrer">
                                    {sourceLabel}
                                </a>
                            ) : (
                                <span>{sourceLabel}</span>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

    const closeMenuOnCardInteraction = (evt) => {
        const target = evt.target;
        if (!(target instanceof Element)) {
            if (menuState) setMenuState(null);
            return;
        }
        if (target.closest(".word-list-row-menu-wrap")) return;
        if (target.closest(".word-floating-menu")) return;
        if (menuState) setMenuState(null);
    };

    return (
        <>
            {showBackdrop && open ? (
                <div
                    className="word-overlay-backdrop"
                    onClick={() => {
                        setMenuState(null);
                        onClose?.();
                    }}
                />
            ) : null}
            <div
                className={`word-overlay-inline ${open ? "is-open" : "is-closed"} ${variantClass}`}
                style={variant === "drawer" && drawerAnchorX ? { "--drawer-anchor-x": `${drawerAnchorX}px` } : undefined}
            >
                <div
                    className="word-overlay-card"
                    ref={cardRef}
                    onClick={closeMenuOnCardInteraction}
                    onWheel={() => {
                        if (menuState) setMenuState(null);
                    }}
                >
                <div className={`word-overlay-header${isDrawerSimple ? "" : " has-close"}`}>
                    <div className={`word-overlay-title-wrap${isDrawerSimple ? " is-stacked" : ""}`}>
                        <span className="word-overlay-title">{isDrawerSimple ? "Now or never" : "Word List"}</span>
                        {reviewModeLabel ? <span className="word-overlay-mode">{reviewModeLabel}</span> : null}
                        {isDrawerSimple && loading ? (
                            <span className="word-section-spinner" aria-label="Loading due words" />
                        ) : null}
                    </div>
                    {!isDrawerSimple ? (
                        <button
                            className="settings-close"
                            onClick={onClose}
                            aria-label="Close word list"
                            type="button"
                        >
                            ×
                        </button>
                    ) : null}
                </div>

                <div className="word-overlay-body">
                    {error ? <div className="word-list-error">{error}</div> : null}

                    {isDrawerSimple ? (
                        <div className="word-list-section word-list-section-single">
                            {!loading && grouped.today.length ? grouped.today.map((entry) => renderCard(entry)) : null}
                            {!loading && !grouped.today.length ? (
                                <div className="word-list-empty">No panic words today.</div>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <div className="word-subsection">
                                <div className="word-section-title-row">
                                    <div className="word-section-title">Now or never</div>
                                    {loading ? <span className="word-section-spinner" aria-label="Loading due words" /> : null}
                                </div>
                                <div className="word-list-section">
                                    {!loading && grouped.today.length ? grouped.today.map((entry) => renderCard(entry)) : null}
                                    {!loading && !grouped.today.length ? (
                                        <div className="word-list-empty">No panic words today.</div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="word-subsection">
                                <div className="word-section-title-row">
                                    <div className="word-section-title">Not your problem yet</div>
                                    {loading ? <span className="word-section-spinner" aria-label="Loading future words" /> : null}
                                </div>
                                <div className="word-list-section">
                                    {!loading && grouped.notToday.length
                                        ? grouped.notToday.map((entry) => renderCard(entry, { isNoDueSection: true }))
                                        : null}
                                    {!loading && !grouped.notToday.length ? (
                                        <div className="word-list-empty">Future-you has nothing queued.</div>
                                    ) : null}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {menuState ? (
                    <div className="word-floating-menu" style={{ top: `${menuState.y}px` }}>
                        {menuState.isNoDueSection ? (
                            <button
                                type="button"
                                className="word-menu-item"
                                onClick={() => {
                                    const id = menuState.id;
                                    setMenuState(null);
                                    onLearnToday?.(id);
                                }}
                            >
                                Learn today
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="word-menu-item"
                            onClick={() => {
                                const id = menuState.id;
                                setMenuState(null);
                                onDelete?.(id);
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ) : null}
            </div>
            </div>
        </>
    );
}
