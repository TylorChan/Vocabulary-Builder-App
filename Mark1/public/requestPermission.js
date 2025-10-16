// This runs inside the iframe
(async () => {
    try {
        console.log('[Mic Permission] Requesting microphone access...');

        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        console.log('[Mic Permission] Permission granted!');

        // Stop the stream immediately (we just needed the permission)
        stream.getTracks().forEach(track => track.stop());

        // Notify parent that permission was granted
        window.parent.postMessage({ type: 'MIC_PERMISSION_GRANTED' }, '*');

    } catch (error) {
        console.error('[Mic Permission] Permission denied:', error);

        // Notify parent that permission was denied
        window.parent.postMessage({
            type: 'MIC_PERMISSION_DENIED',
            error: error.message
        }, '*');
    }
})();