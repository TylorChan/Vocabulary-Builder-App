
$${\color{white}\Huge\text{Still Rewinding That One Word?}}$$
$${\color{white}\Huge\text{Yeah, We Got You 💪 😤 🤜}}$$
$${\color{lightblue}\Huge\text{Introducing...}}$$

# $${\color[RGB]{17,49,245}\Huge\text{MARK II}}$$
AI-powered Chrome extension that captures real-time 
  transcriptions from YouTube, provides instant 
  contextual definitions for any selected text, and reinforces
   learning through conversational AI Voice Agent.
## Key Features

### Interface 1: Live Caption Viewer

#### 🎥 Demo


https://github.com/user-attachments/assets/aa5ba66c-f6d3-4234-9d40-8bd6dc22b0c4



- Displays real-time subtitles from YouTube (the support for Spotify and other sites is coming soon) audio with AI-powered (**[Deepgram](https://deepgram.com/product/speech-to-text)**) transcription
- Media controls: Rewind 15s, Play/Pause, Forward 15s
- Select any word, phrase, or sentence to get instant AI-powered (**[Gemini 2.5 Flash Lite](https://ai.google.dev/gemini-api/docs/models)**) definitions
  - AI provides context-aware explanations and Chinese translations
- Save vocabulary selections for later review in Interface 2

### Interface 2: AI Conversation Review
#### 🎥 Demo

https://github.com/user-attachments/assets/5c1be5f0-04d5-4a64-b10e-511c7813c131

- Practice with AI Voice agent
  - review saved vocabulary (Coming soon)
- Personalized spaced repetition using FSRS (Coming soon)
- Context-aware review using original audio clips from where you learned the word (Coming soon)
## Resources
cross-site audio capture: https://developer.chrome.com/docs/web-platform/screen-sharing-controls/#displaySurface

cross-site audio control: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API

Speech to Text API: https://developers.deepgram.com/docs/live-streaming-audio 

openAI-realtime-agnet: https://github.com/openai/openai-realtime-agents

## Need to be Done
- review logic in the backend (using FSRS)
- Add 'Unsaved' function
- Increase transcription display length to prevent missing words during selection.
- Bold the selected word in definitions and example sentences for better visibility.


## $${\color{green}\Huge\text{Done}}$$
- **AI Voice Agent Interface**: Talk to an AI Voice Agent
- **Extension Architecture**: Content script ↔ Service worker ↔ Popup communication established
- **Live Transcription UI**: Real-time caption display with start/stop controls
- **Smart Pause Handling**: Transcription auto-stops when video pauses (saves bandwidth & cost)
- **AI-Powered Definitions**: Gemini 2.5 Flash integration for context-aware word definitions
- **Backend Infrastructure**
  - **Spring Boot Backend**: Java backend initialized with GraphQL support
  - **Save Vocabulary**: GraphQL mutation implemented - users can save words/phrases from definition popup
  - **Deepgram Keep-Alive**: WebSocket connection maintained with 3-second keep-alive messages (cost optimization)






