import express from "express";
import { CompanionIntentError } from "../services/companionIntentService.js";

export function createCompanionIntentRouter({ service, onDecision = () => {} }) {
    if (!service?.evaluate) throw new Error("Companion intent router requires a service");
    const router = express.Router();

    router.post("/", async (req, res) => {
        try {
            const result = await service.evaluate(req.body || {});
            onDecision({ request: req.body || {}, result });
            return res.json(result);
        } catch (error) {
            const status = error instanceof CompanionIntentError ? error.status : 400;
            return res.status(status).json({
                error: error?.message || "Companion intent request failed",
                code: error?.code || "INVALID_COMPANION_INTENT_REQUEST",
            });
        }
    });

    return router;
}
