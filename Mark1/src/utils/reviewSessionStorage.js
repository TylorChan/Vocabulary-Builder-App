import { storageGet, storageRemove, storageSet } from "./chromeStorage";

const keyForUser = (userId) => `reviewSession.pendingUpdates.${userId}`;

// Keep only 1 update per vocabularyId (latest wins)
function upsertByVocabularyId(existing, nextUpdate) {
    const map = new Map(existing.map((u) => [u.vocabularyId, u]));
    map.set(nextUpdate.vocabularyId, nextUpdate);
    return Array.from(map.values());
}

export async function loadPendingReviewUpdates(userId) {
    const k = keyForUser(userId);
    const result = await storageGet([k]);
    return Array.isArray(result[k]) ? result[k] : [];
}

export async function upsertPendingReviewUpdate(userId, update) {
    const existing = await loadPendingReviewUpdates(userId);
    const merged = upsertByVocabularyId(existing, update);
    await storageSet({ [keyForUser(userId)]: merged });
    return merged;
}

export async function clearPendingReviewUpdates(userId) {
    await storageRemove([keyForUser(userId)]);
}
