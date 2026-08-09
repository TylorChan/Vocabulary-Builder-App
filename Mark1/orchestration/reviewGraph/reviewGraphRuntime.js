import process from "node:process";
import { createReviewCheckpoint } from "./reviewCheckpoint.js";
import { ReviewGraphError, ReviewGraphService } from "./reviewGraphService.js";

export const REVIEW_GRAPH_MODES = Object.freeze({
    OFF: "off",
    SHADOW: "shadow",
    AUTHORITY: "authority",
});

export function normalizeReviewGraphMode(value) {
    const mode = String(value || REVIEW_GRAPH_MODES.OFF).trim().toLowerCase();
    return Object.values(REVIEW_GRAPH_MODES).includes(mode) ? mode : REVIEW_GRAPH_MODES.OFF;
}

export function createReviewGraphRuntime({
    featureMode = process.env.REVIEW_GRAPH_MODE,
    checkpointMode = process.env.REVIEW_GRAPH_CHECKPOINTER
        || (process.env.NODE_ENV === "production" ? "mongo" : "memory"),
    planningService,
    memoryService,
    teachingService = null,
    semanticEvidenceEnabled = String(process.env.REVIEW_SEMANTIC_EVIDENCE_ENABLED || "false").toLowerCase() === "true",
    beatReplannerEnabled = String(process.env.REVIEW_BEAT_REPLANNER_ENABLED || "true").toLowerCase() !== "false",
    checkpointFactory = createReviewCheckpoint,
    logger = (record) => console.info("[reviewGraph]", JSON.stringify(record)),
} = {}) {
    const mode = normalizeReviewGraphMode(featureMode);
    let resource = null;
    let servicePromise = null;

    async function getService() {
        if (mode === REVIEW_GRAPH_MODES.OFF) {
            throw new ReviewGraphError("Review graph is disabled", {
                code: "REVIEW_GRAPH_DISABLED",
                status: 503,
            });
        }
        if (!servicePromise) {
            servicePromise = (async () => {
                resource = await checkpointFactory({ mode: checkpointMode });
                return new ReviewGraphService({
                    checkpointer: resource.checkpointer,
                    logger,
                    planBuilder: async ({ userId, dueWords, currentUserFocus }) => (
                        planningService.buildReviewPlan({
                            userId,
                            dueWords,
                            currentUserFocus,
                            memoryService,
                        })
                    ),
                    turnEvidenceBuilder: semanticEvidenceEnabled && teachingService?.classifyTurnEvidence
                        ? (input) => teachingService.classifyTurnEvidence(input)
                        : null,
                    replanBuilder: beatReplannerEnabled && teachingService?.replanTeachingBeat
                        ? (input) => teachingService.replanTeachingBeat(input)
                        : null,
                });
            })().catch((error) => {
                servicePromise = null;
                throw error;
            });
        }
        return servicePromise;
    }

    return {
        mode,
        getService,
        async close() {
            servicePromise = null;
            const current = resource;
            resource = null;
            await current?.close?.();
        },
    };
}
