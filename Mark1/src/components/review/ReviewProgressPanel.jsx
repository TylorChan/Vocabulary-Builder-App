import React, { useEffect, useId, useState } from "react";
import { AnimatePresence, motion as Motion } from "motion/react";

const STATUS_LABELS = {
    PENDING: "Not started",
    ACTIVE: "In progress",
    COMPLETED: "Completed",
};

function ProgressStatusIndicator({ status }) {
    const normalizedStatus = STATUS_LABELS[status] ? status : "PENDING";
    return (
        <span
            className={`review-progress-indicator is-${normalizedStatus.toLowerCase()}`}
            role="img"
            aria-label={STATUS_LABELS[normalizedStatus]}
        />
    );
}

function getEmptyMessage(phase) {
    if (phase === "PLANNING") return "Planning your scenes.";
    if (phase === "AWAIT_THEME") return "Choose a topic to build your review.";
    if (phase === "FREE_CHAT") return "No goal yet.";
    if (phase === "PAUSED") return "Scene review paused.";
    if (phase === "DONE") return "Review complete.";
    return "Start a scene review to see your progress.";
}

export default function ReviewProgressPanel({ overview, phase, visible, onClose }) {
    const baseId = useId();
    // Free Chat may retain a resumable Review plan in LangGraph. Keep it persisted,
    // but do not present that plan as the learner's current goal.
    const scenes = phase !== "FREE_CHAT" && Array.isArray(overview?.scenes)
        ? overview.scenes
        : [];
    const activeSceneId = scenes.find((scene) => scene.status === "ACTIVE")?.sceneId || null;
    const firstSceneId = scenes[0]?.sceneId || null;
    const [expandedSceneId, setExpandedSceneId] = useState(null);
    const [expandedExpressionId, setExpandedExpressionId] = useState(null);

    useEffect(() => {
        if (!firstSceneId) {
            setExpandedSceneId(null);
            setExpandedExpressionId(null);
            return;
        }
        setExpandedSceneId(activeSceneId || firstSceneId);
        setExpandedExpressionId(null);
    }, [activeSceneId, firstSceneId]);

    const currentSceneNumber = scenes.length
        ? Math.min(Math.max(Number(overview?.currentSceneIndex || 0) + 1, 1), scenes.length)
        : 0;

    return (
        <>
            <div className="review-status-header">
                <span className="settings-window-title">Progress</span>
                <button
                    type="button"
                    className={`settings-close review-status-close${visible ? " is-visible" : ""}`}
                    onClick={onClose}
                    tabIndex={visible ? 0 : -1}
                    aria-label="Close review status"
                >
                    ×
                </button>
            </div>

            <div className="review-progress-body">
                {scenes.length > 0 ? (
                    <>
                        <div className="review-progress-count">
                            Scene {currentSceneNumber} of {overview.sceneCount || scenes.length}
                        </div>
                        <div className="review-progress-scenes">
                            {scenes.map((scene, sceneIndex) => {
                                const sceneKey = scene.sceneId || `scene-${sceneIndex + 1}`;
                                const scenePanelId = `${baseId}-scene-${sceneIndex}`;
                                const sceneExpanded = expandedSceneId === sceneKey;
                                return (
                                    <div className="review-progress-scene" key={sceneKey}>
                                        <button
                                            type="button"
                                            className={`review-progress-scene-trigger${scene.status === "ACTIVE" ? " is-current" : ""}`}
                                            onClick={() => {
                                                setExpandedSceneId(sceneExpanded ? null : sceneKey);
                                                setExpandedExpressionId(null);
                                            }}
                                            aria-expanded={sceneExpanded}
                                            aria-controls={scenePanelId}
                                        >
                                            <ProgressStatusIndicator status={scene.status} />
                                            <span className="review-progress-scene-title">{scene.title}</span>
                                            <span
                                                className={`review-progress-chevron${sceneExpanded ? " is-expanded" : ""}`}
                                                aria-hidden="true"
                                            >
                                                ›
                                            </span>
                                        </button>

                                        <AnimatePresence initial={false}>
                                            {sceneExpanded && (
                                                <Motion.div
                                                    id={scenePanelId}
                                                    className="review-progress-scene-content"
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.16, ease: "easeOut" }}
                                                >
                                                    {scene.abstract && (
                                                        <p className="review-progress-abstract">{scene.abstract}</p>
                                                    )}
                                                    <div className="review-progress-expressions">
                                                        {(scene.expressions || []).map((expression, expressionIndex) => {
                                                            const expressionKey = expression.id || `${sceneKey}-expression-${expressionIndex}`;
                                                            const definitionId = `${baseId}-expression-${sceneIndex}-${expressionIndex}`;
                                                            const expressionExpanded = expandedExpressionId === expressionKey;
                                                            return (
                                                                <div className="review-progress-expression" key={expressionKey}>
                                                                    <button
                                                                        type="button"
                                                                        className={`review-progress-expression-trigger${expressionExpanded ? " is-selected" : ""}`}
                                                                        onClick={() => setExpandedExpressionId(
                                                                            expressionExpanded ? null : expressionKey,
                                                                        )}
                                                                        aria-expanded={expressionExpanded}
                                                                        aria-controls={definitionId}
                                                                    >
                                                                        <ProgressStatusIndicator status={expression.status} />
                                                                        <span className="review-progress-expression-copy">
                                                                            <span className="review-progress-expression-title">
                                                                                {expression.text}
                                                                            </span>
                                                                            <AnimatePresence initial={false}>
                                                                                {expressionExpanded && expression.definition && (
                                                                                    <Motion.span
                                                                                        id={definitionId}
                                                                                        className="review-progress-definition"
                                                                                        initial={{ height: 0, opacity: 0 }}
                                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                                        exit={{ height: 0, opacity: 0 }}
                                                                                        transition={{ duration: 0.14, ease: "easeOut" }}
                                                                                    >
                                                                                        {expression.definition}
                                                                                    </Motion.span>
                                                                                )}
                                                                            </AnimatePresence>
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </Motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <p className="review-progress-empty">{getEmptyMessage(phase)}</p>
                )}
            </div>
        </>
    );
}
