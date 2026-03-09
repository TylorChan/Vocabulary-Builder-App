import React, { useEffect, useRef, useState } from "react";

export default function PracticeSessionOverlay({
    sessions,
    loading = false,
    selectedSessionId,
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

    useEffect(() => {
        function handleOutsideClick(evt) {
            if (!cardRef.current) return;
            if (!cardRef.current.contains(evt.target)) {
                setMenuState(null);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, []);

    useEffect(() => {
        setMenuState(null);
    }, [selectedSessionId]);

    return (
        <div
            className={`session-overlay-inline ${open ? "is-open" : "is-closed"} ${variant === "drawer" ? "is-drawer" : "is-initial"}`}
            style={variant === "drawer" && drawerAnchorX ? { "--drawer-anchor-x": `${drawerAnchorX}px` } : undefined}
        >
            <div className="session-overlay-card" ref={cardRef}>
                <div className="session-overlay-header">
                    <div className="session-overlay-title-wrap">
                        <div className="session-overlay-title">Session</div>
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
                            return (
                                <div
                                    key={s.sessionId}
                                    className={`session-row ${isSelected ? "is-selected" : ""}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onChooseSession(s.sessionId)}
                                    onKeyDown={(evt) => {
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
                                            className="session-row-menu-trigger"
                                            onClick={(evt) => {
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
                                            aria-label="Session actions"
                                        >
                                            •••
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
