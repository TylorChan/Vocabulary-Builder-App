import express from "express";

export function createVoiceSessionTraceRouter({ store }) {
    if (!store?.append || !store?.list) throw new Error("Voice trace router requires a store");
    const router = express.Router();

    router.post("/events", async (req, res) => {
        const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
        if (!events.length) return res.status(400).json({ error: "events is required" });
        try {
            const paths = await Promise.all(events.map((event) => store.append(event)));
            return res.json({ saved: events.length, filePath: paths.filter(Boolean).at(-1) || null });
        } catch (error) {
            return res.status(400).json({ error: error?.message || "Unable to write voice trace" });
        }
    });

    router.get("/", async (req, res) => {
        try {
            return res.json({ traces: await store.list({ limit: req.query?.limit }) });
        } catch (error) {
            return res.status(500).json({ error: error?.message || "Unable to list voice traces" });
        }
    });

    router.get("/:sessionId", async (req, res) => {
        try {
            const { filePath } = await store.read(req.params.sessionId);
            return res.download(filePath);
        } catch (error) {
            return res.status(error?.code === "ENOENT" ? 404 : 400).json({
                error: error?.message || "Voice trace was not found",
            });
        }
    });

    return router;
}
