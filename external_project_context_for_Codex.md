# External Project Context For Codex

Last updated: 2026-03-12
Purpose: this file is the durable handoff memory for new Codex threads working on MARK II.

## How To Use This File
- Read this file together with `AGENTS.md` and `current_plan.md` at the start of a new thread.
- Treat `Stable Decisions` as the default architecture constraints unless the code clearly contradicts them.
- Treat `Current State`, `Active Focus`, and `Recent Verified Progress` as high-value working memory.
- Prefer updating this file over keeping important project state only inside a long thread.
- Keep this file concise. Remove stale items instead of endlessly appending new bullets.

## What Belongs Here
- Stable project identity and product loop
- Repository and runtime map
- Architecture decisions that should survive thread resets
- Current implementation state at a system level
- Active workstreams, blockers, and next-step context
- Recent verified milestones worth carrying into the next thread
- Open questions and technical risks that still matter

## What Should Not Live Here
- Full transcripts or long chat logs
- Large code snippets
- One-off debugging noise
- Duplicate details already maintained better in `current_plan.md`
- Unverified assumptions presented as facts

## Maintenance Rules
- Prefer bullets over paragraphs.
- Prefer system-level facts over storytelling.
- Mark items with one of these tags:
  - `[Verified]` for facts checked against code or runtime in a recent thread
  - `[Inherited]` for high-confidence carryover from prior threads that should still be code-checked before major refactors
  - `[Open]` for unresolved questions or risks
- Keep `Stable Decisions` low-churn.
- Keep `Current State`, `Active Focus`, and `Recent Verified Progress` high-signal and compact.
- When a section becomes stale, rewrite it instead of adding another layer of summary on top.

## Recommended Memory Layers

### Layer 1: Pinned Context
This is the always-read context for new threads. It should stay relatively stable.

### Layer 2: Working Memory
This is the current-state context that changes as features ship.

### Layer 3: Handoff Memory
This is the shortest path for a new thread to resume useful work.

## Section Layout

### 1. Project Identity
- Project name: MARK II Vocabulary Builder
- One-line description: an AI speaking coach that turns real video input into saved vocabulary, voice review, spaced repetition, and personalized tutoring.
- Core loop: watch real content -> select expression -> understand in context -> save -> review by voice -> update FSRS -> personalize with memory.
- Primary repository root: `/Users/daqingchen/Vocabulary-Builder-App`

### 2. Product And User Value
- [Inherited] MARK II is not just a word list tool; it is an end-to-end input-to-output practice loop.
- [Inherited] The strongest product framing is: "turn real content input into spoken output practice."
- [Inherited] Interface 1 handles live captions, contextual explanation, and save.
- [Inherited] Interface 2 handles AI voice tutor review, scoring, memory update, and schedule update.

### 3. Repo And Runtime Map
- [Verified] `Mark1/`: Chrome extension, React side panel UI, local Node services.
- [Verified] `Mark1/server.js`: Deepgram relay + Gemini `/api/define`.
- [Verified] `Mark1/voiceServer.js`: OpenAI Realtime ephemeral key creation and voice-session support.
- [Inherited] `Mark1/memory/memoryServer.js`: auth + memory bootstrap + semantic/episodic/procedural memory consolidation.
- [Verified] `vocabularyBackend/`: Spring Boot + GraphQL + MongoDB backend.
- [Verified] `vocabularyBackend/fsrs-service/app.py`: Python FSRS microservice.
- [Verified] Common ports:
  - `3000` Node define/transcription server
  - `3002` voice server
  - `8080` Spring Boot backend
  - `6000` FSRS service

### 4. Stable Decisions
- [Inherited] Use two interfaces, not one blended surface: Interface 1 for comprehension and saving, Interface 2 for speaking review.
- [Inherited] Use WebRTC for the realtime voice path instead of WebSocket because media transport latency and audio handling matter.
- [Inherited] `scene rating` should be async and must not block the teacher agent realtime loop.
- [Inherited] Memory should remain layered as `semantic`, `episodic`, and `procedural`.
- [Inherited] Do not inject one giant memory object into the teacher; inject structured prompt blocks instead.
- [Inherited] Best block shape for teacher injection:
  - `COACHING STYLE`
  - `USER PROFILE`
  - `RECENT LEARNING MEMORY`
  - `PERSONALIZED TUTORING RULES`
  - relevant retrieval hints
- [Inherited] Inject only top-k high-value items, not whole transcript or whole memory.
- [Inherited] UI/session restoration can use full transcript history, but teacher restoration should use compressed context only.
- [Inherited] Behavior modes should be materially different:
  - `light`: conversation-first
  - `default`: balanced
  - `strong`: correction-first

### 5. Current Memory Architecture
- [Inherited] Memory update currently happens on session disconnect.
- [Inherited] Current memory pipeline:
  - extract semantic / episodic / procedural candidates
  - retrieve top-k old memories with embeddings
  - reconcile with add / update / delete / none
  - rebuild latest/profile buckets
  - update vector store
- [Inherited] Embedding model: `text-embedding-3-small`
- [Inherited] MongoDB Atlas vector index was updated to support filters like `userId`, `bucket`, `kind`, `status`, and `itemId`.
- [Inherited] Data shapes currently include:
  - `lg_memory`
  - `memory_items`
  - vector-store collection
- [Inherited] Settings UI should prefer aggregated semantic interest labels over raw item lists.

### 6. Current State
- [Inherited] Interface 1 explanation flow uses selected text plus video title and subtitle context to ask Gemini for context-aware explanation.
- [Inherited] Saved vocabulary initializes a backend record and FSRS card.
- [Inherited] Interface 2 loads due words, memory bootstrap, and starts an OpenAI Realtime teacher session.
- [Inherited] Review mode uses scene planning plus async scene rating and FSRS updates.
- [Inherited] Session disconnect currently triggers memory flush/consolidation from the frontend side.
- [Inherited] Reliability gap: if the browser closes during memory shaping, memory update may be lost.

### 7. Active Focus
- [Inherited] Default framing for future work in this repo should emphasize engineering system design, not generic English-learning marketing.
- [Inherited] For interview-related threads, prefer the ByteDance developer-services framing:
  - multi-context AI frontend system
  - browser extension + realtime voice + stateful workflows
  - async decoupling
  - structured memory
  - engineering and platform thinking
- [Open] Memory update durability should eventually move from frontend-triggered consolidate to backend job + worker + retry + idempotency.
- [Open] Behavior-level differentiation between `light/default/strong` should be enforced via concrete behavior protocol, not only tone text.

### 8. Recent Verified Progress
- [Inherited] The best explanation for long-term memory is now "extract -> retrieve top-k -> reconcile -> rebuild", not naive string merge.
- [Inherited] The best explanation for teacher context is now "prompt blocks", not whole-object injection.
- [Inherited] Atlas vector filtering was already improved to reduce post-fetch filtering in app code.
- [Inherited] The session/transcript vs teacher-injection distinction is already conceptually settled.
- [Inherited] The reliability limitation of disconnect-time memory consolidation is already identified and should not be hand-waved away.

### 9. Open Questions And Risks
- [Open] Which parts of the inherited architecture summary have diverged from current code and need re-verification?
- [Open] What exact persistence and job model should back memory consolidation?
- [Open] How should current tutoring behavior be measured so `light/default/strong` changes are testable instead of subjective?
- [Open] Which monitoring and APM story best matches the project if the focus shifts to platform/interview preparation?

### 10. Important File Entry Points
- `AGENTS.md`
- `current_plan.md`
- `Mark1/server.js`
- `Mark1/voiceServer.js`
- `Mark1/public/serviceWorker.js`
- `Mark1/public/contentScript.js`
- `Mark1/src/`
- `vocabularyBackend/`
- `vocabularyBackend/fsrs-service/app.py`

## Best-Practice Summary For This File
- Store stable facts, not raw history.
- Separate pinned context from current working memory.
- Keep only high-value recent milestones.
- Keep unresolved questions explicit.
- Rehydrate from files and code, not from months of thread history.
- Prefer updating this file at milestone boundaries and before starting a fresh thread.

## Prompt Template: Refresh This File

Use this when a thread is ending, getting too large, or after a meaningful feature milestone.

```text
Read `AGENTS.md`, `current_plan.md`, and `external_project_context_for_Codex.md`.

Your task is to refresh `external_project_context_for_Codex.md` so it becomes the durable handoff memory for the next Codex thread.

Rules:
1. Keep the file concise and high-signal.
2. Preserve the existing section structure unless there is a strong reason to change it.
3. Update `Last updated`.
4. Prefer system-level facts, architecture decisions, active workstreams, and verified milestones.
5. Remove stale or superseded bullets instead of appending duplicate summaries.
6. Mark each bullet as `[Verified]`, `[Inherited]`, or `[Open]`.
7. If code and old summary conflict, prefer the code and rewrite the file accordingly.
8. Do not paste long transcripts, logs, or large code snippets into this file.
9. Keep `Stable Decisions` low-churn and move short-term changes into `Current State`, `Active Focus`, or `Recent Verified Progress`.
10. If something is uncertain, put it in `Open Questions And Risks` instead of stating it as fact.

Focus especially on updating these sections:
- `Current State`
- `Active Focus`
- `Recent Verified Progress`
- `Open Questions And Risks`
- `Important File Entry Points` if the project structure changed
```

## Prompt Template: Bootstrap A New Thread

Use this at the start of a fresh thread.

```text
This thread continues work on MARK II in `/Users/daqingchen/Vocabulary-Builder-App`.

Before doing anything substantial:
1. Read `AGENTS.md`.
2. Read `current_plan.md`.
3. Read `external_project_context_for_Codex.md`.

Then build your working understanding using this priority order:
- source code and current files
- `external_project_context_for_Codex.md`
- `current_plan.md`
- anything newly provided in this thread

Working rules:
- Treat `Stable Decisions` in `external_project_context_for_Codex.md` as default architecture constraints unless current code disproves them.
- Treat `Current State`, `Active Focus`, and `Recent Verified Progress` as the main handoff memory.
- If you discover divergence between code and the context file, say so explicitly and update the file after the work is complete.
- Keep answers concise unless the user asks for depth.
- When discussing MARK II, default to engineering/system framing rather than generic product marketing framing.
```

## Prompt Template: Future Skill Behavior

This is the core behavior prompt that can later be turned into a repo-level skill such as `$summarize_project_context`.

```text
You are maintaining the durable project handoff memory for this repository.

Your job is to keep `external_project_context_for_Codex.md` accurate, compact, and useful for starting a brand-new Codex thread with minimal chat-history dependence.

You must:
- read the current context file before editing it
- prefer verified facts over inherited assumptions
- preserve stable architecture decisions unless current code disproves them
- rewrite stale sections instead of appending endless summaries
- keep only high-value state that future threads actually need
- avoid raw transcripts, debug noise, and long code excerpts
- keep active work, open risks, and recent verified progress explicit

Your output should be an updated version of `external_project_context_for_Codex.md`, not a separate summary elsewhere.
```
