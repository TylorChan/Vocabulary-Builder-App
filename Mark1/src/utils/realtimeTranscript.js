export const USER_TRANSCRIPTION_PENDING_TEXT = "[Transcribing..]";
export const USER_TRANSCRIPTION_FAILED_TEXT = "[Transcription failed]";
export const USER_TRANSCRIPTION_INAUDIBLE_TEXT = "[inaudible]";

const TEXT_CONTENT_TYPES = new Set(["input_text", "output_text"]);
const AUDIO_CONTENT_TYPES = new Set(["input_audio", "output_audio", "audio"]);

export function extractRealtimeMessageText(content = []) {
    if (!Array.isArray(content)) return "";

    return content
        .map((part) => {
            if (!part || typeof part !== "object") return "";
            if (TEXT_CONTENT_TYPES.has(part.type)) return part.text ?? "";
            if (AUDIO_CONTENT_TYPES.has(part.type)) return part.transcript ?? "";
            return "";
        })
        .filter(Boolean)
        .join("\n");
}

export function appendRealtimeTranscriptDelta(currentText, deltaText) {
    return `${String(currentText || "")}${String(deltaText || "")}`;
}

export function sanitizeRealtimeError(error) {
    const source = error && typeof error === "object"
        ? error
        : {message: String(error || "Unknown Realtime error")};
    const sanitized = {};

    for (const key of ["type", "code", "param", "message", "event_id"]) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
            sanitized[key] = source[key];
        }
    }

    return sanitized;
}
