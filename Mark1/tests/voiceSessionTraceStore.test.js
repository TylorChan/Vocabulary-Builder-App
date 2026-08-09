import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    VoiceSessionTraceStore,
    sanitizeVoiceTraceData,
} from "../services/voiceSessionTraceStore.js";

test("voice trace redacts credentials and writes ordered JSONL records", async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mark2-voice-trace-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new VoiceSessionTraceStore({ directory });

    await Promise.all([
        store.append({ sessionId: "session-1", event: "speech_started", data: { token: "secret" } }),
        store.append({ sessionId: "session-1", event: "speech_stopped", data: { turnId: "turn-1" } }),
    ]);

    const records = (await readFile(path.join(directory, "session-1.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse);
    assert.deepEqual(records.map((record) => record.event), ["speech_started", "speech_stopped"]);
    assert.equal(records[0].data.token, "[redacted]");
});

test("voice trace sanitizer bounds nested and long values", () => {
    const sanitized = sanitizeVoiceTraceData({ transcript: "x".repeat(5_000), authorization: "Bearer x" });
    assert.equal(sanitized.transcript.length, 4_000);
    assert.equal(sanitized.authorization, "[redacted]");
});
