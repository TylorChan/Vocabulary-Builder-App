/* eslint-disable react-refresh/only-export-components -- Standalone Playwright fixture. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ExpressionSaveCard from "../../src/components/ExpressionSaveCard";
import {
    createExpressionCardData,
    EXPRESSION_CARD_PRIMARY_ACTIONS,
    EXPRESSION_CARD_TYPE,
    EXPRESSION_SAVE_ACTIONS,
    transitionExpressionCardItem,
} from "../../src/utils/expressionSave";
import "../../src/index.css";
import "./expression-card.css";

const proposal = {
    expression: "serious contender",
    definition: "Someone with a realistic chance of winning.",
    usage: "Use it when describing a credible competitor.",
    sourceText: "Doctor Doom has a real chance to win.",
};

function createFixtureItem(id, primaryAction) {
    return {
        itemId: id,
        type: EXPRESSION_CARD_TYPE,
        title: proposal.expression,
        data: createExpressionCardData(proposal, {
            discoveryMode: "AGENT_SUGGESTED_GAP",
            primaryAction,
            savedVocabularyId: primaryAction === EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY
                ? "vocabulary-existing"
                : null,
        }),
    };
}

function FixtureCard({ id, primaryAction }) {
    const [item, setItem] = useState(() => createFixtureItem(id, primaryAction));

    const transition = (action) => {
        setItem((current) => transitionExpressionCardItem(current, action));
    };
    const submit = () => {
        transition({ type: EXPRESSION_SAVE_ACTIONS.SAVE_START });
        window.setTimeout(() => {
            transition({
                type: EXPRESSION_SAVE_ACTIONS.SAVE_SUCCESS,
                savedVocabularyId: item.data.savedVocabularyId || "vocabulary-new",
            });
        }, 500);
    };

    return (
        <ExpressionSaveCard
            item={item}
            onDefer={() => transition({ type: EXPRESSION_SAVE_ACTIONS.DEFER })}
            onLearnToday={submit}
            onSave={submit}
        />
    );
}

function Fixture() {
    return (
        <main className="expression-card-fixture">
            <FixtureCard
                id="existing-expression"
                primaryAction={EXPRESSION_CARD_PRIMARY_ACTIONS.LEARN_TODAY}
            />
            <FixtureCard
                id="new-expression"
                primaryAction={EXPRESSION_CARD_PRIMARY_ACTIONS.SAVE}
            />
        </main>
    );
}

createRoot(document.getElementById("root")).render(<Fixture />);
