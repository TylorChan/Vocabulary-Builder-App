function createEventId() {
    return globalThis.crypto?.randomUUID?.()
        || `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ReviewGraphEventQueue {
    constructor({ sendEvent, onPacket, onError = () => {} }) {
        if (typeof sendEvent !== "function") throw new Error("ReviewGraphEventQueue requires sendEvent");
        this.sendEvent = sendEvent;
        this.onPacket = typeof onPacket === "function" ? onPacket : async () => {};
        this.onError = onError;
        this.reviewRunId = null;
        this.revision = 0;
        this.controlPacket = null;
        this.tail = Promise.resolve();
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
        const reviewRunId = response?.reviewRunId || response?.controlPacket?.reviewRunId;
        if (!reviewRunId) throw new Error("Review graph start response is missing reviewRunId");
        await this.flush();
        this.reviewRunId = reviewRunId;
        this.revision = 0;
        this.controlPacket = null;
        await this.applyResponse(response, { force: true });
        return this.controlPacket;
    }

    enqueue(type, payload = {}, {
        eventId = createEventId(),
        occurredAt = new Date().toISOString(),
    } = {}) {
        if (!this.reviewRunId) {
            return Promise.reject(new Error("Review graph run is not initialized"));
        }

        const operation = async () => {
            let conflictRetries = 0;
            while (true) {
                try {
                    const response = await this.sendEvent({
                        reviewRunId: this.reviewRunId,
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
        return result;
    }

    enqueueObservation(transcript, { occurredAt } = {}) {
        return this.enqueue("USER_TURN_COMPLETED", { transcript }, { occurredAt });
    }

    async flush() {
        await this.tail.catch(() => undefined);
    }

    reset() {
        this.reviewRunId = null;
        this.revision = 0;
        this.controlPacket = null;
        this.tail = Promise.resolve();
    }
}
