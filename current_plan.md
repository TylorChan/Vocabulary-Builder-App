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

## System Flow (3 Core Operations)

### OPERATION 1: START REVIEW SESSION

```
Frontend → GET /api/review/start

Spring Boot (FSRSScheduler):
  1. Check Redis cache: "fsrs:cards:user123"
  2. If cache miss:
     - Query MongoDB: WHERE fsrsCard.dueDate <= NOW
     - Sort by dueDate ASC, LIMIT 20
     - Store in Redis (TTL: 5 min)
  3. Create in-memory session

Response: {sessionId, words: [...20 cards]}
```

---

### OPERATION 2: TRACK REVIEW PROGRESS

```
Voice Agent (Frontend):
  - User reviews each word with AI tutor
  - Collects ratings locally: [{wordId, rating}, ...]
  - No backend communication during review

Spring Boot Session:
  - Session object in-memory (HashMap)
  - Waiting for completion signal
```

---

### OPERATION 3: COMPLETE SESSION & UPDATE FSRS

```
Frontend → POST /api/review/complete
Body: {sessionId, reviews: [{wordId, rating}, ...]}

Spring Boot (ReviewService):
  1. For each review:
     a. Load VocabularyEntry from MongoDB
     b. HTTP POST to Python FSRS Service:
        URL: http://fsrs-service:5000/review
        Body: {card: {...}, rating: 3}
     c. Receive updated FSRS card
     d. Update VocabularyEntry.fsrsCard
  2. Batch save to MongoDB
  3. Invalidate Redis cache: DEL fsrs:cards:user123
  4. Remove session from memory

Python FSRS Service (Flask):
  - Receives card + rating
  - Runs py-fsrs algorithm
  - Returns updated card with new:
    * difficulty
    * stability
    * dueDate
    * state
```

---

## Updated Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  API LAYER (GraphQL)                                     │
│  ├─ startReviewSession()                                 │
│  ├─ completeReviewSession(sessionId, reviews)            │
│  └─ saveVocabulary(input)                                │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  APPLICATION LAYER (Services)                            │
│                                                           │
│  FSRSScheduler                                           │
│  ├─ getCardsForReview(userId)                            │
│  │   └─> Uses CachePort (Redis)                         │
│                                                           │
│  ReviewService                                            │
│  ├─ createSession(userId)                                │
│  └─ completeSession(sessionId, reviews)                  │
│      ├─> Calls FSRSClient                                │
│      ├─> Updates MongoDB                                 │
│      └─> Invalidates Redis cache                         │
│                                                           │
│  FSRSClient (NEW)                                        │
│  └─> HTTP client to Python service                       │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  DOMAIN LAYER                                             │
│  ├─ VocabularyEntry (id, text, definition, fsrsCard)    │
│  ├─ FSRSCard (difficulty, stability, dueDate, state)    │
│  └─ FSRSState enum (NEW/LEARNING/REVIEW/RELEARNING)     │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                     │
│  ├─ MongoDB (VocabularyRepository)                       │
│  └─ Redis (CachePort)                                    │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  EXTERNAL MICROSERVICE                                     │
│  └─ Python FSRS Service (Flask + py-fsrs)                │
└───────────────────────────────────────────────────────────┘
```

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

### Week 3: Complete Feedback Loop

**Goal:** End-to-end vocabulary review workflow

**Deliverables:**

**1. ReviewService Implementation**
   - `startSession()`: Call FSRSScheduler, create session
   - `completeSession()`:
     * For each review, call FSRSClient
     * Update MongoDB with new FSRS data
     * Invalidate Redis cache
   - In-memory session storage (ConcurrentHashMap)

**2. GraphQL API Layer**
   - Mutation: `startReviewSession` → returns session ID + cards
   - Mutation: `completeReviewSession(sessionId, reviews)`
   - Update schema.graphqls with new types

**3. Voice Agent Integration**
   - Frontend calls startReviewSession
   - Voice agent collects ratings
   - Frontend calls completeReviewSession

**4. End-to-End Testing**
   - Full workflow: Start → Review → Complete
   - Verify FSRS schedules update correctly
   - Check cache invalidation works

**Success Criteria:**
- Complete review session updates all card schedules
- Next session shows newly calculated due dates
- No data loss or inconsistencies

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
