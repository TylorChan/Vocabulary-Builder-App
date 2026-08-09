import express from "express";
import { ReviewGraphError } from "../orchestration/reviewGraph/reviewGraphService.js";

const MAX_LEGACY_PROGRESS_CHARS = 100_000;

function requireRequestText(value, field, maxLength = 320) {
    const text = String(value || "").trim();
    if (!text || text.length > maxLength) {
        throw new ReviewGraphError(`${field} is required and must be ${maxLength} characters or fewer`, {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    return text;
}

function normalizeLegacyProgress(value) {
    if (value == null) return null;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new ReviewGraphError("legacyProgress must be an object", {
            code: "INVALID_REQUEST",
            status: 400,
        });
    }
    if (JSON.stringify(value).length > MAX_LEGACY_PROGRESS_CHARS) {
        throw new ReviewGraphError("legacyProgress is too large", {
            code: "INVALID_REQUEST",
            status: 413,
        });
    }
    return value;
}

function sendReviewGraphError(res, error) {
    const status = error instanceof ReviewGraphError ? error.status : 500;
    const code = error?.code || "REVIEW_GRAPH_ERROR";
    const payload = {
        error: error?.message || "Review graph request failed",
        code,
    };
    if (error instanceof ReviewGraphError && error.details?.controlPacket) {
        payload.revision = error.details.revision;
        payload.controlPacket = error.details.controlPacket;
    }
    return res.status(status).json(payload);
}

export function createReviewGraphRouter({ runtime }) {
    if (!runtime?.getService) throw new Error("createReviewGraphRouter requires a review graph runtime");
    const router = express.Router();

    router.post("/start", async (req, res) => {
        try {
            const userId = requireRequestText(req.body?.userId, "userId");
            const sourceSessionId = requireRequestText(req.body?.sessionId, "sessionId");
            const service = await runtime.getService();
            const result = await service.startRun({
                userId,
                sourceSessionId,
                dueWords: req.body?.dueWords,
                legacyProgress: normalizeLegacyProgress(req.body?.legacyProgress),
                reviewRunId: req.body?.reviewRunId || null,
                restart: req.body?.restart === true,
                eventId: req.body?.eventId,
            });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendReviewGraphError(res, error);
        }
    });

    router.post("/:reviewRunId/events", async (req, res) => {
        try {
            const reviewRunId = requireRequestText(req.params.reviewRunId, "reviewRunId");
            const userId = requireRequestText(req.body?.userId, "userId");
            const sourceSessionId = requireRequestText(req.body?.sessionId, "sessionId");
            const service = await runtime.getService();
            const result = await service.dispatchEvent({
                reviewRunId,
                userId,
                sourceSessionId,
                eventId: req.body?.eventId,
                type: req.body?.type,
                expectedRevision: req.body?.expectedRevision,
                occurredAt: req.body?.occurredAt,
                payload: req.body?.payload,
            });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendReviewGraphError(res, error);
        }
    });

    router.get("/:reviewRunId", async (req, res) => {
        try {
            const reviewRunId = requireRequestText(req.params.reviewRunId, "reviewRunId");
            const userId = requireRequestText(req.query?.userId, "userId");
            const sourceSessionId = requireRequestText(req.query?.sessionId, "sessionId");
            const service = await runtime.getService();
            const result = await service.getRun({ reviewRunId, userId, sourceSessionId });
            return res.json({ ...result, featureMode: runtime.mode });
        } catch (error) {
            return sendReviewGraphError(res, error);
        }
    });

    return router;
}
