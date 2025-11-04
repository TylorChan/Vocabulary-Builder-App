# FSRS Implementation Plan (MongoDB + Redis + Python Microservice)

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│  Chrome Extension (Frontend)                              │
│  - TrackCaption (Interface 1)                             │
│  - VoiceAgent (Interface 2)                               │
└────────────────────┬──────────────────────────────────────┘
                     │ GraphQL
                     ▼
┌───────────────────────────────────────────────────────────┐
│  Spring Boot Backend (Port 8080)                          │
│  - GraphQL API                                            │
│  - ReviewService                                          │
│  - FSRSScheduler                                          │
│  - MongoDB queries                                        │
└────────────────────┬──────────────────────────────────────┘
                     │ HTTP POST /review
                     ▼
┌───────────────────────────────────────────────────────────┐
│  Python FSRS Service (Port 5000)                          │
│  - Flask REST API                                         │
│  - Official py-fsrs library (FSRS-4.5)                    │
│  - Guaranteed algorithm accuracy                          │
└───────────────────────────────────────────────────────────┘

                     ┌─────────────┐
                     │  MongoDB    │
                     │  (Port      │
                     │   27017)    │
                     └─────────────┘

                     ┌─────────────┐
                     │   Redis     │
                     │  (Port      │
                     │   6379)     │
                     └─────────────┘
```

---

## Review Session Loop Logic (Batch Processing with In-Memory Queue)

### OVERVIEW: Load Once, Process In-Memory, Save Once

**Pattern**: Load all cards at session start → Process reviews with Python FSRS only → Batch save at session end

**MongoDB Calls**: 2 total (1 load + 1 batch save) vs 40+ in naive approach = **95% fewer database operations**

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND (Voice Agent State)                            │
│                                                          │
│  1. START SESSION                                        │
│     GraphQL: startReviewSession(userId)                  │
│     ↓                                                    │
│     Backend MongoDB: Load 20 cards  ← DB CALL #1         │
│     ↓                                                    │
│     Frontend State:                                      │
│     - originalCards: [card1, card2, ...]                │
│     - updatedCards: {} (Map<id, FSRSCard>)              │
│     - queue: [card1, card2, ...]                        │
│                                                          │
│  2. REVIEW LOOP (In-Memory + Python Only)                │
│     WHILE queue not empty:                               │
│       ┌──────────────────────────────────────┐          │
│       │ card = queue.shift()                 │          │
│       │                                      │          │
│       │ rating = AI reviews with user       │          │
│       │                                      │          │
│       │ Call Python FSRS directly:          │          │
│       │ POST /review {card, rating}          │          │
│       │ ↓                                    │          │
│       │ updatedCard = response               │          │
│       │                                      │          │
│       │ Store in frontend state:             │          │
│       │ updatedCards[card.id] = updated      │          │
│       │                                      │          │
│       │ IF needsReReview (due <= today):    │          │
│       │   queue.push(card)  // Re-add        │          │
│       └──────────────────────────────────────┘          │
│                                                          │
│  3. END SESSION (Batch Save)                             │
│     GraphQL: saveReviewSession(updatedCards)             │
│     ↓                                                    │
│     Backend MongoDB: Batch update all cards ← DB CALL #2 │
│                                                          │
│  Total MongoDB Calls: 2  (98% reduction)                 │
│  Total Python FSRS Calls: N (number of reviews + re-reviews) │
└──────────────────────────────────────────────────────────┘
```

---

---

### OPERATION 1: START SESSION (MongoDB Call #1)

```
Frontend → GraphQL: startReviewSession(userId)
           ↓
Spring Boot (FSRSScheduler):
  1. MongoDB query: WHERE fsrsCard.dueDate <= TODAY
  2. Sort by dueDate ASC, LIMIT 20
  3. Return VocabularyEntry[] to frontend
           ↓
Response: [card1, card2, ..., card20]

Frontend State Initialized:
  - queue: [card1, card2, ..., card20]
  - updatedCards: {} (empty map)
```

---

### OPERATION 2: REVIEW LOOP (Python FSRS Only, No MongoDB)

```
For each card in queue (frontend loop):

  Frontend → Python FSRS Service DIRECTLY
  POST http://localhost:6000/review
  Body: {
    card: {difficulty, stability, due, state, lastReview, step},
    rating: 3,
    reviewTime: "2025-10-18T16:00:00Z"
  }
           ↓
  Python FSRS (Flask + py-fsrs):
    - Runs FSRS-4.5 algorithm
    - Returns updated card with new schedule
           ↓
  Frontend receives:
  {
    difficulty: 3.2,
    stability: 15.6,
    due: "2025-10-26T10:00:00Z",  // 8 days later
    state: "REVIEW",
    lastReview: "2025-10-18T16:00:00Z",
    step: 0
  }
           ↓
  Frontend Logic:
    1. Store: updatedCards[cardId] = updatedCard
    2. IF due <= endOfToday:
         queue.push(card)  // Re-add for immediate review
       ELSE:
         Move to next card

  Repeat until queue is empty
```

**Key Point**: No MongoDB access during this loop. All updates stored in frontend state only.

---

### OPERATION 3: END SESSION (MongoDB Call #2 - Batch Save)

```
Frontend queue is empty (all cards graduated)
           ↓
Frontend → GraphQL: saveReviewSession(updates)
Body: [
  {vocabularyId: "id1", fsrsCard: {...}},
  {vocabularyId: "id2", fsrsCard: {...}},
  ...
  {vocabularyId: "idN", fsrsCard: {...}}
]
           ↓
Spring Boot (ReviewService):
  1. Load all vocabulary entries by IDs
  2. Update each entry's fsrsCard with new data
  3. repository.saveAll(entries)  // Single batch MongoDB operation
           ↓
Response: {
  success: true,
  savedCount: 20
}

Optional: Invalidate Redis cache after save
```

---

## Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  API LAYER (GraphQL)                                     │
│  ├─ startReviewSession(userId) → Load cards             │
│  ├─ saveReviewSession(updates[]) → Batch save            │
│  └─ saveVocabulary(input)                                │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  APPLICATION LAYER (Services)                            │
│                                                           │
│  FSRSScheduler                                           │
│  └─ getCardsForReview(userId)                            │
│      └─> MongoDB: Find cards where due <= today          │
│                                                           │
│  ReviewService                                            │
│  ├─ startReviewSession(userId)                           │
│  │   └─> Calls FSRSScheduler.getCardsForReview()        │
│  └─ saveReviewSession(updates[])                         │
│      ├─> Load all VocabularyEntry by IDs                │
│      ├─> Update each entry's fsrsCard                    │
│      └─> repository.saveAll() ← Batch MongoDB save       │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  DOMAIN LAYER                                             │
│  ├─ VocabularyEntry (id, text, definition, fsrsCard)    │
│  ├─ FSRSCard (difficulty, stability, dueDate, state)    │
│  └─ FSRSState enum (LEARNING/REVIEW/RELEARNING)         │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                     │
│  ├─ MongoDB (VocabularyRepository)                       │
│  └─ Redis (Future: Cache getCardsForReview results)     │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  EXTERNAL MICROSERVICE (Called from Frontend)             │
│  └─ Python FSRS Service (Flask + py-fsrs)                │
│     └─ POST /review: Calculate FSRS schedules             │
└───────────────────────────────────────────────────────────┘
```

**Key Change**: Python FSRS is called **directly from frontend** during review loop, not through Spring Boot

---

## Implementation Phases (3 Weeks)

### Week 1: FSRS Foundation with Python Microservice

**Goal:** FSRS algorithm working via Python service

**Deliverables:**

**1. Python FSRS Microservice (NEW)**
   - Create `fsrs-service/` directory
   - Implement Flask app with py-fsrs library
   - Endpoints: `/health`, `/review`
   - Add Dockerfile for containerization
   - Test standalone with curl/Postman

**2. Spring Boot FSRS Client**
   - Create `FSRSClient` service (HTTP client using RestTemplate)
   - DTOs for request/response serialization
   - Error handling for service unavailability
   - Integration tests with mock responses

**3. FSRSScheduler Service**
   - Query MongoDB for cards where `fsrsCard.dueDate <= NOW`
   - Sort by dueDate ascending, limit 20
   - Return list of VocabularyEntry objects

**Success Criteria:**
- Python service responds to `/review` endpoint
- Spring Boot can call Python service successfully
- MongoDB query returns due cards

---

### Week 2: Redis Caching + Docker Compose

**Goal:** Speed up queries with Redis, orchestrate all services

**Deliverables:**

**1. Docker Compose Setup**
   - Define all services: Spring Boot, Python FSRS, MongoDB, Redis
   - Configure networking (all on same Docker network)
   - Volume mounts for development
   - Health checks for each service

**2. Redis Caching Layer**
   - Add Redis dependency to Spring Boot
   - Implement CachePort interface
   - Create RedisCacheAdapter
   - Integrate caching into FSRSScheduler

**3. Testing & Debugging**
   - Test inter-service communication in Docker
   - Verify Redis caching works
   - Monitor logs from all containers

**Success Criteria:**
- `docker-compose up` starts all services
- First query hits MongoDB, second hits Redis
- Python service accessible from Spring Boot container

---

### Week 3: Complete Feedback Loop (Batch Processing)

**Goal:** End-to-end vocabulary review workflow with batch persistence

**Deliverables:**

**1. ReviewService Implementation** ⏳ IN PROGRESS
   - `startReviewSession(userId)`: Delegates to FSRSScheduler → MongoDB load
   - `saveReviewSession(updates[])`:
     * Accept array of {vocabularyId, fsrsCard} updates
     * Load all VocabularyEntry by IDs
     * Update each entry's fsrsCard field
     * repository.saveAll() → Single batch MongoDB save

**2. GraphQL API Layer** ⏳ IN PROGRESS
   - Mutation: `startReviewSession(userId)` → List<VocabularyEntry>
   - Mutation: `saveReviewSession(updates[])` → SaveSessionResult
   - Input type: CardUpdateInput {vocabularyId, difficulty, stability, due, state, lastReview, step}
   - Update schema.graphqls with new types

**3. Frontend Voice Agent** ⏳ FUTURE
   - Load cards from startReviewSession
   - Initialize queue + updatedCards map
   - Review loop: Call Python FSRS directly, store updates in state
   - Re-add cards to queue if due <= endOfToday
   - On queue empty: Call saveReviewSession with all updates

**4. CORS Configuration** ⏳ FUTURE
   - Enable CORS on Python Flask service for frontend calls
   - Or: Proxy Python FSRS through Spring Boot for security

**5. End-to-End Testing**
   - Test: Start session → Get 20 cards → Review all → Batch save
   - Test: Cards rated 1 get re-added to queue
   - Verify: Only 2 MongoDB calls total
   - Verify: All updates persisted correctly

**Success Criteria:**
- ✅ FSRSScheduler returns due cards
- ⏳ GraphQL mutations exposed and tested
- ⏳ Batch save works with repository.saveAll()
- ⏳ Frontend can call Python FSRS directly
- ⏳ 95%+ reduction in MongoDB calls vs naive approach

---

## Data Model (MongoDB)

### vocabularies Collection

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "user123",
  "text": "ubiquitous",
  "definition": "present everywhere",
  "example": "Smartphones are ubiquitous in modern society",
  "exampleTrans": "智能手机在现代社会无处不在",
  "realLifeDef": "Something you see or find everywhere",
  "surroundingText": "...technology has become ubiquitous...",
  "videoTitle": "Tech Trends 2024",
  "createdAt": ISODate("2025-01-15T10:30:00Z"),

  "fsrsCard": {
    "difficulty": 5.2,
    "stability": 12.5,
    "dueDate": ISODate("2025-01-25T10:30:00Z"),
    "state": "REVIEW",
    "lastReview": ISODate("2025-01-20T14:22:00Z"),
    "reps": 3
  }
}
```

**Indexes:**
- `{userId: 1, "fsrsCard.dueDate": 1}` - Card selection queries
- `{userId: 1, text: 1}` - Duplicate checking

---

## Redis Data Structures

**FSRS Card Cache:**
- Key: `fsrs:cards:{userId}`
- Type: String (JSON array)
- TTL: 5 minutes
- Value: `[{id, text, fsrsCard}, ...]`

**Invalidation:** `DEL fsrs:cards:{userId}` after review session

---

## Docker Compose Structure

```yaml
services:
  spring-backend:
    build: ./vocabularyBackend
    ports: ["8080:8080"]
    depends_on: [mongodb, redis, fsrs-service]
    environment:
      - FSRS_SERVICE_URL=http://fsrs-service:5000

  fsrs-service:
    build: ./fsrs-service
    ports: ["5000:5000"]

  mongodb:
    image: mongo:7
    ports: ["27017:27017"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

---

## System Design Decisions

### Why Python Microservice for FSRS?

**Pros:**
- ✅ Official py-fsrs library (guaranteed algorithm accuracy)
- ✅ Easy updates when FSRS team releases new versions
- ✅ Leverages existing Flask/Python knowledge
- ✅ Future Python features (ML, spaCy NLP)
- ✅ Demonstrates microservices architecture on resume

**Cons:**
- ⚠️ Additional deployment complexity (Docker Compose required)
- ⚠️ Network latency (HTTP calls ~5-10ms overhead)
- ⚠️ More services to monitor and debug

**Why Worth It:**
- Algorithm correctness > convenience
- FSRS calculations are infrequent (only after review sessions)
- Network overhead negligible (<1% of total request time)

---

### Why MongoDB?
- Already in use for vocabulary storage
- Embedded fsrsCard = single read
- Flexible schema for metadata

### Why Redis?
- MongoDB queries expensive with large vocabulary
- 5-min cache balances freshness vs performance
- Simple invalidation after updates

### Why In-Memory Sessions?
- Review sessions short-lived (10-20 min)
- Single Spring Boot instance (no distributed deployment)
- ConcurrentHashMap sufficient for MVP

---

## What's NOT in This Plan

❌ **RabbitMQ** - Synchronous FSRS calls are fine for MVP
❌ **Kubernetes** - Docker Compose sufficient for development
❌ **Advanced Monitoring** - Console logs + Docker logs sufficient
❌ **Service Mesh** - Only 2 services, direct HTTP calls fine

---

## Key Benefits

✅ **Official FSRS Algorithm** - No porting bugs, guaranteed accuracy
✅ **Modular Architecture** - Python service replaceable if needed
✅ **Docker Development Parity** - Dev/Prod consistency
✅ **Portfolio Story** - Demonstrates microservices understanding
✅ **Future Extensibility** - Easy to add Python ML features

---

## Current Progress

✅ **Week 1 Progress:**
- ✅ Created FSRSCard.java (embedded document model)
- ✅ Created FSRSState.java (enum for states)
- ✅ Updated VocabularyEntry with embedded fsrsCard
- ✅ Tested data persistence in MongoDB

**Next Steps:**
1. Create Python FSRS microservice
2. Implement Flask endpoints
3. Test Python service standalone
4. Create Spring Boot HTTP client
