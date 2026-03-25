import { useState, useEffect, useRef, useCallback } from 'react';
import playButton from '../assets/play-button.png';
import pauseButton from '../assets/pause.png';
import DefinitionPopup from './DefinitionPopup';
import WordListOverlay from "./WordListOverlay";
import { API_BASE_URL, DEEPGRAM_RELAY_WS_URL } from "../config/apiConfig";
import {
  fetchVocabularyEntries,
  updateVocabularyDueDate,
  deleteVocabularyEntry,
} from "../utils/graphql";
import { formatLocalDateTime } from "../utils/dateTime";

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, "")
    .trim();
}

function TrackCaption({ onNavigateToVoiceAgent, userId }) {
  // const [connectStatus, setConnectStatus] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [transcription, setTranscription] = useState("");
  const [transStatus, setTransStatus] = useState("idle");
  const [mediaState, setMediaState] = useState({
    playing: false,
    currentTime: 0,
    duration: 0,
    title: "",
    pageUrl: "",
  });
  const [wordListOpen, setWordListOpen] = useState(false);
  const [wordEntries, setWordEntries] = useState([]);
  const [wordListLoading, setWordListLoading] = useState(false);
  const [wordListError, setWordListError] = useState("");
  const [lastPausedSourceUrl, setLastPausedSourceUrl] = useState("");
  const [loading, setLoading] = useState(false)
  const portRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const captureStreamRef = useRef(null);
  const socketProxy = useRef(null);
  const keepAliveIntervalRef = useRef(null); // store the interval ID for keep-alive message sending
  const isPlayingRef = useRef(false);
  const mediaStateRef = useRef(mediaState);
  const streamStartVideoTimeRef = useRef(0);
  const lagEmaRef = useRef(1.2);
  const wordAnchorsRef = useRef([]);

  useEffect(() => {
    portRef.current = chrome.runtime.connect({ name: "extension-popup" });

    // Listen media control playback state
    portRef.current.onMessage.addListener(function (msg) {
      if (msg.type === 'MEDIA_STATE' || msg.type === 'MEDIA_CONTROL_RESULT') {
        // console.log(msg)
        setMediaState(prev => ({
          playing: msg.playing ?? prev.playing,
          currentTime: msg.currentTime ?? prev.currentTime,
          duration: msg.duration ?? prev.duration,
          title: msg.title ?? prev.title,
          pageUrl: msg.pageUrl ?? prev.pageUrl,
        }));
      }
    });

    return () => {
      stopCapture()
      portRef.current?.disconnect();
      portRef.current = null;
    }
  }, []);

  // Stop sending data to deepgram when the audio is paused. Then
  // start to send keep-alive message
  useEffect(() => {
    if (!mediaRecorderRef.current || transStatus === 'idle') return;

    if (mediaState.playing) {
      // Clear KeepAlive when resuming
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
        console.log('KeepAlive stopped');
      }

      if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
        console.log('Audio capture resumed');
      }
    } else if (!mediaState.playing && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      console.log('Audio capture paused');

      // Start KeepAlive only if not already running
      if (!keepAliveIntervalRef.current) {
        keepAliveIntervalRef.current = setInterval(() => {
          if (socketProxy.current?.readyState === WebSocket.OPEN) {
            socketProxy.current.send(JSON.stringify({ type: "KeepAlive" }));
            console.log('sending keep alive message to server');
          }
        }, 3000);
      }
    }
  }, [mediaState.playing, transStatus]);

  useEffect(() => {
    isPlayingRef.current = mediaState.playing;
  }, [mediaState.playing]);

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  const buildTimestampedSourceUrl = useCallback((url, currentSeconds) => {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      const sec = Math.max(0, Math.floor(Number(currentSeconds || 0)));
      if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
        parsed.searchParams.set("t", String(sec));
      } else {
        parsed.searchParams.set("t", String(sec));
      }
      return parsed.toString();
    } catch {
      return "";
    }
  }, []);

  const calcLeadInSeconds = useCallback(() => {
    const lag = Number(lagEmaRef.current || 0);
    return Math.max(1, Math.min(3, 1 + lag));
  }, []);

  const fallbackSourceUrl = useCallback(() => {
    const fallbackSec = Math.max(0, Number(mediaState.currentTime || 0) - 2);
    return buildTimestampedSourceUrl(mediaState.pageUrl, fallbackSec);
  }, [buildTimestampedSourceUrl, mediaState.currentTime, mediaState.pageUrl]);

  const pickSourceUrlForSelection = useCallback((selectedText) => {
    const pageUrl = mediaState.pageUrl;
    if (!pageUrl) return "";

    const tokens = String(selectedText || "")
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean);

    if (!tokens.length) {
      return fallbackSourceUrl();
    }

    const anchors = wordAnchorsRef.current || [];
    const leadInSec = calcLeadInSeconds();

    // Try phrase match (latest match wins).
    if (tokens.length > 1) {
      for (let i = anchors.length - tokens.length; i >= 0; i -= 1) {
        let ok = true;
        for (let j = 0; j < tokens.length; j += 1) {
          if (anchors[i + j]?.token !== tokens[j]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const targetSec = Math.max(0, Number(anchors[i]?.videoStartSec || 0) - leadInSec);
          return buildTimestampedSourceUrl(pageUrl, targetSec);
        }
      }
    }

    // Fallback to latest single-token match.
    const tokenSet = new Set(tokens);
    for (let i = anchors.length - 1; i >= 0; i -= 1) {
      if (tokenSet.has(anchors[i]?.token)) {
        const targetSec = Math.max(0, Number(anchors[i]?.videoStartSec || 0) - leadInSec);
        return buildTimestampedSourceUrl(pageUrl, targetSec);
      }
    }

    return fallbackSourceUrl();
  }, [buildTimestampedSourceUrl, calcLeadInSeconds, fallbackSourceUrl, mediaState.pageUrl]);

  useEffect(() => {
    if (transStatus === "idle") return;
    if (mediaState.playing) return;
    const sourceUrl = buildTimestampedSourceUrl(
      mediaState.pageUrl,
      Math.max(0, Number(mediaState.currentTime || 0) - 2)
    );
    if (sourceUrl) {
      setLastPausedSourceUrl(sourceUrl);
    }
  }, [
    buildTimestampedSourceUrl,
    mediaState.currentTime,
    mediaState.pageUrl,
    mediaState.playing,
    transStatus,
  ]);

  const loadWordEntries = useCallback(async () => {
    if (!userId) return;
    setWordListLoading(true);
    setWordListError("");
    try {
      const rows = await fetchVocabularyEntries(userId);
      setWordEntries(rows);
    } catch (err) {
      setWordListError(err?.message || "Failed to load word list");
    } finally {
      setWordListLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!wordListOpen) return;
    loadWordEntries();
  }, [loadWordEntries, wordListOpen]);

  const handleLearnToday = async (vocabularyId) => {
    try {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      await updateVocabularyDueDate(userId, vocabularyId, formatLocalDateTime(end));
      await loadWordEntries();
    } catch (err) {
      setWordListError(err?.message || "Failed to update due date");
    }
  };

  const handleDeleteWord = async (vocabularyId) => {
    try {
      await deleteVocabularyEntry(userId, vocabularyId);
      await loadWordEntries();
    } catch (err) {
      setWordListError(err?.message || "Failed to delete word");
    }
  };

  // Capture audio stream from the web tab
  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (stream.getAudioTracks().length == 0) {
        return alert('You must share your tab with audio. Refresh the page.')
      }

      // console.log(
      //   stream.getAudioTracks()[0]?.enabled,
      //   stream.getAudioTracks()[0]?.muted
      // );

      captureStreamRef.current = stream;

      // If user clicks "Stop sharing" from browser, then reset the app
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          stopCapture();
        };
      });
      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      // Set up MediaRecorder
      streamStartVideoTimeRef.current = Number(mediaState.currentTime || 0);
      lagEmaRef.current = 1.2;
      wordAnchorsRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(audioOnlyStream, {
        mimeType: 'audio/webm'
      });

      socketProxy.current = new WebSocket(DEEPGRAM_RELAY_WS_URL)
      mediaRecorderRef.current.addEventListener('dataavailable', evt => {
        if (evt.data.size > 0 && socketProxy.current.readyState === 1 && isPlayingRef.current) {
          socketProxy.current.send(evt.data)
          // console.log("chunk size:", evt.data.size, "playing:", isPlayingRef.current);
        }
      })

      socketProxy.current.onopen = () => {
        setTransStatus("connecting");
      }

      socketProxy.current.onmessage = async (msg) => {
        let data = msg.data;
        // Convert Blob to text if needed
        // if (data instanceof Blob) {
        //   data = await data.text();
        // }
        let payload;
        try {
          payload = JSON.parse(data);
          if (payload.type === "READY") {
            mediaRecorderRef.current.start(250);
            setTransStatus("start");
            return;
          }
        } catch (e) {
          console.warn("Non-JSON message from server:", data);
          return;
        }
        const transcript = payload?.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          setTranscription(transcript);
        }

        // Build word-level anchors from final results for better source-link jumping.
        const words = payload?.channel?.alternatives?.[0]?.words;
        const isFinal = Boolean(payload?.is_final);
        if (isFinal && Array.isArray(words) && words.length > 0) {
          const base = Number(streamStartVideoTimeRef.current || 0);
          const nowSec = Number(mediaStateRef.current?.currentTime || 0);
          const lastWord = words[words.length - 1];
          const lastEnd = Number(lastWord?.end);
          if (Number.isFinite(lastEnd)) {
            const estEnd = base + lastEnd;
            const lag = Math.max(0, Math.min(4, nowSec - estEnd));
            lagEmaRef.current = (lagEmaRef.current * 0.8) + (lag * 0.2);
          }

          const mapped = words
            .map((w) => {
              const token = normalizeToken(w?.word ?? w?.punctuated_word);
              const start = Number(w?.start);
              const end = Number(w?.end);
              if (!token || !Number.isFinite(start) || !Number.isFinite(end)) return null;
              return {
                token,
                videoStartSec: Math.max(0, base + start),
                videoEndSec: Math.max(0, base + end),
              };
            })
            .filter(Boolean);

          if (mapped.length) {
            const next = [...wordAnchorsRef.current, ...mapped];
            wordAnchorsRef.current = next.slice(-1200);
          }
        }
      }
    } catch (error) {
      console.error('Failed to start capture:', error);
      setTransStatus('idle')
      setTranscription('Oops! Can not connect. Try refreshing the page')
    }
  };

  // Clean up function for audio capture
  const stopCapture = () => {
    setTransStatus('idle')
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (socketProxy.current) {
      socketProxy.current.close();
    }
    setTranscription('')

    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((t) => t.stop());
      captureStreamRef.current = null;
    }
  }

  // Media playback control
  const control = (action) => {
    portRef.current?.postMessage({ type: 'MEDIA_CONTROL', action });
  };

  // Text Selection
  const handleTextSelect = async () => {
    const selection = window.getSelection();
    const tmpText = selection.toString().trim();
    if (tmpText) {
      const bestSourceUrl = pickSourceUrlForSelection(tmpText);
      if (bestSourceUrl) {
        setLastPausedSourceUrl(bestSourceUrl);
      }
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/define`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmpText,
          videoTitle: mediaState.title,
          surroundingText: transcription
        })
      });

      const data = await response.json();
      data.selectedWord = tmpText;
      setSelectedText(data);
      setLoading(false)
    } else {
      setSelectedText('')
    }
  };


  return (
    <div>
      <div className="extension-name">
        <span className="extension-title">
          MARK II
        </span>
      </div>
      <div className="track-caption-container">
        <div className="caption-container">

          {/** Caption is shown here */}
          <span className="transcription-text" onMouseUp={handleTextSelect}>
            {transcription ? transcription : "Start transcription to see captions"}
          </span>

          {loading && <div class="loader"></div>}
          {/** Word/Phrase definition */}
          {selectedText
            &&
            <DefinitionPopup
              selectedText={selectedText}
              videoTitle={mediaState.title}
              surroundingText={transcription}
              sourceVideoUrl={lastPausedSourceUrl}
              userId={userId}
              onClose={() => setSelectedText("")}
              onSaved={() => {
                if (wordListOpen) {
                  loadWordEntries();
                }
              }}
            />
          }
        </div>

        {/** Media playback control */}
        <div className="media-controls">
          <button className="media-controls-button" onClick={() => control('seekbackward')}> - 15s</button>
          <button className="media-controls-button" onClick={() => control('playpause')}>
            <img
              src={mediaState.playing ? pauseButton : playButton}
              alt={mediaState.playing ? 'Pause' : 'Play'}
              className="playback-icon"
            />
          </button>
          <button className="media-controls-button" onClick={() => control('seekforward')}> + 15s</button>
          {/** Live Transcription */}
          {transStatus === 'idle' ?
            <button id="start" onClick={startCapture} className="trans-button">
              <span>Transcription</span>
              <span>Off</span>
            </button>
            :
          <button id="stop" onClick={stopCapture} className="trans-button active">
              <span>Transcription</span>
              <span>On</span>
            </button>
          }
          <button className="review-button" onClick={() => setWordListOpen((prev) => !prev)}>
            <span>Your</span>
            <span>Word List</span>
          </button>
          <button className="review-button" onClick={onNavigateToVoiceAgent}>
            <span>Practice</span>
            <span>with AI</span>
          </button>
        </div>
        {wordListOpen ? (
          <WordListOverlay
            entries={wordEntries}
            loading={wordListLoading}
            error={wordListError}
            open={wordListOpen}
            variant="initial"
            reviewModeLabel=""
            reviewStatusByWordId={{}}
            disableEditing={false}
            disableEditingHint=""
            onLearnToday={handleLearnToday}
            onDelete={handleDeleteWord}
            onClose={() => setWordListOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

export default TrackCaption;
