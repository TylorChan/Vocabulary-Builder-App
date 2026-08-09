import { END, START, StateGraph } from "@langchain/langgraph";
import { ReviewState } from "./reviewState.js";
import {
    createReviewNodes,
    routeAfterAdvance,
    routeCompletionResult,
    routePlanResult,
    routeValidatedEvent,
} from "./reviewNodes.js";
import {
    createReviewTeachingNodes,
    routeAfterBeatReplan,
    routeAfterTeachingUpdate,
} from "./reviewTeachingNodes.js";

export function createReviewGraph({
    checkpointer,
    planBuilder,
    replanBuilder,
    now,
    maxPlanningAttempts,
    retryDelayMs,
} = {}) {
    const nodes = createReviewNodes({
        planBuilder,
        now,
        maxPlanningAttempts,
        retryDelayMs,
    });
    const teachingNodes = createReviewTeachingNodes({ replanBuilder, now });

    const graph = new StateGraph(ReviewState)
        .addNode("validate_event", nodes.validateEventNode)
        .addNode("start_run", nodes.startRunNode)
        .addNode("choose_mode", nodes.chooseModeNode)
        .addNode("begin_planning", nodes.beginPlanningNode)
        .addNode("prepare_plan", nodes.preparePlanNode)
        .addNode("activate_scene", nodes.activateSceneNode)
        .addNode("record_user_turn", nodes.recordUserTurnNode)
        .addNode("classify_turn_evidence", teachingNodes.classifyTurnEvidenceNode)
        .addNode("update_teaching_progress", teachingNodes.updateTeachingProgressNode)
        .addNode("maybe_replan_beat", teachingNodes.maybeReplanBeatNode)
        .addNode("advance_beat", teachingNodes.advanceBeatNode)
        .addNode("completion_guard", nodes.completionGuardNode)
        .addNode("enqueue_rating", nodes.enqueueRatingNode)
        .addNode("advance_scene", nodes.advanceSceneNode)
        .addNode("pause_review", nodes.pauseReviewNode)
        .addNode("resume_review", nodes.resumeReviewNode)
        .addNode("claim_rating", nodes.claimRatingNode)
        .addNode("apply_rating_result", nodes.applyRatingResultNode)
        .addNode("finalize_event", nodes.finalizeAcceptedEventNode)
        .addNode("reject_event", nodes.rejectEventNode)
        .addEdge(START, "validate_event")
        .addConditionalEdges("validate_event", routeValidatedEvent, {
            reject_event: "reject_event",
            start_run: "start_run",
            choose_mode: "choose_mode",
            begin_planning: "begin_planning",
            record_user_turn: "record_user_turn",
            classify_turn_evidence: "classify_turn_evidence",
            completion_guard: "completion_guard",
            pause_review: "pause_review",
            resume_review: "resume_review",
            claim_rating: "claim_rating",
            apply_rating_result: "apply_rating_result",
        })
        .addEdge("start_run", "finalize_event")
        .addEdge("choose_mode", "finalize_event")
        .addEdge("begin_planning", "prepare_plan")
        .addConditionalEdges("prepare_plan", routePlanResult, {
            finalize_event: "finalize_event",
            activate_scene: "activate_scene",
        })
        .addEdge("activate_scene", "finalize_event")
        .addEdge("record_user_turn", "finalize_event")
        .addEdge("classify_turn_evidence", "update_teaching_progress")
        .addConditionalEdges("update_teaching_progress", routeAfterTeachingUpdate, {
            FINALIZE: "finalize_event",
            ADVANCE_BEAT: "advance_beat",
            REPLAN_BEAT: "maybe_replan_beat",
        })
        .addConditionalEdges("maybe_replan_beat", routeAfterBeatReplan, {
            FINALIZE: "finalize_event",
            ADVANCE_BEAT: "advance_beat",
        })
        .addEdge("advance_beat", "finalize_event")
        .addConditionalEdges("completion_guard", routeCompletionResult, {
            enqueue_rating: "enqueue_rating",
            finalize_event: "finalize_event",
        })
        .addEdge("enqueue_rating", "advance_scene")
        .addConditionalEdges("advance_scene", routeAfterAdvance, {
            finalize_event: "finalize_event",
            activate_scene: "activate_scene",
        })
        .addEdge("pause_review", "finalize_event")
        .addEdge("resume_review", "finalize_event")
        .addEdge("claim_rating", "finalize_event")
        .addEdge("apply_rating_result", "finalize_event")
        .addEdge("finalize_event", END)
        .addEdge("reject_event", END);

    return graph.compile({
        checkpointer,
        name: "mark2_review_workflow",
        description: "Deterministic MARK II scene-review control plane",
    });
}
