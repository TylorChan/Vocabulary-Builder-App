// Global variables
let popupPort = null;
let contentPorts = new Map();
let activeTabId = null;

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


        // Get the currently active tab
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        activeTabId = activeTab?.id;

        // Relay messages from popup to content
        port.onMessage.addListener((msg) => {
            // Send updated state to content Script to trigger the change of playback
            // Only forward to active tab's content script
            if (msg.type === 'MEDIA_CONTROL' && activeTabId) {
                const contentPort = contentPorts.get(activeTabId);
                if (contentPort) {
                    contentPort.postMessage(msg);
                }
            }

            if(msg.type === 'REQUEST_MIC_PERMISSION'){
                const contentPort = contentPorts.get(activeTabId);
                if (contentPort) {
                    contentPort.postMessage(msg);
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

chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});