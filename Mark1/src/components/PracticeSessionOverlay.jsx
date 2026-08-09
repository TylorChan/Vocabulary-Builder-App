import React, { useEffect, useRef, useState } from "react";

export default function PracticeSessionOverlay({
    sessions,
    loading = false,
    selectedSessionId,
    openingSessionId = null,
    onChooseSession,
    onCreateNew,
    onRenameSession,
    onDeleteSession,
    open = true,
    variant = "initial",
    drawerAnchorX = null,
}) {
    const [menuState, setMenuState] = useState(null);
    const cardRef = useRef(null);
    const menuRef = useRef(null);
    const sessionInteractionLocked = Boolean(openingSessionId);

    useEffect(() => {
        function handleDocumentMouseDown(evt) {
            if (menuRef.current?.contains(evt.target)) return;
            if (evt.target?.closest?.(".session-row-menu-trigger")) return;
            setMenuState(null);
        }

        document.addEventListener("mousedown", handleDocumentMouseDown);
        return () => {
            document.removeEventListener("mousedown", handleDocumentMouseDown);
        };
    }, []);

    useEffect(() => {
        setMenuState(null);
    }, [openingSessionId, selectedSessionId]);

    return (
        <div
            className={`session-overlay-inline ${open ? "is-open" : "is-closed"} ${variant === "drawer" ? "is-drawer" : "is-initial"}`}
            style={variant === "drawer" && drawerAnchorX ? { "--drawer-anchor-x": `${drawerAnchorX}px` } : undefined}
        >
            {variant === "initial" ? <div className="session-overlay-backdrop" /> : null}
            <div className="session-overlay-card" ref={cardRef}>
                <div className="session-overlay-header">
                    <div className="session-overlay-title-wrap">
                        <div className="session-overlay-title">Talk!</div>
                        {loading ? (
                            <span className="session-inline-spinner" aria-label="Loading sessions" />
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="session-action-btn session-action-plus"
                        onClick={onCreateNew}
                        title="New Session"
                        aria-label="New Session"
                    >
                        +
                    </button>
                </div>

                <div className="session-list">
                    {!loading && sessions.length === 0 ? (
                        <div className="session-empty">No previous sessions yet.</div>
                    ) : (
                        sessions.map((s) => {
                            const isSelected = selectedSessionId === s.sessionId;
                            const isOpening = openingSessionId === s.sessionId;
                            return (
                                <div
                                    key={s.sessionId}
                                    className={`session-row ${isSelected ? "is-selected" : ""} ${sessionInteractionLocked ? "is-disabled" : ""} ${isOpening ? "is-opening" : ""}`}
                                    role="button"
                                    aria-disabled={sessionInteractionLocked}
                                    tabIndex={sessionInteractionLocked ? -1 : 0}
                                    onClick={() => {
                                        if (sessionInteractionLocked) return;
                                        if (menuState) {
                                            setMenuState(null);
                                            return;
                                        }
                                        onChooseSession(s.sessionId);
                                    }}
                                    onKeyDown={(evt) => {
                                        if (sessionInteractionLocked) return;
                                        if (menuState) {
                                            setMenuState(null);
                                            return;
                                        }
                                        if (evt.key === "Enter" || evt.key === " ") {
                                            evt.preventDefault();
                                            onChooseSession(s.sessionId);
                                        }
                                    }}
                                >
                                    <span className="session-name">{s.title || "Untitled session"}</span>

                                    <div className="session-row-menu-wrap" onClick={(evt) => evt.stopPropagation()}>
                                        <button
                                            type="button"
                                            className={`session-row-menu-trigger ${isOpening ? "is-loading" : ""}`}
                                            disabled={sessionInteractionLocked}
                                            onClick={(evt) => {
                                                if (sessionInteractionLocked) return;
                                                const cardRect = cardRef.current?.getBoundingClientRect();
                                                if (!cardRect) return;

                                                const triggerRect = evt.currentTarget.getBoundingClientRect();
                                                const next = {
                                                    sessionId: s.sessionId,
                                                    x: triggerRect.right - cardRect.left,
                                                    y: triggerRect.top - cardRect.top,
                                                };

                                                setMenuState((prev) => (
                                                    prev?.sessionId === s.sessionId ? null : next
                                                ));
                                            }}
                                            title="Session actions"
                                            aria-label={isOpening ? "Opening session" : "Session actions"}
                                        >
                                            {isOpening ? (
                                                <span className="session-inline-spinner" aria-hidden="true" />
                                            ) : "•••"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {menuState ? (
                    <div
                        className="session-floating-menu"
                        ref={menuRef}
                        style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
                    >
                        <button
                            type="button"
                            className="session-menu-item"
                            onClick={() => {
                                const sid = menuState.sessionId;
                                setMenuState(null);
                                onRenameSession?.(sid);
                            }}
                        >
                            Rename
                        </button>
                        <button
                            type="button"
                            className="session-menu-item"
                            onClick={() => {
                                const sid = menuState.sessionId;
                                setMenuState(null);
                                onDeleteSession?.(sid);
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
