const keyForUser = (userId) => `reviewSession.pendingUpdates.${userId}`;

function storageGet(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            const err = chrome.runtime?.lastError;
            if (err) reject(new Error(err.message));
            else resolve(result);
        });
    });
}

function storageSet(obj) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(obj, () => {
            const err = chrome.runtime?.lastError;
            if (err) reject(new Error(err.message));
            else resolve();
        });
    });
}

function storageRemove(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            const err = chrome.runtime?.lastError;
            if (err) reject(new Error(err.message));
            else resolve();
        });
    });
}

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