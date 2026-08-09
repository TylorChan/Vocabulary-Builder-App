import express from "express";

const SAFE_NO_ACTION = Object.freeze({
    action: "NO_ACTION",
    selectedVocabularyId: null,
    expression: null,
    definition: null,
    usage: null,
    recast: null,
    reasonCode: "NO_MATERIAL_GAIN",
});

function requiredText(value, field, maxChars = 320) {
    const text = String(value || "").trim();
    if (!text || text.length > maxChars) {
        const error = new Error(`${field} is required and must be ${maxChars} characters or fewer`);
        error.status = 400;
        throw error;
    }
    return text;
}

export function createExpressionAssistRouter({ runtime, logger = console }) {
    if (!runtime?.getService) throw new Error("Expression Assist router requires a runtime");
    const router = express.Router();

    router.post("/decide", async (req, res) => {
        if (!runtime.enabled) {
            return res.json({ ...SAFE_NO_ACTION, diagnostics: { gate: "feature_disabled" } });
        }
        try {
            const service = await runtime.getService();
            return res.json(await service.decide(req.body));
        } catch (error) {
            logger.error?.("Expression Assist route failed", error);
            return res.json({ ...SAFE_NO_ACTION, diagnostics: { gate: "route_failure" } });
        }
    });

    router.post("/index", async (req, res) => {
        try {
            if (!runtime.enabled) return res.status(503).json({ error: "Expression Assist is disabled" });
            const userId = requiredText(req.body?.userId, "userId");
            const vocabularyId = requiredText(req.body?.vocabularyId, "vocabularyId", 220);
            const service = await runtime.getService();
            return res.json(await service.retrievalStore.upsertVocabulary({ userId, vocabularyId }));
        } catch (error) {
            return res.status(error?.status || 500).json({ error: error?.message || "Index update failed" });
        }
    });

    router.delete("/index/:vocabularyId", async (req, res) => {
        try {
            if (!runtime.enabled) return res.status(503).json({ error: "Expression Assist is disabled" });
            const userId = requiredText(req.query?.userId, "userId");
            const vocabularyId = requiredText(req.params?.vocabularyId, "vocabularyId", 220);
            const service = await runtime.getService();
            return res.json(await service.retrievalStore.deleteVocabulary({ userId, vocabularyId }));
        } catch (error) {
            return res.status(error?.status || 500).json({ error: error?.message || "Index delete failed" });
        }
    });

    router.post("/events", async (req, res) => {
        if (!runtime.enabled) return res.status(204).end();
        try {
            const assistRequestId = requiredText(req.body?.assistRequestId, "assistRequestId", 220);
            const event = requiredText(req.body?.event, "event", 80);
            logger.info?.("[ExpressionAssist] client event", {
                assistRequestId,
                event,
                gate: req.body?.gate ? String(req.body.gate).slice(0, 80) : null,
                vocabularyId: req.body?.vocabularyId
                    ? String(req.body.vocabularyId).slice(0, 220)
                    : null,
            });
            return res.status(204).end();
        } catch (error) {
            return res.status(error?.status || 400).json({ error: error.message });
        }
    });

    return router;
}
