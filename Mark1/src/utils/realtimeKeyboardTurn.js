export function buildRealtimeKeyboardTurn({
    message,
    itemId,
    eventId,
    occurredAt,
}) {
    const normalizedMessage = String(message || "").trim();
    const normalizedItemId = String(itemId || "").trim();
    const normalizedEventId = String(eventId || "").trim();
    const normalizedOccurredAt = String(occurredAt || "").trim();

    if (!normalizedMessage) throw new Error("Keyboard message is required");
    if (!normalizedItemId) throw new Error("Keyboard turn itemId is required");
    if (!normalizedEventId) throw new Error("Keyboard turn eventId is required");
    if (!normalizedOccurredAt) throw new Error("Keyboard turn timestamp is required");

    return {
        message: normalizedMessage,
        completedTurn: {
            itemId: normalizedItemId,
            transcript: normalizedMessage,
            occurredAt: normalizedOccurredAt,
        },
        eventData: {
            event_id: normalizedEventId,
            item: {
                id: normalizedItemId,
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: normalizedMessage }],
            },
        },
    };
}
