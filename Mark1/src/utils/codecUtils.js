export function audioFormatForCodec(codec) {
    const codecLower = codec.toLowerCase();
    if (codecLower === 'opus') {
        return 'pcm16';  // Opus uses PCM16 format at 48kHz
    } else if (codecLower === 'pcmu' || codecLower === 'pcma') {
        return 'g711_ulaw';  // 8kHz narrowband (phone quality)
    }
    // Default to PCM16 if unknown codec
    return 'pcm16';
}
/*
*  Gets all audio/video tracks in the WebRTC connection
*  For audio tracks, gets list of supported codecs
*  Filters for Opus at 48kHz
*  Sets Opus as the preferred codec (browser will use it first)
* */
export function applyCodecPreferences(pc, codecParam) {
    // Get all transceivers (audio/video tracks)
    const transceivers = pc.getTransceivers();

    transceivers.forEach((transceiver) => {
        // Only modify audio tracks
        if (transceiver.sender?.track?.kind === 'audio') {

            // Get browser's supported audio codecs
            const capabilities = RTCRtpSender.getCapabilities('audio');
            if (!capabilities || !capabilities.codecs) return;

            let preferredCodecs = capabilities.codecs;

            // Filter for Opus at 48kHz if that's what we want
            if (codecParam === 'opus') {
                preferredCodecs = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() === 'audio/opus' && codec.clockRate === 48000);
            }

            // Apply the codec preference (browser will use this order)
            if (preferredCodecs.length > 0) {
                transceiver.setCodecPreferences(preferredCodecs);
            }
        }
    });
}

