import { forwardRef } from "react";
import {
    EXPRESSION_CARD_PRIMARY_ACTIONS,
    EXPRESSION_SAVE_STATES,
} from "../utils/expressionSave";

const ExpressionSaveCard = forwardRef(function ExpressionSaveCard({
    item,
    onDefer,
    onLearnToday,
    onSave,
}, ref) {
    const data = item?.data ?? {};
    const isLearnTodayAction = data.primaryAction === EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY;
    const saveState = data.saveState || EXPRESSION_SAVE_STATES.PROPOSED;
    const isSaving = saveState === EXPRESSION_SAVE_STATES.SAVING;
    const isSaved = saveState === EXPRESSION_SAVE_STATES.SAVED;
    const isDeferred = saveState === EXPRESSION_SAVE_STATES.DEFERRED;
    const isError = saveState === EXPRESSION_SAVE_STATES.ERROR;
    const canDefer = saveState === EXPRESSION_SAVE_STATES.PROPOSED;
    const canSave = saveState === EXPRESSION_SAVE_STATES.PROPOSED
        || isDeferred
        || isError;
    const headingId = `${item.itemId}-heading`;
    const primaryLabel = isSaved
        ? (isLearnTodayAction ? "Learning today" : "Saved")
        : isError
            ? "Retry"
            : isLearnTodayAction
                ? "Learn today"
                : "Save";

    return (
        <section
            ref={ref}
            className="learning-card expression-save-card"
            aria-labelledby={headingId}
            aria-busy={isSaving}
            tabIndex={-1}
            data-transcript-item-id={item.itemId}
        >
            <h3 id={headingId} className="expression-card-heading">
                {data.expression}
            </h3>

            <div className="definition expression-card-definition">
                <span>{data.definition}</span>{" "}
                <span>{data.usage}</span>
            </div>

            <div className="save-section expression-card-actions">
                {!isSaved ? (
                    <button
                        type="button"
                        className="save-section-button"
                        onClick={() => onDefer(item.itemId)}
                        disabled={!canDefer || isSaving}
                    >
                        {isDeferred || isError ? "Later" : "Not now"}
                    </button>
                ) : null}

                <button
                    type="button"
                    className={`save-section-button${isSaved ? " active" : ""}`}
                    onClick={() => (
                        isLearnTodayAction
                            ? onLearnToday(item.itemId)
                            : onSave(item.itemId)
                    )}
                    disabled={!canSave || isSaving || isSaved}
                >
                    {isSaving ? (
                        <>
                            <span>{isLearnTodayAction ? "Updating" : "Saving"}</span>
                            <span className="session-inline-spinner" aria-hidden="true" />
                        </>
                    ) : (
                        <span>{primaryLabel}</span>
                    )}
                </button>
            </div>

            <div className="expression-card-status" role="status" aria-live="polite">
                {isError ? data.errorMessage : ""}
            </div>
        </section>
    );
});

export default ExpressionSaveCard;
