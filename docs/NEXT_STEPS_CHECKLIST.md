# NEXT STEPS CHECKLIST — Path-to-MVP  
_Yeyzer AI Match-Assistant_

---

## Legend
| Symbol | Meaning |
| ------ | ------- |
| ⚡ | Quick-win (< 1 h) |
| ⏳ | Moderate (1 – 3 h) |
| 🛠  | Complex (> 3 h) |
| 🔗 | Dependency on previous item |
| ✅ | Success criterion |

---

## 1 · Environment Setup (≈ 2 h)

| # | Task | Type | Est. | Dependencies | Success Criteria |
| - | ---- | ---- | ---- | ------------ | ---------------- |
| 1.1 | Clone repo & install deps (`npm ci`) | ⚡ | 0.1 h | — | `node_modules` present |
| 1.2 | Copy `.env.example` → `.env` (fill DB creds) | ⚡ | 0.1 h | 1.1 | `.env` exists |
| 1.3 | `make docker-up` – start infra containers | ⏳ | 0.2 h | 1.2 | `docker ps` shows postgres/redis/qdrant healthy |
| 1.4 | `make db-reset` – migrate + seed mock data | ⏳ | 0.3 h | 1.3 | psql `SELECT count(*) FROM users` ≥ 10 |
| 1.5 | `make dev-auth` – run Auth svc | ⚡ | 0.2 h | 1.4 | `GET /health` 200 |
| 1.6 | Run smoke script (`curl /api/auth/register`) | ⚡ | 0.1 h | 1.5 | JWT returned |

✅ **Environment ready** when 1.6 passes.

---

## 2 · Service Implementation Order (Back-End) (≈ 12 h)

| P | Service / Feature | Type | Est. | Depends On | Success Criteria |
| - | ----------------- | ---- | ---- | ---------- | ---------------- |
| 2.1 | **Profile Svc** – CRUD profile & ideal-persona | ⏳ | 2 h | 1.6 | GraphQL `updateUserProfile` mutation works |
| 2.2 | **Match Engine v0** – random-vector similarity nightly cron | ⏳ | 2 h | 2.1 | `myMatches` returns ≥ 3 matches |
| 2.3 | **Conversation Svc** – create icebreaker (template) | ⏳ | 1.5 h | 2.2 | icebreaker row linked to match |
| 2.4 | **Chat Relay** – Socket.io in Gateway, persist messages | 🛠 | 3 h | 2.3 | Message sent appears in second session |
| 2.5 | **Venue Svc** – hard-coded list, midpoint calc | ⏳ | 1.5 h | 2.2 | 3 venue recommendations per match |
| 2.6 | **Safety Svc** – report endpoint + check-in scheduler (stub) | ⏳ | 2 h | 2.4 | POST /reports returns 201 |

✅ MVP back-end considered “feature-complete” when 2.6 passes and all `/readyz` endpoints green.

---

## 3 · Front-End Development (Next.js) (≈ 8 h)

| # | Page / Component | Type | Est. | Depends On | Success Criteria |
| - | ---------------- | ---- | ---- | ---------- | ---------------- |
| 3.1 | Auth Pages: sign-up / login (email) | ⏳ | 1 h | 1.6 | Can log in, token stored |
| 3.2 | Onboarding Wizard → persona form | 🛠 | 1.5 h | 3.1, 2.1 | Persona saved, redirect to dashboard |
| 3.3 | Dashboard: match cards grid | ⏳ | 1 h | 2.2 | Displays cards with score chip |
| 3.4 | Icebreaker modal + 1-click accept | ⏳ | 0.8 h | 2.3, 3.3 | Accept updates match status |
| 3.5 | Chat view (Socket.io stream) | 🛠 | 2 h | 2.4, 3.4 | Real-time message echo |
| 3.6 | Venue picker sheet | ⏳ | 0.7 h | 2.5, 3.5 | Choose venue, match status → SCHEDULED |
| 3.7 | Basic mobile responsiveness | ⏳ | 1 h | 3.1-3.6 | Lighthouse mobile score ≥ 80 |

✅ **Frontend done** when user flow **register → match → chat → schedule** works E2E.

---

## 4 · Testing & QA Milestones (≈ 4 h)

| Phase | Checkpoint | Tools | Success Gate |
| ----- | ---------- | ----- | ------------ |
| T1 | Unit tests ≥ 80 % for new code | Jest + ts-jest | `npm run test` green |
| T2 | Contract tests Gateway→services | Pact | CI passes |
| T3 | Integration smoke (register→match) | Supertest / Postman | 0 failures |
| T4 | Load test 20 VU 5 min p95 ≤ 1.5 s | k6 | Threshold met |
| T5 | Security scan (npm audit + Trivy) | GitHub Action | No Critical/High CVEs |

---

## 5 · Timeline Forecast

| Block | Hours | Cumulative |
| ----- | ----- | ---------- |
| Environment | 2 | 2 |
| Back-End | 12 | 14 |
| Front-End | 8 | 22 |
| Testing | 4 | **26** |

Slack buffer for unforeseen issues: **+4 h**  
🚀 **Target**: 30 h to demo-ready MVP.

---

## 6 · Success Criteria (Definition of Done)

1. `make docker-up && make db-reset` brings up a **clean, functional stack** in < 10 min.
2. E2E flow: sign-up → complete persona → receive ≥ 3 matches → accept icebreaker → chat → schedule venue, all without errors.
3. All health checks `/readyz` return **READY**.
4. CI pipeline green: lint, tests, Trivy, Pact.
5. Prometheus dashboard shows p95 latency ≤ 1.5 s under 20 VU load.
6. No Critical/High vulnerabilities in dependencies or container images.

---

## 7 · Dependencies Graph (Simplified)

```
Env → Auth
              ↘
          Profile  → MatchEngine → Conversation → Chat
                                       ↘
                             Venue  → Frontend
Safety (independent after Chat)
Testing runs once all services exist
```

---

## 8 · Quick Wins vs Complex Tasks

### Quick Wins (⚡ ≤ 1 h)
- Env setup (docker-up, db seed)
- `.env` configuration
- Health & readyz endpoints
- Static icebreaker templates
- Hard-coded venue list
- Lint & Prettier integration

### Complex Tasks (🛠 > 3 h)
- Real-time chat relay with persistence
- Responsiveness & UX polish
- Matching algorithm tuning
- Safety service automation (check-ins)
- k6 load/chaos testing setup

Focus on quick wins early to unlock UI demo value, then tackle complex tasks in parallel streams.

---

_Updated: 2025-06-14_  
Owner: **Engineering Lead** – assign tasks via GitHub Projects “MVP Sprint #1”.  
