<p align="left">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">中文</a>
</p>

$${\color{orange}\Huge\text{No More Copy‑Pasting Captions 😓}}$$ 
$${\color{pink}\Huge\text{No More “What Does This Mean?” Tabs 🥲}}$$ 
$${\color{red}\Huge\text{No More Flashcard Hell 🤬}}$$
$${\color{green}\Huge\text{Just Learn—Right Where You Watch ✅}}$$
$${\color{blue}\Huge\text{🙀 🤯 Meet.....................}}$$

# <img src="Mark1/public/icons/ironman.png" width="50" height="50" /> $${\color[RGB]{17,49,245}\Huge\text{MARK II}}$$
AI-powered Chrome extension that captures real-time 
  transcriptions from YouTube, provides instant 
  contextual definitions for any selected text, and reinforces
   learning through conversational AI Voice Agent.

## Changelog
### v2.2.0 (Current)
- Replaced the old definition‑drill flow with GPT‑5.2 scene‑based $${\color{orange}\text{role-play}}$$ review flow.
- Rater Agent now runs in background and scores without interrupting practice.
- Memory layer live (LangChain + MongoDB Atlas Vector Search + OpenAI embeddings)

### v2.1.0 
- **Deterministic** multi‑agent review flow (Teacher <-> Rater with strict tool gating
 and state machine).
- Explain the reasoning behind the rater’s score.
<p align="center">
  <img src="https://github.com/user-attachments/assets/25c30d72-107f-4e4b-934b-a6a4a7ac66a7" style="height:auto;width:300px;vertical-align:middle;border:0;" alt="Old" />
</p>

### v2.0.3
  - Cleaner breadcrumb UI for agent logs (old → new).
    <p align="center">
      <img src="https://github.com/user-attachments/assets/f83cafba-abb6-4d57-bf7b-142a50e2f93c"
           style="height:auto;width:300px;vertical-align:middle;border:0;" alt="Old" />
      <span style="display:inline-block;height:500px;line-height:500px;vertical-align:middle;font-size:28px;">→</span>
      <img src="https://github.com/user-attachments/assets/73284eb2-4a28-4ad2-89e0-d5dab6318f23"
           style="height:auto;width:300px;vertical-align:middle;border:0;" alt="New" />
    </p>
  - Transcription starts faster and is more stable.

### v2.0.2 
- Moved UI to a persistent **Chrome Side Panel** (no more popup auto-close)
- Connected **Interface 1 ↔ Interface 2** end-to-end via Spring Boot GraphQL + MongoDB:
  - Save vocabulary (`saveVocabulary`)
  - Load due words (`startReviewSession`)
  - Batch persist review results (`saveReviewSession`)
- Interface 2 upgraded to an **AI multi-agent voice review loop** (Teacher + Rater) with tool-based control:
  - Deterministic word order (`get_next_word`) to prevent session stalls
  - Word-boundary tracking + full word-level evidence for rating
  - Ratings buffered locally and **batch-synced on disconnect** (retry-safe)

### v2.0.0
- Extension UI was a **popup window** (closed on blur)
- Interface 1 and Interface 2 were **disconnected**
- Interface 2 was a **basic voice agent demo** (no tools, no multi-agent, no backend-driven review)

## Architecture Overview
To be updated
<!-- <img src="Mark1/public/icons/MarkII_architecure.png" alt="MARK II overall architecture" width="100%" /> -->

### Multi-Agent Flow (Interface 2)
To be updated
<!-- <img src="Mark1/public/icons/multi-agent_architecture.svg" alt="Multi-Agent Flow" width="100%" /> -->

## Key Features

### Interface 1: Live Caption Viewer

#### 🎥 Demo (Click the thumbnail to watch)

[![MARK II - Interface 1 Demo](https://img.youtube.com/vi/g8U2RNnuFvo/maxresdefault.jpg)](https://youtu.be/g8U2RNnuFvo)


- Live YouTube captions via real-time speech-to-text **[Deepgram](https://deepgram.com/product/speech-to-text)** in a persistent side panel (Spotify/other sites coming soon)
- One-click media controls: Rewind 15s / Play–Pause / Forward 15s
- Highlight any word / phrase / sentence to get instant, context-aware definitions + Chinese translation **[Gemini2.5 Flash Lite](https://ai.google.dev/gemini-api/docs/models)**
 - In testing, this model has extremely low latency and responds several seconds faster than OpenAI’s mini/nano models, while maintaining solid output quality—ideal for clearly defined, low‑latency small‑to‑medium tasks.
- Save selected items to your vocabulary set for later review in Interface 2

### Interface 2: AI Conversation Review
#### 🎥 Demo (Click the thumbnail to watch)

[![MARK II - Interface 2 Demo](https://img.youtube.com/vi/zaDwSW_WFOY/maxresdefault.jpg)](https://youtu.be/zaDwSW_WFOY)

- **Chrome extension AI multi‑agent voice tutor** powered by **[OpenAI Realtime](https://github.com/openai/openai-realtime-agents)** for low‑latency speaking practice
  - **Teacher Agent** leads the role‑play dialogue and keeps the session on track
  - **Scene planner ([GPT‑5.2](https://platform.openai.com/docs/models/gpt-5.2) based)** builds role‑play scenes from **due words + video context**, then feeds them to the Teacher
  - **Background Rater Agent ([GPT‑5‑mini](https://platform.openai.com/docs/models/gpt-5-mini) based)** scores scenes without blocking the conversation
- **Memory layer** with **[LangChain](https://docs.langchain.com/oss/python/concepts/memory#long-term-memory) + [MongoDB Atlas Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/tutorials/vector-search-quick-start/?deployment-type=atlas&interface-atlas-only=driver&language-atlas-only=nodejs) + [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings#page-top)** stores/retrieves semantic & episodic hints for personalization
- **[FSRS](https://github.com/open-spaced-repetition/py-fsrs)** updates are buffered locally and batch‑synced to GraphQL on disconnect
## Resources
cross-site audio capture: https://developer.chrome.com/docs/web-platform/screen-sharing-controls/#displaySurface

cross-site audio control: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API

Speech to Text API: https://developers.deepgram.com/docs/live-streaming-audio 

openAI-realtime-agnet: https://github.com/openai/openai-realtime-agents

## Roadmap

- Upgrade the current agent workflow with [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview?_gl=1*1meb2nf*_gcl_au*MTE2NzMwMzQ1OC4xNzY4NDQ4MTUz*_ga*MTIyMTAwNzczLjE3Njg0NDgxNTM.*_ga_47WX3HKKY2*czE3Njg4MTE5OTEkbzYkZzEkdDE3Njg4MTIwMDEkajUwJGwwJGgw) for greater stability and control
- Overlay vocabulary panel (in-page, always accessible)
- Unsave/Delete vocabulary entries
- Improve caption UX: longer transcript buffer for reliable selection

## $${\color{green}\Huge\text{Done}}$$

- Persistent Side Panel UI + extension messaging wired
- Backend (Spring Boot + GraphQL + MongoDB) + Python FSRS (Flask): saveVocabulary, startReviewSession, saveReviewSession, next‑due scheduling
- Interface 1 (Capture): Deepgram captions, media controls, Gemini definitions + CN translation
- Interface 2 (Voice Review): scene‑based role‑play + background rating, FSRS batch updates, batch sync on disconnect
- Memory layer: LangChain + MongoDB Atlas Vector Search (personalized hints)
