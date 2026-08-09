import express from "express";
import { ExpressionAssistGraphError } from "../orchestration/expressionAssistGraph/expressionAssistGraphService.js";

function requireText(value, field, maxLength = 320) {
    const text = String(value || "").trim();
    if (!text || text.length > maxLength) {
        throw new ExpressionAssistGraphError(`${field} is required`, {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    return text;
}
function sendError(res, error) {
    const status = error instanceof ExpressionAssistGraphError ? error.status : 500;
    const payload = {
        error: error?.message || "Expression Assist graph request failed",
        code: error?.code || "EXPRESSION_ASSIST_GRAPH_ERROR",
    };
    if (error instanceof ExpressionAssistGraphError && error.details?.controlPacket) {
        payload.revision = error.details.revision;
        payload.controlPacket = error.details.controlPacket;
    }
    return res.status(status).json(payload);
}

export function createExpressionAssistGraphRouter({ runtime }) {
    if (!runtime?.getService) throw new Error("Expression Assist graph router requires a runtime");
    const router = express.Router();
    router.post("/start", async (req, res) => {
        try {
            const service = await runtime.getService();
            const result = await service.startRun({
                userId: requireText(req.body?.userId, "userId"),
                sourceSessionId: requireText(req.body?.sessionId, "sessionId"),
                assistRunId: req.body?.assistRunId || null,
                restart: req.body?.restart === true,
                eventId: req.body?.eventId,
            });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendError(res, error);
        }
    });
    router.post("/:assistRunId/events", async (req, res) => {
        try {
            const service = await runtime.getService();
            const result = await service.dispatchEvent({
                assistRunId: requireText(req.params.assistRunId, "assistRunId"),
                userId: requireText(req.body?.userId, "userId"),
                sourceSessionId: requireText(req.body?.sessionId, "sessionId"),
                eventId: req.body?.eventId,
                type: req.body?.type,
                expectedRevision: req.body?.expectedRevision,
                payload: req.body?.payload,
                occurredAt: req.body?.occurredAt,
            });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendError(res, error);
        }
    });
    router.get("/:assistRunId", async (req, res) => {
        try {
            const service = await runtime.getService();
            const result = await service.getRun({
                assistRunId: requireText(req.params.assistRunId, "assistRunId"),
                userId: requireText(req.query?.userId, "userId"),
                sourceSessionId: requireText(req.query?.sessionId, "sessionId"),
            });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendError(res, error);
        }
    });
    return router;
}
