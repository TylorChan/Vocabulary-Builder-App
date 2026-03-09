// Global variables
let popupPort = null;
let contentPorts = new Map();
let activeTabId = null;

function isSupportedMediaPage(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname || "";
        return host.endsWith("youtube.com") || host.endsWith("bilibili.com");
    } catch {
        return false;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureContentScript(tabId) {
    if (!tabId) return false;
    if (contentPorts.has(tabId)) return true;

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !isSupportedMediaPage(tab.url)) return false;

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["contentScript.js"],
        });
    } catch (err) {
        // Ignore non-injectable pages or transient race errors
        console.warn("content script injection skipped:", err?.message || err);
        return false;
    }

    // Wait briefly for content script to establish runtime port
    for (let i = 0; i < 12; i++) {
        if (contentPorts.has(tabId)) return true;
        await sleep(100);
    }
    return contentPorts.has(tabId);
}

async function syncActiveTab() {
    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });
    activeTabId = activeTab?.id || null;
    if (popupPort && activeTabId) {
        await ensureContentScript(activeTabId);
    }
}

chrome.runtime.onConnect.addListener(async (port) => {
    console.log("Port connected:", port.name);

    if (port.name === "content-script") {
        const tabId = port.sender?.tab?.id;
        if (tabId) {
            contentPorts.set(tabId, port);

            port.onMessage.addListener((msg) => {
                // Only relay messages from active tab
                if (popupPort && tabId === activeTabId) {
                    popupPort.postMessage(msg);
                }
            });

            port.onDisconnect.addListener(() => {
                contentPorts.delete(tabId);
            });
        }

    }

    if (port.name === "extension-popup") {
        popupPort = port;

        // Get active tab and ensure content script is present without manual refresh
        await syncActiveTab();

        // Relay messages from popup to content
        port.onMessage.addListener(async (msg) => {
            // Send updated state to content Script to trigger the change of playback
            // Only forward to active tab's content script
            if (!activeTabId) {
                await syncActiveTab();
            }

            if (msg.type === "MEDIA_CONTROL" && activeTabId) {
                await ensureContentScript(activeTabId);
                const contentPort = contentPorts.get(activeTabId);
                if (contentPort) {
                    contentPort.postMessage(msg);
                    return;
                }

                // Return deterministic failure instead of silent timeout
                if (msg.type === "MEDIA_CONTROL" && popupPort) {
                    popupPort.postMessage({
                        type: "MEDIA_CONTROL_RESULT",
                        success: false,
                        error: "No media tab content script available"
                    });
                }
            }
        });

        // // Wait for proxy to be ready, then start
        // proxyReadyPromise.then(() => {
        //     console.log('Proxy ready, starting audio capture');
        // });

        port.onDisconnect.addListener(() => {
            popupPort = null;
            activeTabId = null;
        });
    }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    activeTabId = tabId;
    if (popupPort) {
        await ensureContentScript(tabId);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!popupPort) return;
    if (tabId !== activeTabId) return;
    if (info.status !== "complete") return;
    if (!isSupportedMediaPage(tab?.url)) return;
    await ensureContentScript(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    contentPorts.delete(tabId);
    if (activeTabId === tabId) {
        activeTabId = null;
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
