const DEFAULT_TURN_SETTLE_MS = 1_000;

function normalizeSettleMs(value) {
    const parsed = Number(value ?? DEFAULT_TURN_SETTLE_MS);
    return Number.isFinite(parsed)
        ? Math.max(300, Math.min(3_000, parsed))
        : DEFAULT_TURN_SETTLE_MS;
}

function compactTranscript(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

export class RealtimeTurnBuffer {
    constructor({
        settleMs = DEFAULT_TURN_SETTLE_MS,
        onFlush,
        setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
        clearTimer = (timerId) => globalThis.clearTimeout(timerId),
    } = {}) {
        if (typeof onFlush !== "function") {
            throw new Error("RealtimeTurnBuffer requires onFlush");
        }
        this.settleMs = normalizeSettleMs(settleMs);
        this.onFlush = onFlush;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.parts = [];
        this.itemIds = new Set();
        this.timerId = null;
        this.userSpeaking = false;
    }

    add(turn) {
        const itemId = String(turn?.itemId || "").trim();
        const transcript = compactTranscript(turn?.transcript);
        if (!itemId || !transcript || this.itemIds.has(itemId)) return false;
        this.itemIds.add(itemId);
        this.parts.push({
            itemId,
            transcript,
            occurredAt: turn?.occurredAt || new Date().toISOString(),
        });
        this.schedule();
        return true;
    }

    markSpeechStarted() {
        this.userSpeaking = true;
        this.cancelTimer();
    }

    markSpeechStopped() {
        this.userSpeaking = false;
        this.schedule();
    }

    schedule() {
        this.cancelTimer();
        if (this.userSpeaking || !this.parts.length) return;
        this.timerId = this.setTimer(() => {
            this.timerId = null;
            this.flush();
        }, this.settleMs);
    }

    flush() {
        if (this.userSpeaking || !this.parts.length) return null;
        this.cancelTimer();
        const parts = this.parts;
        this.parts = [];
        this.itemIds.clear();
        const latest = parts.at(-1);
        const result = {
            itemId: latest.itemId,
            itemIds: parts.map((part) => part.itemId),
            transcript: parts.map((part) => part.transcript).join(" "),
            occurredAt: latest.occurredAt,
            segmentCount: parts.length,
        };
        this.onFlush(result);
        return result;
    }

    cancelTimer() {
        if (this.timerId == null) return;
        this.clearTimer(this.timerId);
        this.timerId = null;
    }

    reset() {
        this.cancelTimer();
        this.parts = [];
        this.itemIds.clear();
        this.userSpeaking = false;
    }
}

export class RealtimeResponseArbiter {
    constructor({ sendResponse, interruptOutput, onTrace = () => {} } = {}) {
        if (typeof sendResponse !== "function") {
            throw new Error("RealtimeResponseArbiter requires sendResponse");
        }
        this.sendResponse = sendResponse;
        this.interruptOutput = typeof interruptOutput === "function" ? interruptOutput : () => {};
        this.onTrace = onTrace;
        this.epoch = 0;
        this.userSpeaking = false;
        this.responsePending = false;
        this.responseActive = false;
        this.assistantSpeaking = false;
        this.pending = null;
        this.turnEpochs = new Map();
        this.respondedTurnIds = new Set();
    }

    registerTurn(turnId) {
        const normalizedTurnId = String(turnId || "").trim();
        if (!normalizedTurnId) return null;
        this.turnEpochs.set(normalizedTurnId, this.epoch);
        this.prune(this.turnEpochs);
        return this.epoch;
    }

    isCurrentTurn(turnId) {
        const normalizedTurnId = String(turnId || "").trim();
        return Boolean(
            normalizedTurnId
            && this.turnEpochs.get(normalizedTurnId) === this.epoch
        );
    }

    beginUserSpeech() {
        this.epoch += 1;
        this.userSpeaking = true;
        const interrupted = this.responsePending || this.responseActive || this.assistantSpeaking;
        this.pending = null;
        this.responsePending = false;
        if (interrupted) this.interruptOutput();
        this.onTrace("response_epoch_superseded", { epoch: this.epoch, interrupted });
        return { epoch: this.epoch, interrupted };
    }

    endUserSpeech() {
        this.userSpeaking = false;
        return this.pump();
    }

    request(request) {
        const turnId = String(request?.turnId || "").trim();
        if (!turnId) return { ok: false, reason: "turn_id_required" };
        const turnEpoch = this.turnEpochs.get(turnId);
        if (turnEpoch == null || turnEpoch !== this.epoch) {
            return { ok: false, reason: "stale_turn" };
        }
        if (this.respondedTurnIds.has(turnId)) {
            return { ok: false, reason: "response_already_requested" };
        }
        this.pending = { ...request, turnId, epoch: turnEpoch };
        const dispatched = this.pump();
        return { ok: true, queued: !dispatched, dispatched };
    }

    markResponseCreated() {
        this.responsePending = false;
        this.responseActive = true;
    }

    markResponseDone() {
        this.responsePending = false;
        this.responseActive = false;
        return this.pump();
    }

    markResponseFailed(turnId = null) {
        this.responsePending = false;
        this.responseActive = false;
        if (turnId) this.respondedTurnIds.delete(turnId);
        return this.pump();
    }

    markAssistantSpeaking(value) {
        this.assistantSpeaking = Boolean(value);
        return this.assistantSpeaking ? false : this.pump();
    }

    pump() {
        if (
            !this.pending
            || this.userSpeaking
            || this.responsePending
            || this.responseActive
            || this.assistantSpeaking
        ) return false;
        const next = this.pending;
        this.pending = null;
        if (next.epoch !== this.epoch) {
            this.onTrace("response_discarded", { turnId: next.turnId, reason: "stale_epoch" });
            return false;
        }
        try {
            this.sendResponse(next);
            this.responsePending = true;
            this.respondedTurnIds.add(next.turnId);
            this.prune(this.respondedTurnIds);
            this.onTrace("response_dispatched", { turnId: next.turnId, epoch: next.epoch });
            return true;
        } catch (error) {
            this.onTrace("response_dispatch_failed", {
                turnId: next.turnId,
                message: error?.message || String(error),
            });
            throw error;
        }
    }

    prune(collection, limit = 100) {
        while (collection.size > limit) {
            collection.delete(collection.keys().next().value);
        }
    }

    reset() {
        this.epoch = 0;
        this.userSpeaking = false;
        this.responsePending = false;
        this.responseActive = false;
        this.assistantSpeaking = false;
        this.pending = null;
        this.turnEpochs.clear();
        this.respondedTurnIds.clear();
    }
}

export function readRealtimeTurnSettleMs(value = import.meta.env?.VITE_REALTIME_TURN_SETTLE_MS) {
    return normalizeSettleMs(value);
}
