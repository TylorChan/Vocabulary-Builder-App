import { END, START, StateGraph } from "@langchain/langgraph";
import { ExpressionAssistState } from "./expressionAssistState.js";
import {
    createExpressionAssistNodes,
    routeExpressionAssistEvent,
} from "./expressionAssistNodes.js";

export function createExpressionAssistGraph({ checkpointer, decisionService, gapService, now } = {}) {
    if (!decisionService?.decide) throw new Error("Expression Assist graph requires a decision service");
    const nodes = createExpressionAssistNodes({ decisionService, gapService, now });
    return new StateGraph(ExpressionAssistState)
        .addNode("validate_event", nodes.validateEventNode)
        .addNode("start_run", nodes.startRunNode)
        .addNode("reset_context", nodes.resetContextNode)
        .addNode("evaluate_turn", nodes.evaluateTurnNode)
        .addNode("claim_effect", nodes.claimEffectNode)
        .addNode("settle_effect", nodes.settleEffectNode)
        .addNode("finalize_event", nodes.finalizeEventNode)
        .addNode("reject_event", nodes.rejectEventNode)
        .addEdge(START, "validate_event")
        .addConditionalEdges("validate_event", routeExpressionAssistEvent, {
            reject_event: "reject_event",
            start_run: "start_run",
            reset_context: "reset_context",
            evaluate_turn: "evaluate_turn",
            claim_effect: "claim_effect",
            settle_effect: "settle_effect",
        })
        .addEdge("start_run", "finalize_event")
        .addEdge("reset_context", "finalize_event")
        .addEdge("evaluate_turn", "finalize_event")
        .addEdge("claim_effect", "finalize_event")
        .addEdge("settle_effect", "finalize_event")
        .addEdge("finalize_event", END)
        .addEdge("reject_event", END)
        .compile({
            checkpointer,
            name: "mark2_expression_assist_workflow",
            description: "Durable Free Chat Expression Assist decision and card-effect control plane",
        });
}
