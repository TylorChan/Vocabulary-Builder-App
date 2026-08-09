import path from "node:path";
import process from "node:process";
import { mkdir, readFile, readdir, stat, appendFile } from "node:fs/promises";

const REDACTED_KEY = /(authorization|api[-_]?key|cookie|password|secret|token)/i;
const MAX_STRING_CHARS = 4_000;

export function normalizeVoiceTraceSessionId(value) {
    const sessionId = String(value || "").trim();
    if (!sessionId || sessionId.length > 160 || !/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
        throw new Error("A valid voice trace sessionId is required");
    }
    return sessionId;
}

export function sanitizeVoiceTraceData(value, depth = 0) {
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value.slice(0, MAX_STRING_CHARS);
    if (depth >= 4) return "[depth-limited]";
    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizeVoiceTraceData(item, depth + 1));
    }
    if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [
            key,
            REDACTED_KEY.test(key) ? "[redacted]" : sanitizeVoiceTraceData(item, depth + 1),
        ]));
    }
    return String(value).slice(0, MAX_STRING_CHARS);
}

export class VoiceSessionTraceStore {
    constructor({
        enabled = true,
        directory = path.resolve(process.cwd(), "logs", "voice-sessions"),
    } = {}) {
        this.enabled = enabled;
        this.directory = directory;
        this.writeChains = new Map();
    }

    filePath(sessionId) {
        return path.join(this.directory, `${normalizeVoiceTraceSessionId(sessionId)}.jsonl`);
    }

    append({ sessionId, source = "unknown", event, occurredAt, data = {} }) {
        if (!this.enabled) return Promise.resolve(null);
        const normalizedSessionId = normalizeVoiceTraceSessionId(sessionId);
        const normalizedEvent = String(event || "").trim().slice(0, 160);
        if (!normalizedEvent) return Promise.reject(new Error("Voice trace event is required"));
        const record = {
            occurredAt: occurredAt || new Date().toISOString(),
            sessionId: normalizedSessionId,
            source: String(source || "unknown").slice(0, 80),
            event: normalizedEvent,
            data: sanitizeVoiceTraceData(data),
        };
        const filePath = this.filePath(normalizedSessionId);
        const previous = this.writeChains.get(normalizedSessionId) || Promise.resolve();
        const next = previous.catch(() => undefined).then(async () => {
            await mkdir(this.directory, { recursive: true });
            await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
            return filePath;
        });
        this.writeChains.set(normalizedSessionId, next);
        return next.finally(() => {
            if (this.writeChains.get(normalizedSessionId) === next) {
                this.writeChains.delete(normalizedSessionId);
            }
        });
    }

    async read(sessionId) {
        const filePath = this.filePath(sessionId);
        return { filePath, content: await readFile(filePath, "utf8") };
    }

    async list({ limit = 20 } = {}) {
        await mkdir(this.directory, { recursive: true });
        const names = (await readdir(this.directory)).filter((name) => name.endsWith(".jsonl"));
        const entries = await Promise.all(names.map(async (name) => {
            const filePath = path.join(this.directory, name);
            const fileStat = await stat(filePath);
            return {
                sessionId: name.slice(0, -".jsonl".length),
                filePath,
                size: fileStat.size,
                modifiedAt: fileStat.mtime.toISOString(),
            };
        }));
        return entries
            .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
            .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
    }
}

export function createVoiceSessionTraceStore(options) {
    return new VoiceSessionTraceStore(options);
}
