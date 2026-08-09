export const REALTIME_RESPONSE_CONTROL_MODES = Object.freeze({
    AUTOMATIC: "automatic",
    MANUAL: "manual",
});

export function isManualResponseMode(mode) {
    return mode === REALTIME_RESPONSE_CONTROL_MODES.MANUAL;
}

export function buildTurnDetectionConfig(mode) {
    const manual = isManualResponseMode(mode);
    return {
        type: "semantic_vad",
        // Free Chat may contain long, pause-heavy turns; wait longer before treating a pause as completion.
        eagerness: manual ? "low" : "auto",
        create_response: !manual,
        interrupt_response: !manual,
    };
}

export function withRealtimeResponseControl(config = {}, mode) {
    return {
        ...config,
        audio: {
            ...(config.audio || {}),
            input: {
                ...(config.audio?.input || {}),
                turnDetection: buildTurnDetectionConfig(mode),
            },
        },
    };
}

export function buildRealtimeSessionConfig({
    inputAudioFormat,
    outputAudioFormat,
    transcriptionModel,
    responseControlMode,
}) {
    return withRealtimeResponseControl({
        audio: {
            input: {
                format: inputAudioFormat,
                transcription: { model: transcriptionModel },
            },
            output: { format: outputAudioFormat },
        },
    }, responseControlMode);
}

export function claimResponseTurn(turnIds, turnId, limit = 100) {
    const normalizedTurnId = String(turnId || "").trim();
    if (!(turnIds instanceof Set) || !normalizedTurnId || turnIds.has(normalizedTurnId)) {
        return false;
    }
    turnIds.add(normalizedTurnId);
    if (turnIds.size > limit) {
        const oldest = turnIds.values().next().value;
        turnIds.delete(oldest);
    }
    return true;
}
