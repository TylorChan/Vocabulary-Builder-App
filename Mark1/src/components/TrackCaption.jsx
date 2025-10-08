import { useState, useEffect, useRef } from 'react';
import playButton from '../assets/play-button.png';
import pauseButton from '../assets/pause.png';
import DefinitionPopup from './DefinitionPopup';

function TrackCaption() {
  // const [connectStatus, setConnectStatus] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [transcription, setTranscription] = useState("");
  const [transStatus, setTransStatus] = useState("idle");
  const [mediaState, setMediaState] = useState({
    playing: false,
    currentTime: 0,
    duration: 0,
    title: ""
  });
  const [loading, setLoading] = useState(false)
  const portRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const socketProxy = useRef(null);
  const keepAliveIntervalRef = useRef(null); // store the interval ID for keep-alive message sending

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
          title: msg.title ?? prev.title
        }));
      }
    });

    return () => {
      stopCapture()
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

  // Capture audio stream from the web tab
  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (stream.getAudioTracks().length == 0) {
        return alert('You must share your tab with audio. Refresh the page.')
      }
      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      // Set up MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(audioOnlyStream, {
        mimeType: 'audio/webm'
      });

      socketProxy.current = new WebSocket('ws://localhost:3000')
      mediaRecorderRef.current.addEventListener('dataavailable', evt => {
        if (evt.data.size > 0 && socketProxy.current.readyState == 1 && mediaState.playing) {
          socketProxy.current.send(evt.data)
        }
      })

      socketProxy.current.onopen = () => {
        mediaRecorderRef.current.start(250)
        setTransStatus('start')
        console.log('audio capture started')
      }

      socketProxy.current.onmessage = async (msg) => {
        let data = msg.data;
        // Convert Blob to text if needed
        // if (data instanceof Blob) {
        //   data = await data.text();
        // }
        const { transcript } = JSON.parse(data).channel.alternatives[0]
        if (transcript) {
          setTranscription(transcript)
          // console.log(transcript)
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
      setLoading(true)
      const response = await fetch('http://localhost:3000/api/define', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmpText,
          videoTitle: mediaState.title,
          surroundingText: transcription
        })
      });

      const data = await response.json();
      // data.definition
      // data.example_sentence
      // data.example_translation

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
            <DefinitionPopup selectedText={selectedText} />
          }
        </div>

        {/** Media playback control */}
        <div className="media-controls">
          <button onClick={() => control('seekbackward')}> - 15s</button>
          <button onClick={() => control('playpause')}>
            <img
              src={mediaState.playing ? pauseButton : playButton}
              alt={mediaState.playing ? 'Pause' : 'Play'}
              className="playback-icon"
            />
          </button>
          <button onClick={() => control('seekforward')}> + 15s</button>
          {/** Live Transcription */}
          {transStatus === 'idle' ?
            <button id="start" onClick={startCapture} className="trans-button">
              <span>Start</span>
              <span>Transcription</span>
            </button>
            :
            <button id="stop" onClick={stopCapture} className="trans-button active">
              <span>Stop</span>
              <span>Transcription</span>
            </button>
          }
        </div>
      </div>
    </div>
  );
}

export default TrackCaption;