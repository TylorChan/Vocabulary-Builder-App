let isPopupOpen = false;
let updateInterval;

var port = chrome.runtime.connect({name: "content-script"});
port.onMessage.addListener(function (msg) {
    // TEST communicatetion: content script <--> service worker
    // console.log("Message from extension:", msg.text);
    // isPopupOpen = true
    // if (isPopupOpen) {
    //     port.postMessage({ text: "Aloha from content script" });
    // }

    if (msg.type === 'MEDIA_CONTROL') {
        const result = controlMedia(msg.action);
        port.postMessage({type: 'MEDIA_CONTROL_RESULT', ...result});
    }

    // Handle microphone permission request
    if (msg.type === 'REQUEST_MIC_PERMISSION') {
        // console.log('[Content Script] Received mic permission request');

        requestMicrophonePermission()
            .then(() => {
                port.postMessage({
                    type: 'MIC_PERMISSION_RESULT',
                    success: true
                });
            })
            .catch((error) => {
                port.postMessage({
                    type: 'MIC_PERMISSION_RESULT',
                    success: false,
                    error: error.message
                });
            });
    }

});

// Sync real playback with React UI
// Only update when tab is visible to save CPU resources
function startUpdates() {
    updateInterval = setInterval(() => {
        const media = document.querySelector('video, audio');
        if (!media) return;

        port.postMessage({
            type: 'MEDIA_STATE',
            playing: !media.paused,
            currentTime: media.currentTime,
            duration: media.duration,
            title: navigator.mediaSession?.metadata?.title || document.title
        });
    }, 500);
}

function stopUpdates() {
    clearInterval(updateInterval);
}

// Add this function to request microphone permission via iframe
function requestMicrophonePermission() {
    return new Promise((resolve, reject) => {
        // Check if iframe already exists
        if (document.getElementById('vocab-mic-permission-iframe')) {
            // console.log('[Content Script] Permission iframe already exists');
            resolve();
            return;
        }

        // console.log('[Content Script] Creating permission iframe...');

        // Create invisible iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'vocab-mic-permission-iframe';
        iframe.setAttribute('allow', 'microphone');  // IMPORTANT: Allow microphone access
        iframe.src = chrome.runtime.getURL('micPermission.html');
        iframe.style.display = 'none'; // Invisible

        // Listen for messages from iframe
        const messageHandler = (event) => {
            if (event.data.type === 'MIC_PERMISSION_GRANTED') {
                // console.log('[Content Script] Microphone permission granted!');
                window.removeEventListener('message', messageHandler);

                // Remove iframe after 1 second
                setTimeout(() => {
                    iframe.remove();
                }, 1000);

                resolve();
            } else if (event.data.type === 'MIC_PERMISSION_DENIED') {
                console.error('[Content Script] Microphone permission denied');
                window.removeEventListener('message', messageHandler);
                iframe.remove();
                reject(new Error('Microphone permission denied'));
            }
        };

        window.addEventListener('message', messageHandler);

        // Inject iframe into page
        document.body.appendChild(iframe);

        // Timeout after 30 seconds
        setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            iframe.remove();
            reject(new Error('Permission request timeout'));
        }, 30000);
    });
}


// Start/stop based on visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopUpdates();
    } else {
        startUpdates();
    }
});

// Start if visible
if (!document.hidden) {
    startUpdates();
}

// Playback control
function controlMedia(action) {
    const media = document.querySelector('video, audio');
    if (!media) return {success: false, error: 'No media found'};

    try {
        switch (action) {
            case 'playpause':
                media.paused ? media.play() : media.pause();
                break;
            case 'seekbackward':
                media.currentTime = Math.max(0, media.currentTime - 15);
                break;
            case 'seekforward':
                media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 15);
                break;
        }

        return {
            success: true,
            playing: !media.paused,
            currentTime: media.currentTime,
            duration: media.duration
        };

    } catch (e) {
        return {success: false, error: e.message};
    }
}

