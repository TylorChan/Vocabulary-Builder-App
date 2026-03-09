function hasChromeStorage() {
    return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

function parseStoredValue(raw) {
    if (raw == null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function storageGet(keys) {
    if (hasChromeStorage()) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                const err = chrome.runtime?.lastError;
                if (err) reject(new Error(err.message));
                else resolve(result);
            });
        });
    }

    const keyList = Array.isArray(keys) ? keys : [keys];
    const result = {};
    for (const key of keyList) {
        result[key] = parseStoredValue(localStorage.getItem(key));
    }
    return Promise.resolve(result);
}

export function storageSet(obj) {
    if (hasChromeStorage()) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(obj, () => {
                const err = chrome.runtime?.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
    }

    Object.entries(obj).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
    });
    return Promise.resolve();
}

export function storageRemove(keys) {
    if (hasChromeStorage()) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
                const err = chrome.runtime?.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
    }

    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach((key) => localStorage.removeItem(key));
    return Promise.resolve();
}
