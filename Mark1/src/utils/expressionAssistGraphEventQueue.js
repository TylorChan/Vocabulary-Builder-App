function createEventId() {
    return globalThis.crypto?.randomUUID?.()
        || `expression-assist-graph-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ExpressionAssistGraphEventQueue {
    constructor({ sendEvent, onPacket, onError = () => {} }) {
        if (typeof sendEvent !== "function") {
            throw new Error("ExpressionAssistGraphEventQueue requires sendEvent");
        }
        this.sendEvent = sendEvent;
        this.onPacket = typeof onPacket === "function" ? onPacket : async () => {};
        this.onError = onError;
        this.assistRunId = null;
        this.revision = 0;
        this.controlPacket = null;
        this.tail = Promise.resolve();
        this.pendingEventCount = 0;
    }

    async applyResponse(response, { force = false } = {}) {
        const packet = response?.controlPacket || null;
        const packetRevision = Number(packet?.revision ?? response?.revision ?? -1);
        if (!Number.isInteger(packetRevision) || packetRevision < 0) return false;
        if (!force && packetRevision < this.revision) return false;
        if (!force && packetRevision === this.revision && this.controlPacket) return false;

        this.revision = packetRevision;
        if (packet) {
            this.controlPacket = packet;
            await this.onPacket(packet, response);
        }
        return true;
    }

    async setRun(response) {
        const assistRunId = response?.assistRunId || response?.controlPacket?.assistRunId;
        if (!assistRunId) throw new Error("Expression Assist graph response is missing assistRunId");
        await this.flush();
        this.assistRunId = assistRunId;
        this.revision = 0;
        this.controlPacket = null;
        await this.applyResponse(response, { force: true });
        return this.controlPacket;
    }

    enqueue(type, payload = {}, {
        eventId = createEventId(),
        occurredAt = new Date().toISOString(),
    } = {}) {
        if (!this.assistRunId) {
            return Promise.reject(new Error("Expression Assist graph run is not initialized"));
        }
        this.pendingEventCount += 1;
        const operation = async () => {
            let conflictRetries = 0;
            while (true) {
                try {
                    const response = await this.sendEvent({
                        assistRunId: this.assistRunId,
                        eventId,
                        type,
                        expectedRevision: this.revision,
                        payload,
                        occurredAt,
                    });
                    await this.applyResponse(response);
                    return response;
                } catch (error) {
                    if (error?.controlPacket) {
                        await this.applyResponse({
                            revision: error.controlPacket.revision,
                            controlPacket: error.controlPacket,
                        });
                    }
                    if (error?.code === "REVISION_CONFLICT" && conflictRetries < 1) {
                        conflictRetries += 1;
                        continue;
                    }
                    this.onError(error, { eventId, type, payload });
                    throw error;
                }
            }
        };
        const result = this.tail.catch(() => undefined).then(operation);
        this.tail = result;
        return result.finally(() => {
            this.pendingEventCount = Math.max(0, this.pendingEventCount - 1);
        });
    }

    enqueueTurn(payload, options = {}) {
        return this.enqueue("FREE_CHAT_TURN_COMPLETED", payload, options);
    }

    hasPendingEvents() {
        return this.pendingEventCount > 0;
    }

    async flush() {
        await this.tail.catch(() => undefined);
    }

    reset() {
        this.assistRunId = null;
        this.revision = 0;
        this.controlPacket = null;
        this.tail = Promise.resolve();
        this.pendingEventCount = 0;
    }
}
