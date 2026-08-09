import path from "node:path";
import { access, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const mark1Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traceDirectory = path.join(mark1Root, "logs", "voice-sessions");
const requestedSessionId = String(process.argv[2] || "").trim();

if (requestedSessionId) {
    if (!/^[a-zA-Z0-9._-]+$/.test(requestedSessionId)) {
        throw new Error("sessionId contains unsupported characters");
    }
    const filePath = path.join(traceDirectory, `${requestedSessionId}.jsonl`);
    await access(filePath);
    console.log(filePath);
    process.exit(0);
}

const names = await readdir(traceDirectory).catch(() => []);
const traces = await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    const filePath = path.join(traceDirectory, name);
    const fileStat = await stat(filePath);
    return { filePath, modifiedAt: fileStat.mtimeMs, size: fileStat.size };
}));

traces.sort((left, right) => right.modifiedAt - left.modifiedAt);
if (!traces.length) {
    console.log(`No voice session traces found in ${traceDirectory}`);
} else {
    traces.slice(0, 10).forEach((trace) => console.log(`${trace.filePath} (${trace.size} bytes)`));
}
