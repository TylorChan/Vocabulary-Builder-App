if (!globalThis.__MARKII_CONTENT_SCRIPT_READY__) {
globalThis.__MARKII_CONTENT_SCRIPT_READY__ = true;

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
            title: navigator.mediaSession?.metadata?.title || document.title,
            pageUrl: window.location.href
        });
    }, 500);
}

function stopUpdates() {
    clearInterval(updateInterval);
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
            duration: media.duration,
            pageUrl: window.location.href
        };

    } catch (e) {
        return {success: false, error: e.message};
    }
}

}
