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

## CSCI 5541 NLP Project Ideas

### Core Concept: Multimodal Vocabulary Selection Prediction
The vocabulary app can be adapted for CSCI 5541 by focusing on the NLP challenge of predicting which words users will select to learn from YouTube/Spotify content.

### Key Innovation: Two Types of Learning Challenges
1. **Acoustic Difficulty**: User can't hear/recognize the word clearly (listening problem)
2. **Semantic Difficulty**: User doesn't know the meaning/usage (vocabulary problem)

### Potential Research Directions

**Option 1: Dual-Model Architecture**
- Build two separate models: Acoustic Difficulty Model + Semantic Difficulty Model
- Combine predictions to generate smart highlighting
- Research question: Which type of difficulty drives selection behavior?

**Option 2: Context-Aware Extraction**
- Focus on what makes words "selection-worthy" from entertainment content
- Compare shallow features vs. deep contextual models (BERT)
- Create first dataset of vocabulary selection from non-educational content

**Option 3: Multimodal Fusion**
- Integrate audio features (speaking rate, clarity) with text features
- Explore early vs. late fusion strategies
- Investigate when audio signals matter most for prediction

**Option 4: Regarding CWI
Problem Statement: Existing CWI models trained on educational/news content (CompLex, SemEval datasets) may not generalize to
entertainment content where vocabulary patterns, cultural references, and informal language usage differ significantly.

Research Questions:
- How do complexity patterns in YouTube/Spotify content differ from traditional CWI benchmarks?
- Which linguistic features transfer across domains and which are domain-specific?
- Can domain adaptation techniques improve complexity prediction for entertainment content?

### Research questions

- RQ2: Domain Transfer Effectiveness - To what extent do formal-domain CWI models (trained on news/educational content)
  transfer to multimedia content consumption (YouTube captions, podcast transcripts), and what specific linguistic features
  cause performance degradation?
    - Traditional CWI models trained on edited written text fail when applied to spoken language contexts where people actually
  consume content for learning. The shift from curated academic datasets to authentic multimedia consumption creates a massive
  performance gap due to conversational delivery, informal register, and multimodal context.

Methodology:
1. Baseline Establishment: Evaluate CAMB winning system and BERT-based models on entertainment content
2. Domain Gap Analysis: Compare feature importance between CompLex dataset and your YouTube selections
3. Transfer Learning: Fine-tune pre-trained CWI models on entertainment-specific data
4. Feature Analysis: Identify entertainment-specific features (slang, cultural references, speaking style)

Expected Contributions:
- First systematic analysis of domain transfer in vocabulary complexity
- Novel entertainment content complexity dataset
- Improved models for real-world language learning scenarios

MVP Statement: "Comprehensive evaluation of existing CWI models on manually collected YouTube vocabulary selections,
quantifying the domain gap and establishing baselines for entertainment content complexity prediction."".

### Why This Works for CSCI 5541
- Uses course techniques: text classification, embeddings, transformers
- Novel problem: No existing work on acoustic vs. semantic selection prediction
- Real data: App provides actual user interaction data
- Clear evaluation: Precision/recall on selection prediction
- Manageable scope: No need to build full conversation/review system

### Future Extensions (Beyond Semester)
- Add spaced repetition optimization based on difficulty type
- Implement conversation-based feedback loop
- Create personalized difficulty curves per user

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

#### Undone
- when user pause the video, the transcription process should be terminated to prevent sending nonsense audio data to server.\
- highligh function

## Brainstorm & Feature Ideas

### Audio Clip Extraction with Text Selection
**Idea**: When any text (word/phrase/sentence) is highlighted, automatically extract the corresponding audio clip.

**Technical Approach**:
- Use YouTube/Spotify caption timestamps to map text to audio segments
- Store both timestamp references (lightweight) or actual audio clips (storage-heavy)
- Add ±0.5s padding around selections for context

**User Options When Saving**:
1. Save with audio clip (for listening practice)
2. Save text only (for meaning study)
3. Save both (comprehensive learning)

**Implementation Notes**:
- YouTube API provides word-level timestamps in caption data
- Web Audio API can extract clips from video elements
- Database stores: text, audio_start_time, audio_end_time, source_url

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

**Technical Implementation**:
- Question generation engine with difficulty progression
- Speech recognition for pronunciation assessment
- Context-aware prompting using original source material
- Performance tracking for personalized review scheduling

### Cold Start + Active Learning for Pre-Highlight Model
**Idea**: Bootstrap vocabulary difficulty prediction with minimal data, then continuously improve through user interactions.

**Two-Phase Architecture**:
1. **Cold Start Phase**: 5-minute vocabulary assessment test to estimate user knowledge level
2. **Active Learning Phase**: Continuously fine-tune model as user selects words during real usage

**Technical Implementation**:
- **Initial Assessment**: 50-100 vocabulary test words across difficulty levels
- **Baseline Model**: Train initial semantic difficulty predictor from test results
- **Real-time Learning**: Update model with each user selection during actual content consumption
- **Model Architecture**: BERT fine-tuning with incremental learning capabilities

**Data Requirements** (Much More Feasible):
- Initial: 50-100 test words × 5-10 users = 250-1000 examples
- Growth: Each user contributes 10-20 selections per session
- Continuous improvement without large upfront data collection

**Industry Parallels**:
- Similar to Duolingo's placement test + adaptive learning
- Netflix/Spotify cold start recommendations
- Personalized difficulty estimation that improves over time

**Research Contribution**:
- First study of vocabulary learning cold start problem
- Novel application of active learning to language education
- Practical deployment strategy for semantic difficulty prediction

**CSCI 5541 Project Focus**: Implement and evaluate the cold start + active learning pipeline for vocabulary selection prediction, comparing initial assessment accuracy vs. performance after active learning iterations.

## Claude Response Guidelines

**Grammar Assistance**: Please correct my English grammar before using it as a prompt and show the summary of the correction before giving me the answer and make it concise.

**Resource Links**: Please provide the URL link of the resources I am asking for.