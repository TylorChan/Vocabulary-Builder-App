# Vocabulary Learning App Project

## Why I'm Building This Project

  🎯 Personal Learning Motivation

  - Language Learning Gap: Need to actively improve English vocabulary from real audio content I consume (YouTube, Spotify)
  - Passive → Active Learning: Transform passive listening into interactive vocabulary building with unfamiliar words/phrases

  🚀 Career Development Goals

  - Timeline: Graduating next year with 1-year runway to prepare for backend engineer roles
  - Target Positions: New grad backend software engineer at big tech companies (L3/E3 level: $156K-$220K)
  - Portfolio Need: Require substantial, production-ready project for interview showcasing

  📚 Technical Skill Building

  - Backend Mastery: Practice JavaGuide.cn knowledge (Spring Boot, databases, microservices, distributed systems)
  - Progressive Learning: 12-month complexity evolution from monolith to cloud-native microservices
  - Industry Alignment: Learn tech stack matching big tech requirements (Java, Spring, Docker, Kubernetes)

  🎨 Personal Satisfaction

  - Daily Use Value: Build tool I'll actually use for my own language learning
  - Interest Convergence: Combine passions for language learning, AI technology, and software engineering
  - Problem-Solution Fit: Address my specific learning style with conversational AI and spaced repetition

  📈 Interview Story Arc

  - Authentic Project: Solve real personal problem, not just academic exercise
  - Growth Demonstration: Show technical evolution and increasing complexity over time
  - Full-Stack Capability: Prove both frontend (extension) and backend (microservices) competency

## Project Overview
A Chrome extension that uses AI-powered conversations to help users learn English vocabulary from audio sources (YouTube, Spotify) they struggle to understand.

### Two Main Interfaces

**Interface 1: Interactive Caption Viewer**
- 当用户进入该页面时，会显示另一个web tab正在播放英语音源的caption，同时下方也会有中文翻译
- Media controls: Rewind 15s, Pause/Play, Forward 15s (controls the source tab)
- Text selection features:
  - Click and drag to select any text (word, phrase, or sentence)
  - Popup shows: Detailed definition (for words/phrases) or translation (for sentences) (powered by Gemini) (content-aware) 
  - Save selections to vocabulary database for later review
  - Option to save entire audio clips

**Interface 2: AI Conversation Review**
- Voice-based interaction: Users practice speaking with AI tutor
- Reviews saved word/phrases/sentence from Interface 1
- Personalized spaced repetition based on forgetting curves
- Context-aware review: Uses original audio context for better retention

### System Architecture
```
                 ┌─────────────────┐
                 │  YouTube/Spotify │
                 │     Content      │
                 └────────┬─────────┘
                          ↓
                 ┌─────────────────┐
                 │  Stage 1: NLP    │
                 │   Extraction     │←────────┐
                 └────────┬─────────┘         │
                          ↓                   │
                 ┌─────────────────┐         │
                 │   Highlighting   │         │
                 │  (Pre-selection) │         │
                 └────────┬─────────┘         │
                          ↓                   │
                 ┌─────────────────┐         │
                 │ Stage 2: User    │         │
                 │    Selection     │         │ Feedback
                 └────────┬─────────┘         │  Loop
                          ↓                   │A
                 ┌─────────────────┐         │
                 │  Vocabulary DB   │         │
                 └────────┬─────────┘         │
                          ↓                   │
                 ┌─────────────────┐         │
                 │ Stage 3: AI      │         │
                 │  Conversation    │         │
                 └────────┬─────────┘         │
                          ↓                   │
                 ┌─────────────────┐         │
                 │ Learning Outcome │─────────┘
                 └─────────────────┘
```

## Architecture Plan (New Grad Level - 12 Months)

### Target: L3/E3 Backend Engineer Position
- Compensation: $156K-$220K
- Focus: Spring Boot, PostgreSQL, Redis, Docker, Kubernetes
- Progressive complexity over 1 year

### Tech Stack Evolution:
**Months 1-3**: Spring Boot monolith + PostgreSQL
**Months 4-6**: Add Redis, JWT auth, external APIs (OpenAI, Google Translate)
**Months 7-9**: Split into microservices (User, Vocabulary, AI services)
**Months 10-12**: Production deployment (Docker, Kubernetes, monitoring)

### Browser Extension Component:
- Chrome extension for cross-tab media control
- Content scripts for caption extraction
- Communication with Spring Boot backend via REST APIs

## Big Tech Requirements Research
Based on Google, Meta, Amazon, Microsoft, Netflix job descriptions:
- Java, Spring Boot, microservices architecture
- PostgreSQL, Redis, MongoDB (polyglot persistence)
- Docker, Kubernetes, cloud deployment
- System design, scalability, distributed systems
- CI/CD, monitoring, testing

## Implementation Priority:
Start with Foundation phase (Months 1-3) - basic Spring Boot app with core vocabulary management features.

## Learning Path (Current Focus)

### JetBrains Academy - Java Backend Developer (Spring Boot)
- **Course URL**: https://hyperskill.org/courses/12
- **Study Plan**: https://hyperskill.org/study-plan (project-based learning approach)
- **Primary Project**: "Recipes" (Project #180) - https://hyperskill.org/projects/180

### Project-to-Vocabulary App Mapping:
**Recipes Project Structure → Vocabulary App Adaptation:**
- Recipe CRUD operations → Vocabulary entry management
- Multi-user authentication → User account system
- Recipe fields (name, description, ingredients, directions) → Vocabulary fields (word/phrase, definition, examples, usage notes)
- Recipe categories & search → Vocabulary topics & search functionality
- Spring Boot + H2 database → Direct technology transfer

### Learning Strategy:
- Complete "Recipes" project stages 1-5 (CRUD → Database → Security)
- Adapt project architecture directly to vocabulary management system
- Use as foundation for Months 1-3 Spring Boot monolith phase

## Technical Implementation Strategy

### Caption & Audio Capture Approach

**Hybrid Caption Source Strategy:**
- Priority 1: Use native video captions when available (most accurate)
- Priority 2: Web Speech API for free real-time transcription
- Priority 3: Whisper API for premium accuracy (future enhancement)

**Key Technical Decisions:**
- Start with Web Speech API for MVP (free, no backend required)
- Upgrade to Whisper API in production phase for better accuracy
- Store timestamps with all captions for audio clip extraction
- Use Chrome's tabCapture API for audio streaming

**Interface 1 Implementation Priorities:**
1. Native caption detection and extraction first
2. Fallback to speech recognition for videos without captions
3. Maintain synchronization between captions, audio, and video time
4. Cache translations to reduce API calls
5. Focus on YouTube initially (best caption support)

**Development Timeline:**
- Months 1-3: Web Speech API + native captions
- Months 4-6: Add translation and vocabulary storage
- Months 7-9: Integrate Whisper API and microservices
- Months 10-12: Production optimization and scaling

### Priority 1: Native Captions Implementation Guide

**Core Concept:**
Use browser's TextTrack API to extract existing captions from video elements before falling back to speech recognition.

**Three Execution Contexts:**
1. Content Script (contentScript.js) - Runs in webpage, accesses DOM/video
  - They are static assets that Chrome injects directly and not bundled by Vite/React build process. 
  - They run in webpage's context but are sandboxed from the page's Javascript.
  - Content scripts run independently in EVERY tab that matches your manifest patterns. When you have multiple YouTube tabs open, each has its own content script instance sending updates to your popup, causing conflicts.

2. Extension Popup (React) - UI display, cannot access webpage DOM
3. Communication via Chrome messaging API between contexts is like this
 - Service Worker: Runs 24/7 in background (even when popup closed)
 - Popup: Only exists when popup is open
 - Content Script: Lives inside web pages

  Each needs its own console because they run in completely different contexts:

  YouTube.com Page          Extension Background          Extension Popup
  ┌──────────────┐         ┌──────────────────┐         ┌─────────────┐
  │ Content      │  Port   │ Service Worker   │  Port   │ Popup       │
  │ Script       │<------->│                  │<------->│ (React)     │
  │              │         │ Always Running   │         │             │
  │ Console: F12 │         │ Console: Inspect │         │ Console:    │
  │ on YouTube   │         │ service worker   │         │ Right-click │
  └──────────────┘         └──────────────────┘         └─────────────┘

**Key API Learning Steps:**
1. **Browser Console Testing First** - Test TextTrack API in YouTube console before coding
2. **TextTrack API Basics:**
   - `video.textTracks` - Collection of available caption tracks
   - `track.mode = 'hidden'` - Load captions without displaying them
   - `track.cues` - All caption segments with timestamps
   - `track.activeCues` - Currently playing captions
   - `track.oncuechange` - Event when captions change

**Implementation Flow:**
1. Find video element in content script
2. Check if textTracks exist and have content
3. Set track mode to 'hidden' to load cues
4. Listen for oncuechange events to get real-time captions
5. Send caption data to React component via Chrome messaging

**Critical Learning Points:**
- Not all videos have captions (handle gracefully)
- Cues are lazy-loaded (null until track activated)
  - Captions are load asynchronouly. We need setTimeout to get textTracks.
- YouTube loads tracks dynamically (may need polling/MutationObserver)

**Essential Resources:**
- MDN TextTrack API: https://developer.mozilla.org/en-US/docs/Web/API/TextTrack
- MDN VTTCue: https://developer.mozilla.org/en-US/docs/Web/API/VTTCue

### Progress
#### Done
- Content Script can talk to Extension pop up and vice versa through serviceWorker.js
- Caption is completely shown on the pop up windows. There are two buttons to start and stop the transcption process.
- when user pause the video, the transcription process should be terminated to prevent sending nonsense audio data to server
- highligh function and definition powered by Gemini 2.5 will be provided below.
- when the user pauses for the transcription for a long time, the connection between deepgram and the server will be lost and get the message like this:
  - "send transcription to browser
{"type":"Metadata","transaction_key":"deprecated","request_id":"46c3cc07-0c72-4b3e-8c9e-17605fba5a7e","sha256":"incomplete","created":"2025-10-08T17:04:31.096Z","duration":4.0799375,"channels":1,"models":["40bd3654-e622-47c4-a111-63a61b23bfe8"],"model_info":{"40bd3654-e622-47c4-a111-63a61b23bfe8":{"name":"general-nova-3","version":"2025-04-17.21547","arch":"nova-3"}}}"
  - The solution is to send keep-alive message to deepgram every 3 seconds to optimized the cost (since sending empty audio data will charge me the money)
- Java spring boot backend (initialization done)
- Use GraphQL for saving the vocabulary entries inside definition block(a button to save).

#### Undone
- Add 'Unsaved' function
- FSRS implementation
- Increase transcription display length to prevent missing words during selection.
- Bold the selected word in definitions and example sentences for better visibility.

---

## Interface 2: Voice Agent Extraction Plan

### Tech Stack Decision (FINAL)

**Selected Repository**: `openai/openai-realtime-agents` (https://github.com/openai/openai-realtime-agents)
**cloned Repository**: '/Users/daqingchen/openai-realtime-agents-test/openai-realtime-agents'
**Why This Over Alternatives**:
- ❌ **ChatKit-JS**: Text-only, no speech-to-speech support, no Realtime API
- ⚠️ **openai-realtime-console**: Basic debugging tool, no structured conversation management
- ✅ **openai-realtime-agents**: Production-ready with agent patterns, live transcription, supervisor pattern for cost optimization

**Final Architecture**:
```
┌─────────────────────────────────────────────┐
│  Chrome Extension (React + Vite)            │
│  ┌──────────────┐    ┌──────────────┐      │
│  │ TrackCaption │◄──►│ VoiceAgent   │      │
│  │              │    │ (Extracted   │      │
│  │ - Deepgram   │    │  from         │      │
│  │ - Gemini     │    │  Realtime     │      │
│  └──────────────┘    │  Agents UI)   │      │
│                      └──────┬───────┘      │
└───────────────────────────────┼─────────────┘
                                │
                         WebSocket/Audio
                                │
┌───────────────────────────────▼─────────────┐
│  Node.js Relay Server (Agents SDK)          │
│  ┌──────────────────────────────────┐       │
│  │  Lightweight Agent                │       │
│  │  (gpt-realtime-mini)              │       │
│  │  - Basic Q&A                      │       │
│  │  - Pronunciation feedback         │       │
│  └──────────┬───────────────────────┘       │
│             │ Escalates complex cases       │
│  ┌──────────▼───────────────────────┐       │
│  │  Supervisor Agent                 │       │
│  │  (gpt-realtime)                   │       │
│  │  - Detailed explanations          │       │
│  │  - Cultural context               │       │
│  └──────────────────────────────────┘       │
│                                              │
│  Sequential Handoff:                         │
│  Definition → Usage → Pronunciation          │
└──────────────────────────────────────────────┘
```

**Cost Estimation**:
- Regular user (20 sessions/month, 12 min/session): **$11/month** with gpt-realtime-mini + caching
- Prompt caching saves 60-70% costs by reusing vocabulary context and system instructions

### Components to Extract

#### 1. **Transcript Component** (MUST HAVE)
**Source**: `/openai-realtime-agents/src/app/components/Transcript.tsx`

**Purpose**: Displays live conversation transcription with auto-scroll and message bubbles

**Key Features**:
- User messages (right-aligned, dark background) vs AI messages (left-aligned, light background)
- Auto-scroll to new messages
- Timestamp display
- Copy transcript button
- Download audio recording

**What to Extract**:
```typescript
// Critical parts:
- Message bubble UI rendering (lines 120-163)
- Auto-scroll logic (lines 32-52)
- Timestamp formatting function
- User/Assistant message differentiation
```

**Adaptations for VoiceAgent.jsx**:
- Remove Next.js `Image` component → use `<img src={...} />`
- Simplify Tailwind CSS or convert to plain CSS
- Remove "Download Audio" initially (add later)
- **ADD**: Highlight vocabulary words currently being reviewed
- **ADD**: Show progress indicator (e.g., "5/20 words reviewed")

---

#### 2. **TranscriptContext** (MUST HAVE)
**Source**: `/openai-realtime-agents/src/app/contexts/TranscriptContext.tsx`

**Purpose**: Central state management for conversation transcription

**Key Features**:
- `addTranscriptMessage(id, role, text)` - Add user/AI message
- `updateTranscriptMessage(id, text, isDelta)` - Update message (for streaming)
- `addTranscriptBreadcrumb(title, data)` - Add system messages like "Agent: vocabularyTeacher"
- `toggleTranscriptItemExpand(id)` - Expand/collapse messages
- Message timestamps and unique IDs

**What to Extract**:
```typescript
// COPY ENTIRE FILE AS-IS
// No Next.js dependencies, works directly with React + Vite
// Lines 1-136 are all needed
```

**Adaptations**:
- Rename `.tsx` → `.jsx`
- **ADD**: `addVocabularyHighlight(wordId, word)` function for marking reviewed words
- **ADD**: `updateWordReviewStatus(wordId, status)` for tracking learning progress

---

#### 3. **useRealtimeSession Hook** (MUST HAVE)
**Source**: `/openai-realtime-agents/src/app/hooks/useRealtimeSession.ts`

**Purpose**: Manages WebSocket connection to OpenAI Realtime API using the Agents SDK

**Key Features**:
- `connect({ getEphemeralKey, initialAgents, audioElement })` - Establish connection
- `disconnect()` - Close connection
- `sendUserText(text)` - Send text message
- `interrupt()` - Stop AI mid-response
- `mute(boolean)` - Enable/disable audio playback
- Event handlers for transcription, agent handoff, tool execution

**What to Extract**:
```typescript
// Core parts:
- Connection management (lines 111-156)
- Event handling setup (lines 88-108)
- Message helpers (lines 174-196)
- Status tracking ("CONNECTING", "CONNECTED", "DISCONNECTED")
```

**Adaptations**:
- Rename `.ts` → `.jsx`, remove TypeScript types
- Remove codec selection logic (lines 68-79) - just use default Opus
- **ADD**: `injectVocabularyContext(vocabularyList)` to pass saved words to agent
- **ADD**: Handle Chrome extension audio element creation
- Simplify to single agent initially (remove handoff complexity for MVP)

---

#### 4. **Agent Configuration** (MUST HAVE)
**Source**: `/openai-realtime-agents/src/app/agentConfigs/simpleHandoff.ts`

**Purpose**: Defines agent behavior, instructions, voice, and conversation flow

**Example Structure**:
```typescript
const vocabularyTeacherAgent = new RealtimeAgent({
  name: 'vocabularyTeacher',
  voice: 'sage',  // Options: sage, verse, alloy, shimmer
  instructions: `You are a patient vocabulary tutor...`,
  handoffs: [],   // Other agents this can transfer to
  tools: [],      // Functions the agent can call
});
```

**What to Create** (NEW FILE: `/Mark1/src/agentConfigs/vocabularyTeacher.js`):

**Version 1 - Simple Single Agent** (MVP):
```javascript
import { RealtimeAgent } from '@openai/agents/realtime';

export const vocabularyReviewAgent = new RealtimeAgent({
  name: 'vocabularyReviewer',
  voice: 'sage',
  instructions: `You are a friendly vocabulary tutor helping users practice English words they saved from YouTube videos.

REVIEW PROCESS:
1. Greet the user warmly
2. For each word in their vocabulary list:
   - Ask them to define the word
   - If correct, praise them. If incorrect, provide the correct definition
   - Ask them to use it in a sentence
   - Provide feedback on their sentence
3. Move to the next word

STYLE:
- Be encouraging and patient
- Use simple language
- Keep responses under 3 sentences
- Celebrate small wins`,
  handoffs: [],
  tools: [],
});
```

**Version 2 - Supervisor Pattern** (Cost Optimized):
```javascript
// Lightweight agent for routine Q&A (cheap: gpt-realtime-mini)
export const basicReviewerAgent = new RealtimeAgent({
  name: 'basicReviewer',
  voice: 'sage',
  instructions: `You handle basic vocabulary review. Ask definition recall and usage questions.
  If user struggles or asks complex questions about cultural context, nuances, or idioms,
  transfer to the explainerAgent.`,
  handoffs: [explainerAgent],  // Can escalate to supervisor
  tools: [],
});

// Supervisor agent for complex explanations (expensive: gpt-realtime)
export const explainerAgent = new RealtimeAgent({
  name: 'explainer',
  voice: 'verse',
  instructions: `You provide detailed explanations for difficult vocabulary, including:
  - Cultural context and connotations
  - Subtle differences between similar words
  - Idiomatic usage and examples
  - Etymology when relevant
  After explaining, transfer back to basicReviewer.`,
  handoffs: [basicReviewerAgent],
  tools: [],
});
```

**Vocabulary Context Injection**:
```javascript
// When connecting, pass saved vocabulary as context
const vocabularyContext = {
  words: [
    { id: "123", text: "ubiquitous", definition: "present everywhere",
      videoTitle: "Tech Trends 2024", surroundingText: "..." },
    // ... more words
  ],
  reviewMode: "definition-first",  // or "random", "pronunciation"
  userLevel: "intermediate"
};

await connect({
  getEphemeralKey: async () => EPHEMERAL_KEY,
  initialAgents: [vocabularyReviewAgent],
  audioElement: sdkAudioElement,
  extraContext: vocabularyContext,  // <-- Injected here
});
```

---

#### 5. **BottomToolbar Component** (OPTIONAL - Simplified)
**Source**: `/openai-realtime-agents/src/app/components/BottomToolbar.tsx`

**Purpose**: UI controls for connection, push-to-talk, audio settings

**What to Extract**:
- Connect/Disconnect button logic
- Connection status indicator
- Push-to-talk toggle (optional feature)

**Adaptations for VoiceControls.jsx**:
- Simplify to minimal controls:
  - "Start Practice" / "Stop Practice" button
  - Connection status indicator
  - Microphone permission warning
- Remove: Codec selector, event log toggle, audio download
- **ADD**: "View Vocabulary List" button
- **ADD**: Session progress display

---

#### 6. **Events Component** (DEVELOPMENT ONLY)
**Source**: `/openai-realtime-agents/src/app/components/Events.tsx`

**Purpose**: Displays JSON event log for debugging WebSocket messages

**Usage**:
- Keep for development to debug connection issues
- Make collapsible/hideable
- Remove entirely for production build

---

### File Structure After Extraction

```
Vocabulary-Builder-App/
├── Mark1/                           # Chrome Extension
│   ├── src/
│   │   ├── components/
│   │   │   ├── TrackCaption.jsx          [EXISTING] Interface 1
│   │   │   ├── DefinitionPopup.jsx       [EXISTING] Definition display
│   │   │   ├── VoiceAgent.jsx            [NEW] Main Interface 2 container
│   │   │   ├── Transcript.jsx            [EXTRACTED] Live conversation display
│   │   │   ├── VoiceControls.jsx         [NEW] Start/Stop practice buttons
│   │   │   └── VocabularyList.jsx        [NEW] Show words being reviewed
│   │   │
│   │   ├── contexts/
│   │   │   └── TranscriptContext.jsx     [EXTRACTED] Conversation state
│   │   │
│   │   ├── hooks/
│   │   │   ├── useRealtimeSession.js     [EXTRACTED] API connection
│   │   │   └── useVocabularyContext.js   [NEW] Load saved vocabulary
│   │   │
│   │   ├── agentConfigs/
│   │   │   └── vocabularyTeacher.js      [NEW] Agent instructions
│   │   │
│   │   └── utils/
│   │       ├── graphql.js                [EXISTING] Save vocabulary
│   │       └── realtimeClient.js         [NEW] Helper functions
│   │
│   ├── server.js                    [EXISTING] Deepgram + Gemini proxy
│   └── voiceServer.js               [NEW] Realtime API relay server
│
├── vocabularyBackend/               [EXISTING] Spring Boot backend
└── openai-realtime-agents-test/    [REFERENCE] Cloned example repo
```

---

### Dependencies to Install

```bash
cd Mark1

# Core Realtime API dependencies
npm install @openai/agents

# Utilities
npm install uuid
npm install react-markdown  # For formatting AI responses (optional)

# Server dependencies (for voiceServer.js)
npm install openai  # OpenAI Node.js SDK
npm install express cors
```

---

### Server Setup (NEW FILE)

**Create**: `/Mark1/voiceServer.js`

```javascript
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Endpoint to generate ephemeral key for Realtime API
// Required for secure client-side connection
app.post('/api/session', async (req, res) => {
  try {
    const response = await openai.sessions.create({
      model: 'gpt-realtime-mini',  // or 'gpt-realtime'
      voice: 'sage',
    });

    res.json({
      client_secret: {
        value: response.client_secret.value
      }
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Voice server running on http://localhost:${PORT}`);
});
```

**Running Both Servers**:
```bash
# Terminal 1: Existing Deepgram/Gemini server
node server.js        # Port 3000

# Terminal 2: New Realtime API server
node voiceServer.js   # Port 3001
```

---

### Step-by-Step Implementation Plan

#### **Phase 1: Foundation Setup** (Week 1 - Jan 20-26, 2025)

**Goal**: Get basic transcription UI rendering with dummy data

**Tasks**:
1. ✅ Install dependencies (`@openai/agents`, `uuid`)
2. ✅ Copy `TranscriptContext.tsx` → `/Mark1/src/contexts/TranscriptContext.jsx`
   - Rename file extension
   - Remove TypeScript types
3. ✅ Copy `Transcript.tsx` → `/Mark1/src/components/Transcript.jsx`
   - Replace `import Image from "next/image"` with `<img>`
   - Convert Tailwind to plain CSS (or keep Tailwind if already using)
4. ✅ Update `VoiceAgent.jsx` to use Transcript component
   ```jsx
   import { TranscriptProvider } from '../contexts/TranscriptContext';
   import Transcript from './Transcript';

   function VoiceAgent({ onNavigateBack }) {
     return (
       <TranscriptProvider>
         <div className="voice-agent-container">
           <Transcript
             userText=""
             setUserText={() => {}}
             onSendMessage={() => {}}
             canSend={false}
             downloadRecording={() => {}}
           />
         </div>
       </TranscriptProvider>
     );
   }
   ```
5. ✅ Test: See transcript UI render in VoiceAgent interface
6. ✅ Add dummy messages using TranscriptContext to verify auto-scroll works

**Success Criteria**:
- Transcript component renders without errors
- Can see message bubbles for user/assistant
- Auto-scroll works when adding messages

---

#### **Phase 2: API Connection** (Week 2 - Jan 27 - Feb 2, 2025)

**Goal**: Establish live connection to OpenAI Realtime API and see real transcription

**Tasks**:
1. ✅ Create `voiceServer.js` for ephemeral key generation
2. ✅ Copy `useRealtimeSession.ts` → `/Mark1/src/hooks/useRealtimeSession.js`
   - Remove TypeScript types
   - Remove codec selection logic
   - Keep core connection/disconnect/sendUserText functions
3. ✅ Test ephemeral key endpoint
   ```bash
   curl -X POST http://localhost:3001/api/session
   # Should return: { "client_secret": { "value": "ek_..." } }
   ```
4. ✅ Integrate `useRealtimeSession` into `VoiceAgent.jsx`
   ```jsx
   import { useRealtimeSession } from '../hooks/useRealtimeSession';

   function VoiceAgent({ onNavigateBack }) {
     const { connect, disconnect, status } = useRealtimeSession({
       onConnectionChange: (s) => console.log('Status:', s),
     });

     const handleStartPractice = async () => {
       const audioElement = document.createElement('audio');
       audioElement.autoplay = true;
       document.body.appendChild(audioElement);

       await connect({
         getEphemeralKey: async () => {
           const res = await fetch('http://localhost:3001/api/session', { method: 'POST' });
           const data = await res.json();
           return data.client_secret.value;
         },
         initialAgents: [], // Empty for now
         audioElement,
       });
     };

     return (
       <div>
         <button onClick={handleStartPractice}>Start Practice</button>
         <p>Status: {status}</p>
       </div>
     );
   }
   ```
5. ✅ Test connection: Click "Start Practice" → Status changes to "CONNECTED"
6. ✅ Verify audio element receives stream (check Chrome DevTools → Media tab)

**Success Criteria**:
- Connection status shows "CONNECTED"
- No console errors
- Can hear AI audio response (even without agent config yet)

---

#### **Phase 3: Agent Configuration** (Week 3 - Feb 3-9, 2025)

**Goal**: Add vocabulary teacher agent and inject saved words into context

**Tasks**:
1. ✅ Create `/Mark1/src/agentConfigs/vocabularyTeacher.js`
   - Start with simple single agent (Version 1)
   - Write clear teaching instructions
2. ✅ Load saved vocabulary from Spring Boot backend
   ```javascript
   // In VoiceAgent.jsx
   const [savedWords, setSavedWords] = useState([]);

   useEffect(() => {
     // Fetch from GraphQL or REST API
     fetch('http://localhost:8080/graphql', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         query: '{ vocabularyEntries { id text definition videoTitle } }'
       })
     })
     .then(res => res.json())
     .then(data => setSavedWords(data.data.vocabularyEntries));
   }, []);
   ```
3. ✅ Pass vocabulary to agent as context
   ```javascript
   await connect({
     getEphemeralKey: ...,
     initialAgents: [vocabularyReviewAgent],
     audioElement,
     extraContext: {
       vocabularyList: savedWords,
       reviewCount: savedWords.length,
     },
   });
   ```
4. ✅ Test conversation flow:
   - AI should greet user
   - AI should ask about first word
   - User speaks response
   - AI provides feedback
5. ✅ Verify vocabulary words appear in AI's questions

**Success Criteria**:
- AI mentions specific words from saved vocabulary
- Conversation follows structured teaching flow
- Can complete review of 2-3 words end-to-end

---

#### **Phase 4: UI Polish & Integration** (Week 4 - Feb 10-16, 2025)

**Goal**: Professional UI matching Mark1 design, integrate with Interface 1

**Tasks**:
1. ✅ Style Transcript component to match TrackCaption aesthetics
   - Match color scheme, fonts, spacing
   - Add vocabulary word highlighting in messages
2. ✅ Create VoiceControls component
   - Start/Stop practice buttons
   - Microphone permission indicator
   - Session progress (X/Y words reviewed)
3. ✅ Create VocabularyList sidebar
   - Show words being reviewed
   - Check off completed words
   - Highlight current word
4. ✅ Add progress tracking
   ```javascript
   const [reviewProgress, setReviewProgress] = useState({ current: 0, total: 20 });
   ```
5. ✅ Test full workflow:
   - Interface 1: Watch YouTube → Save 10 words
   - Interface 2: Click "Practice with AI" → Review all 10 words
   - Verify saved words appear correctly
6. ✅ Add error handling:
   - No microphone permission
   - No saved vocabulary
   - Connection failures
7. ✅ Optimize: Enable prompt caching
   ```javascript
   // In agent instructions
   instructions: `[CACHEABLE_CONTEXT]
   You are a vocabulary tutor. User's vocabulary list:
   ${JSON.stringify(savedWords, null, 2)}
   [/CACHEABLE_CONTEXT]

   Review these words systematically...`
   ```

**Success Criteria**:
- UI looks polished and consistent with Interface 1
- User can practice 20 words in one session
- Progress tracking works correctly
- Cost per session ~$0.50 (check OpenAI dashboard)

---

#### **Phase 5: Optimization & Supervisor Pattern** (Week 5+ - Feb 17+)

**Goal**: Reduce costs with supervisor pattern, add advanced features

**Tasks**:
1. ✅ Implement supervisor pattern (Version 2 agent config)
   - basicReviewerAgent uses gpt-realtime-mini
   - explainerAgent uses gpt-realtime (only when needed)
2. ✅ Add handoff logic:
   - Detect when user struggles or asks complex questions
   - Transfer to supervisor agent
   - Transfer back after explanation
3. ✅ Measure cost savings:
   - Before: 100% gpt-realtime → ~$0.80/session
   - After: 80% mini, 20% full → ~$0.35/session (56% savings)
4. ✅ Add pronunciation practice:
   - Play original audio clip from YouTube
   - User repeats
   - AI analyzes pronunciation
5. ✅ Implement FSRS (spaced repetition):
   - Track review success/failure
   - Calculate optimal next review date
   - Prioritize words due for review

---

### Key Adaptations Needed

| Original (Next.js) | Your Adaptation (Vite + React) |
|-------------------|--------------------------------|
| `import Image from "next/image"` | `<img src={...} />` |
| `/api/session` route in Next.js | Separate `voiceServer.js` on port 3001 |
| `useSearchParams()` from Next.js | Not needed (no URL params in extension) |
| TypeScript `.ts`/`.tsx` files | Rename to `.js`/`.jsx`, remove types |
| Tailwind CSS classes | Keep or convert to plain CSS |
| `gpt-4o-realtime-preview` | Use `gpt-realtime-mini` for cost savings |
| Multiple agent scenarios | Start with single vocabularyReviewAgent |

---

### Cost Optimization Checklist

✅ **Use gpt-realtime-mini by default** (3x cheaper than gpt-realtime)
✅ **Enable prompt caching** (wrap vocabulary list in cacheable tags)
✅ **Supervisor pattern** (only escalate to expensive model when needed)
✅ **Batch vocabulary additions** (add 10 words, then start session - not 1 at a time)
✅ **Session-based UX** (encourage 15-min practice vs. many short sessions)

**Expected Monthly Cost** (personal use, 20 sessions/month):
- Without optimization: ~$35/month
- With optimization: ~$11/month
- **Savings: 69%**

---

### Troubleshooting Guide

**Problem**: Connection fails with "No ephemeral key"
- Check voiceServer.js is running on port 3001
- Verify OPENAI_API_KEY environment variable is set
- Test endpoint: `curl -X POST http://localhost:3001/api/session`

**Problem**: No audio playback
- Check browser microphone permissions granted
- Verify audio element created: `document.querySelector('audio')`
- Check audio element has `srcObject` set
- Test: `audioElement.play()` in console

**Problem**: Transcript not updating
- Verify TranscriptProvider wraps Transcript component
- Check useTranscript() hook called correctly
- Look for errors in console from event handlers

**Problem**: AI doesn't mention saved vocabulary
- Verify `extraContext` passed to connect()
- Check vocabulary loaded before connecting
- Test: `console.log(vocabularyContext)` before connect

**Problem**: High costs
- Enable prompt caching (wrap static context)
- Use gpt-realtime-mini instead of gpt-realtime
- Implement supervisor pattern
- Check OpenAI dashboard for detailed usage

---

### Success Metrics

**MVP Definition (End of Phase 3)**:
✅ User can click "Practice with AI" button
✅ Connection establishes successfully
✅ AI greets user and starts reviewing saved vocabulary
✅ User can speak responses, AI provides feedback
✅ Live transcription displays conversation
✅ Can review 10 words in one session
✅ Cost per session < $0.60

**Production Ready (End of Phase 5)**:
✅ Supervisor pattern reduces costs by 50%+
✅ Pronunciation practice with original audio clips
✅ FSRS scheduling for optimal review timing
✅ Polished UI matching Interface 1 design
✅ Error handling for all edge cases
✅ Session recordings saved for later review

---

### Reference Documentation

**OpenAI Realtime Agents Repository**:
https://github.com/openai/openai-realtime-agents

**OpenAI Agents SDK (npm package)**:
https://github.com/openai/openai-agents-js

**Realtime API Official Guide**:
https://platform.openai.com/docs/guides/realtime

**Ephemeral Key Creation**:
https://platform.openai.com/docs/api-reference/realtime-sessions/create

**Prompt Caching Best Practices**:
https://platform.openai.com/docs/guides/prompt-caching

**WebRTC in Chrome Extensions**:
https://developer.chrome.com/docs/extensions/mv3/getusermedia/

---

### Critical Implementation Notes

1. **Microphone Permissions**: Chrome extensions need `"permissions": ["audio"]` in manifest.json

2. **Audio Element Management**: Must create and append to DOM before connecting:
   ```javascript
   const audioEl = document.createElement('audio');
   audioEl.autoplay = true;
   document.body.appendChild(audioEl);
   ```

3. **Prompt Caching Format**: Wrap static context to enable caching:
   ```
   [SYSTEM]
   <<CACHEABLE_CONTENT>>
   Vocabulary list: [...]
   Teaching instructions: [...]
   <</CACHEABLE_CONTENT>>

   Current session: [dynamic content]
   ```

4. **Agent Handoff Syntax**: Use exact function name pattern:
   ```javascript
   // In basicReviewer's instructions:
   "If user asks complex question, call transfer_to_explainer()"

   // SDK auto-generates this tool from handoffs array
   ```

5. **Cost Monitoring**: Check OpenAI dashboard daily during development to catch expensive mistakes early

---

### Next Immediate Actions

**Choice Point**:
- **Option A - Start Small**: Extract just TranscriptContext + Transcript, render with dummy data (Phase 1 only)
- **Option B - Full Setup**: Complete Phases 1-3 in one go for working voice agent

**Recommended**: Start with Option A to validate extraction process, then proceed to Phase 2-3.

**First Command**:
```bash
cd /Users/daqingchen/Vocabulary-Builder-App/Mark1
npm install @openai/agents uuid
```



## Brainstorm & Feature Ideas
### No-Login Local-First Architecture
**Idea**: Store all user data locally using Chrome storage, no account required. Backend is optional for advanced features only.

**Use Case**: Provides instant, frictionless start without signup barriers. Users get full functionality immediately while maintaining maximum privacy. Modern apps like Notion and Figma use this "try before login" pattern successfully.

### Audio Clip Extraction with Text Selection
**Idea**: When any text (word/phrase/sentence) is highlighted, automatically extract the corresponding audio clip.

**Use Case**: Helps users who struggle with listening comprehension by preserving the exact pronunciation and context they couldn't understand.

### Teacher-Led AI Conversation Design
**Idea**: AI dominates conversation flow as an adaptive teacher, systematically reviewing saved vocabulary through structured dialogue.

**Core Principles**:
- AI generates questions based on spaced repetition algorithms
- Progressive difficulty: definitions → usage → context application
- Multi-modal review: audio playback + text + pronunciation practice
- Real-time adaptation based on user responses

**Example Flow**:
```
AI: "Let's review 'ubiquitous' from your tech podcast. What does it mean?"
User: "Common?"
AI: "Close! But more specific - it means present everywhere. Now use it in a sentence about technology."
User: "Smartphones are ubiquitous in cafes"
AI: "Perfect! Here's the original audio clip. Can you repeat the pronunciation?"
```

### Cold Start + Active Learning for Pre-Highlight Model
**Idea**: Bootstrap vocabulary difficulty prediction with minimal data, then continuously improve through user interactions.

**Two-Phase Architecture**:
1. **Cold Start Phase**: 5-minute vocabulary assessment test to estimate user knowledge level
2. **Active Learning Phase**: Continuously fine-tune model as user selects words during real usage


## Claude Response Guidelines

**Grammar Assistance**: Please correct my English grammar for my any hand-type text (not the text I copy) before using it as a prompt and show the summary of the correction before giving me the answer and make it concise.

**Resource Links**: Please provide the URL link of the resources I am asking for.