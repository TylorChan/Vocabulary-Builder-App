// Global variables
let popupPort = null;
let contentPorts = new Map();
let activeTabId = null;
// let deepgramConnection = null;
// let proxySocket = null;


// proxySocket = new WebSocket('ws://localhost:3000');
// let proxyReadyPromise = new Promise(resolve => {
//     proxySocket.onopen = () => {
//         console.log('Connected to proxy');
//         resolve();
//     };
// });

// // Handle transcription from proxy (Deepgram in server.js)
// proxySocket.onmessage = (event) => {
//     console.log("Get transcription from proxy");
//     // const data = JSON.parse(event.data);
//     const { transcript } = JSON.parse(event.data).channel.alternatives[0]
//     console.log(event.data)
//     // Send transcription to content script
//     // if (contentPort && data.channel?.alternatives?.[0]) {
//     //     contentPort.postMessage({
//     //         type: 'TRANSCRIPTION_RESULT',
//     //         transcript: data.channel.alternatives[0].transcript,
//     //         isFinal: data.is_final
//     //     });
//     // }
// };


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
            // TEST communicatetion: service worker <--> popup
            // // console.log("Background received from popup:", msg);
            // if (contentPort) {
            //     console.log("extension messaging to content script");
            //     contentPort.postMessage(msg);
            // }

            // Send updated state to content Script to trigger the change of playback
            // Only forward to active tab's content script
            if (msg.type === 'MEDIA_CONTROL' && activeTabId) {
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