# Yeyzer AI Match-Assistant

Fostering authentic, real-world connections among professionals by pairing AI-powered persona matching with automated ice-breakers, venue suggestions, and voice-first interaction.

---

## 1. Project Overview & Mission
Yeyzer harvests publicly available professional signals (LinkedIn, GitHub, X/Twitter, Crunchbase), ranks candidate matches against each user’s *Ideal Persona*, and then shepherds the pair from first chat to first in-person meeting.  
**Mission:** Remove friction from professional networking and increase meaningful, in-person conversations.

Key MVP success targets  
| Goal | Metric | Target |
|------|--------|--------|
| Automated persona matching | ≥3 qualified matches delivered within 24 h | 80 % of users |
| Conversation ignition | 1-click ice-breaker acceptance | 60 % |
| Meet-up conversion | Pairs that schedule a venue via agent | 30 % |

---

## 2. High-Level Architecture

```mermaid
graph TD
  subgraph Frontend
    FE[Next.js Web App]
  end

  subgraph Gateway
    APIGW[API Gateway<br/>(GraphQL)]
  end

  subgraph Services
    AUTH[Auth Service]
    PROFILE[Profile Service]
    SCRAPER[Scraper Service]
    MATCH[Match Engine]
    CHAT[Conversation Service]
    VENUE[Venue Recommender]
    VOICE[Voice Pipeline]
    SAFETY[Safety Hooks]
  end

  subgraph Data
    PG[(PostgreSQL)]
    REDIS[(Redis Cache)]
    VECDB[(Vector DB)]
    OBS[(Prometheus<br/>+ Grafana)]
  end

  FE --> APIGW
  APIGW --> AUTH
  APIGW --> PROFILE
  APIGW --> MATCH
  APIGW --> CHAT
  APIGW --> VENUE
  APIGW --> VOICE
  APIGW --> SAFETY

  SCRAPER --> PROFILE
  AUTH --> PG
  PROFILE --> PG
  MATCH --> VECDB
  MATCH --> PG
  SCRAPER --> REDIS
  VENUE --> REDIS
  SERVICES --> OBS
```

---

## 3. Quick Start Guide

```bash
# 1. Clone
git clone https://github.com/yeyzer/yeyzer-ai.git && cd yeyzer-ai

# 2. Bootstrap environment
cp .env.example .env                # fill values as needed
docker compose up --build -d        # brings up full stack

# 3. Seed some demo data
docker compose exec match-engine npm run seed

# 4. Open the web client
open http://localhost:3000
```

> Prerequisites: Docker 20+, docker-compose plugin, make, and Node 18+ for local package scripts.

---

## 4. Services Overview

| Service | Tech | Responsibilities |
|---------|------|------------------|
| **Auth** | Node/TS + Passport.js | OAuth 2.0 (LinkedIn), JWT issuance, session management |
| **Profile** | Node/TS + Prisma | Store user profile, persona prefs, consent toggles |
| **Scraper** | Python + Celery | Harvest public data from LinkedIn, GitHub, X/Twitter, Crunchbase; cache in Redis; nightly refresh |
| **Match Engine** | TS + Python (embeddings) | Generate embeddings, similarity scoring, nightly re-rank; persists vectors to Qdrant |
| **Conversation** | Node/TS | Create ice-breakers (LLM), profanity filtering, chat relay |
| **Venue Recommender** | Go | Google Maps Places midpoint & radius logic |
| **Voice Pipeline** | Rust | Wake-word / PTT → Whisper (STT) → LLM routing → ElevenLabs (TTS) |
| **Safety Hooks** | Node/TS | Mask contact info, report button, check-in scheduler |

---

## 5. Public API (GraphQL Gateway)

### Core Types
```graphql
type Match {
  id: ID!
  userId: ID!
  partnerId: ID!
  score: Float!
  venues: [Venue!]!
  icebreaker: String!
  createdAt: DateTime!
}

type Query {
  feedMatches: [Match!]!
}

type Mutation {
  acceptIcebreaker(matchId: ID!): Boolean!
  scheduleVenue(matchId: ID!, venueId: ID!): Boolean!
  reportUser(userId: ID!, reason: String!): Boolean!
}
```
Detailed schema is generated from `./gateway/schema.graphql`.

---

## 6. Deployment

1. **Container Build**
   ```bash
   make docker-build      # multi-arch images
   ```

2. **Kubernetes**
   ```bash
   # apply all Helm charts
   helmfile sync
   ```
   Cluster expectations: K8s 1.29+, autoscaler enabled, LB with TLS termination.

3. **CI/CD**
   GitHub Actions:  
   - PR → Lint + Test  
   - Merge to `main` → Build → Push images → Helm upgrade  

---

## 7. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (`development` / `production`) | `development` |
| `DATABASE_URL` | PostgreSQL DSN | — |
| `REDIS_URL` | Redis connection | — |
| `VECTOR_URL` | Qdrant host | `http://qdrant:6333` |
| `JWT_SECRET` | Signing secret | — |
| `LINKEDIN_CLIENT_ID/SECRET` | OAuth creds | — |
| `GITHUB_TOKEN` | GitHub API PAT | — |
| `TWITTER_BEARER` | X/Twitter bearer token | — |
| `GOOGLE_PLACES_KEY` | Maps API key | — |
| `OPENAI_API_KEY` | Optional LLM provider | — |
| `ELEVENLABS_KEY` | TTS provider key | — |

Full list in `.env.example`.

---

## 8. Development Workflow

1. Branch from `main` → `feat/<topic>`  
2. Commit with Conventional Commits (`feat:`, `fix:` …)  
3. Push → PR triggers CI (lint, unit tests, contract tests)  
4. Review guidelines enforced by `.droid.yaml`  
5. Merge → auto-deploy to staging  
6. Promote to prod via GitHub Release

Local helpers  
```bash
make dev          # hot-reload all Node services
make test         # run complete test suite
make lint         # eslint + prettier
```

---

## 9. Monitoring & Metrics

| Component | Metrics |
|-----------|---------|
| Prometheus | Request latency, error rates, match scoring time |
| Grafana Dashboards | p95 latency (goal ≤ 1.5 s), scrape freshness, venue API quota |
| Alertmanager | Slack alerts on SLA breach, 5xx error burst |

Health endpoints: `GET /healthz`, `GET /readyz`.

---

## 10. Security Considerations

* TLS 1.3 enforced end-to-end  
* OAuth tokens encrypted at rest (AES-256)  
* Rate limiting & bot mitigation (`express-rate-limit`, CAPTCHA on signup)  
* Contact info redaction in chat layer  
* LLM content moderation (OpenAI policy / HuggingFace `profanity-check`)  
* GDPR-ready consent toggles; user-initiated data deletion  
* Secrets managed via HashiCorp Vault + sealed-secrets in K8s  
* Continuous dependency scanning (`npm audit`, `trivy`)  

---

## 11. Contributing

Please read `CONTRIBUTING.md` for coding standards, issue triage, and the project’s Code of Conduct.

---

© 2025 Yeyzer Inc. All rights reserved.
