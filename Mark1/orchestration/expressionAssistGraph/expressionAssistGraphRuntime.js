import process from "node:process";
import { createExpressionAssistCheckpoint } from "./expressionAssistCheckpoint.js";
import { EXPRESSION_ASSIST_GRAPH_MODES } from "./expressionAssistConstants.js";
import {
    ExpressionAssistGraphError,
    ExpressionAssistGraphService,
} from "./expressionAssistGraphService.js";

export function normalizeExpressionAssistGraphMode(value) {
    const mode = String(value || EXPRESSION_ASSIST_GRAPH_MODES.OFF).trim().toLowerCase();
    return Object.values(EXPRESSION_ASSIST_GRAPH_MODES).includes(mode)
        ? mode
        : EXPRESSION_ASSIST_GRAPH_MODES.OFF;
}

export function createExpressionAssistGraphRuntime({
    featureMode = process.env.EXPRESSION_ASSIST_GRAPH_MODE,
    checkpointMode = process.env.EXPRESSION_ASSIST_GRAPH_CHECKPOINTER
        || (process.env.NODE_ENV === "production" ? "mongo" : "memory"),
    decisionServiceProvider,
    gapServiceProvider = null,
    checkpointFactory = createExpressionAssistCheckpoint,
    logger = (record) => console.info("[expressionAssistGraph]", JSON.stringify(record)),
} = {}) {
    const mode = normalizeExpressionAssistGraphMode(featureMode);
    let resource = null;
    let servicePromise = null;
    async function getService() {
        if (mode === EXPRESSION_ASSIST_GRAPH_MODES.OFF) {
            throw new ExpressionAssistGraphError("Expression Assist graph is disabled", {
                code: "EXPRESSION_ASSIST_GRAPH_DISABLED",
                status: 503,
            });
        }
        if (!servicePromise) {
            servicePromise = (async () => {
                if (typeof decisionServiceProvider !== "function") {
                    throw new ExpressionAssistGraphError("Expression Assist decision service is unavailable", {
                        code: "EXPRESSION_ASSIST_SERVICE_UNAVAILABLE",
                        status: 503,
                    });
                }
                resource = await checkpointFactory({ mode: checkpointMode });
                const decisionService = await decisionServiceProvider();
                if (!decisionService?.decide) {
                    throw new ExpressionAssistGraphError("Expression Assist decision service is disabled", {
                        code: "EXPRESSION_ASSIST_SERVICE_DISABLED",
                        status: 503,
                    });
                }
                const gapService = typeof gapServiceProvider === "function"
                    ? await gapServiceProvider()
                    : null;
                return new ExpressionAssistGraphService({
                    checkpointer: resource.checkpointer,
                    decisionService,
                    gapService,
                    logger,
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
