import assert from "node:assert/strict";
import test from "node:test";
import {OpenAIRealtimeWebSocket} from "@openai/agents/realtime";
import {
    buildRealtimeSessionConfig,
    buildTurnDetectionConfig,
    claimResponseTurn,
    REALTIME_RESPONSE_CONTROL_MODES,
    withRealtimeResponseControl,
} from "../src/utils/realtimeResponseControl.js";
import {
    appendRealtimeTranscriptDelta,
    extractRealtimeMessageText,
    sanitizeRealtimeError,
} from "../src/utils/realtimeTranscript.js";

test("manual Free Chat keeps VAD but disables automatic creation and interruption", () => {
    assert.deepEqual(buildTurnDetectionConfig(REALTIME_RESPONSE_CONTROL_MODES.MANUAL), {
        type: "semantic_vad",
        eagerness: "low",
        create_response: false,
        interrupt_response: false,
    });
    const automatic = buildTurnDetectionConfig(REALTIME_RESPONSE_CONTROL_MODES.AUTOMATIC);
    assert.equal(automatic.eagerness, "auto");
    assert.equal(automatic.create_response, true);
    assert.equal(automatic.interrupt_response, true);
});

test("a completed turn can claim response creation only once", () => {
    const claimedTurns = new Set();
    assert.equal(claimResponseTurn(claimedTurns, "turn-1"), true);
    assert.equal(claimResponseTurn(claimedTurns, "turn-1"), false);
    assert.equal(claimedTurns.size, 1);
});

test("initial SDK config uses audio.input.turnDetection instead of an ignored API key", () => {
    const config = buildRealtimeSessionConfig({
        inputAudioFormat: "pcm16",
        outputAudioFormat: "pcm16",
        transcriptionModel: "transcribe-model",
        responseControlMode: REALTIME_RESPONSE_CONTROL_MODES.MANUAL,
    });

    assert.equal(config.turn_detection, undefined);
    assert.equal(config.audio.input.turnDetection.create_response, false);
    assert.equal(config.audio.input.turnDetection.interrupt_response, false);
    assert.equal(config.audio.input.transcription.model, "transcribe-model");
});

test("the installed SDK serializes a valid semantic VAD session update", () => {
    const transport = new OpenAIRealtimeWebSocket();
    const config = buildRealtimeSessionConfig({
        inputAudioFormat: "pcm16",
        outputAudioFormat: "pcm16",
        transcriptionModel: "transcribe-model",
        responseControlMode: REALTIME_RESPONSE_CONTROL_MODES.MANUAL,
    });
    const rawConfig = transport._getMergedSessionConfig(config);

    assert.deepEqual(rawConfig.audio.input.transcription, {model: "transcribe-model"});
    assert.deepEqual(rawConfig.audio.input.turn_detection, {
        type: "semantic_vad",
        create_response: false,
        eagerness: "low",
        interrupt_response: false,
    });
});

test("mode changes preserve the complete SDK config", () => {
    const config = withRealtimeResponseControl({
        audio: {
            input: {
                format: "pcm16",
                transcription: {model: "transcribe-model"},
            },
        },
    }, "manual");

    assert.equal(config.audio.input.turnDetection.create_response, false);
    assert.equal(config.audio.input.transcription.model, "transcribe-model");
    assert.equal("threshold" in config.audio.input.turnDetection, false);
    assert.equal("prefix_padding_ms" in config.audio.input.turnDetection, false);
    assert.equal("silence_duration_ms" in config.audio.input.turnDetection, false);
});

test("Realtime history extracts current SDK audio and text content types", () => {
    assert.equal(extractRealtimeMessageText([
        {type: "input_audio", transcript: "user audio"},
        {type: "output_audio", transcript: "assistant audio"},
        {type: "output_text", text: "assistant text"},
    ]), "user audio\nassistant audio\nassistant text");
    assert.equal(extractRealtimeMessageText([
        {type: "audio", transcript: "legacy audio"},
    ]), "legacy audio");
});

test("input transcription deltas merge without leaking raw error payloads", () => {
    assert.equal(appendRealtimeTranscriptDelta("hello ", "world"), "hello world");
    assert.deepEqual(sanitizeRealtimeError({
        type: "invalid_request_error",
        code: "invalid_value",
        message: "Invalid turn detection config",
        secret: "do-not-log",
    }), {
        type: "invalid_request_error",
        code: "invalid_value",
        message: "Invalid turn detection config",
    });
});
