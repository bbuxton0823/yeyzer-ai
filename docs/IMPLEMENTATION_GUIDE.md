# Yeyzer AI Match-Assistant – Implementation Guide
_Last updated: 2025-06-14_

---

## 0. Orientation

| Item | Value |
|------|-------|
| Code base | Monorepo (`yeyzer-ai`) with npm workspaces |
| Core stack | Next.js (Frontend) • Node.js/TS micro-services • PostgreSQL • Redis • Qdrant • Docker/K8s |
| Time-box | 48 h MVP sprint → rolling weekly iterations |

---

## 1. Phased Roadmap  

| Phase | Duration | Goal |
|-------|----------|------|
| **P1 — Core MVP** | H0-H24 | End-to-end happy path (email auth + LinkedIn OAuth, persona form, nightly matching, chat w/ icebreaker, manual venue entry, basic dashboards) |
| **P2 — Enhanced Features** | H24-H40 | External data ingestion, automated venue recommender, voice prototype, safety hooks |
| **P3 — Production Hardening** | H40-H72+ | Performance, autoscaling, observability, security audits, blue/green deploys |

### 1.1 Deliverables per Phase

#### P1 — Core MVP
1. Auth Service live (email & LinkedIn).  
2. Profile Service with persona CRUD.  
3. Match Engine v0: cosine similarity on mock embeddings.  
4. Conversation Service: LLM-generated icebreakers (OpenAI).  
5. Gateway GraphQL → Next.js signup/onboarding flow.  
6. Docker Compose + single-node K8s manifest.  
7. Unit tests ≥80 % for auth & profile.

#### P2 — Enhanced Features
1. **Scraper Service**: mock providers replaced by live APIs (rate-limited).  
2. **Venue Service**: Google Places midpoint algo, 3 suggestions ⇒ GraphQL.  
3. Voice Service (WebSocket, Whisper STT → text, ElevenLabs TTS).  
4. Safety Service (report endpoint, check-in scheduler).  
5. Prometheus + Grafana dashboards imported.  
6. Integration tests covering end-to-end match & meet-up path.

#### P3 — Production Hardening
1. Autoscaling HPA (CPU+latency) to 50 req/s.  
2. p95 latency ≤1.5 s under load (k6 script).  
3. SOC-2/GDPR placeholder docs + data-deletion lambda.  
4. Blue/Green Helm chart + canary traffic splitting.  
5. SecOps: Trivy clean scan, dependency check, OWASP ZAP baseline.  
6. Chaos test: kill services, ensure retry/backoff & circuit-breakers.

---

## 2. Mock Data Strategy

| External API | Mock Plan (P1) | Gradual Swap-out (P2) |
|--------------|----------------|-----------------------|
| LinkedIn | Use static JSON fixtures for profile/headline/skills | Live OAuth + scraping after consent |
| GitHub | Top repositories & languages via seeded JSON | REST / GraphQL API with PAT |
| X/Twitter | Recent 20 tweets from fixture file | Twitter API (bearer) when quotas acquired |
| Crunchbase | Funding rounds fixture | Crunchbase v4 API |
| Google Places | CSV of Bay Area cafés | REST call on feature flag (`FEATURE_VENUE_RECOMMENDATIONS`) |
| Whisper / ElevenLabs | Stubbed transcriptions & .wav responses | Real endpoints behind API keys |

Guidelines:
* Central folder `mock-data/` with provider-keyed files.  
* Service reads `USE_MOCK_DATA=true` env flag; switch in CI vs. staging.  
* Keep schema identical so swap-out is transparent.

---

## 3. Testing Strategy

| Layer | Tools | P1 | P2 | P3 |
|-------|-------|----|----|----|
| Unit | Jest + ts-jest | core logic, >80 % | maintain | freeze SLA |
| Contract | Pact (consumers) | Gateway→Auth | add other services | gating in CI |
| Integration | Supertest + docker-compose | Auth + Profile | full E2E happy path | include scraper/live |
| Load | k6 | N/A | 20 VU smoke | ≥100 VU, p95 ≤1.5 s |
| Security | npm audit | baseline | Trivy image scan | OWASP-ZAP baseline |
| Chaos | N/A | N/A | simulate Redis outage | Litmus/chaos-mesh |

CI stages (`.github/workflows/ci-cd.yml`) already wired.

---

## 4. Deployment Checkpoints

1. **Local Dev**  
   `make docker-up` → http://localhost:3000 GraphQL ready.  

2. **Staging (H24)**  
   GitHub Action auto-push images with `sha-<commit>` tag, Helmfile sync to `yeyzer-staging`.  
   ✅ Smoke tests passed, health/readyz green.

3. **Production Pilot (H48-H60)**  
   Tag `v0.1.0` triggers prod deploy (20 % traffic).  
   Alert thresholds: error rate <2 %, latency <1.5 s.

4. **Full Production**  
   Promote to 100 % after 24 h soak, enable voice & venue flags.

---

## 5. Best Practices & Pitfalls

| ✅ Do | ❌ Avoid |
|-------|---------|
| Start with thin vertical slice (auth→match→chat) | Building all micro-services before UX works |
| Feature-flag every external integration | Hard-coding live API keys in repo |
| Use Zod for all DTO validation | Bypassing validation in service boundaries |
| Write contract tests before touching schema | Breaking GraphQL without versioning |
| Non-root Docker users, read-only FS | Running containers privileged |
| Automate DB migrations via init SQL | Manual pgAdmin tweaks |
| Budgets: 1.5 s p95, 50 req/s, <200 MB RAM per svc | Optimising prematurely without measuring |

---

## 6. Prioritised Feature Backlog

| P | Feature | Why |
|---|---------|-----|
| 0 | Email + LinkedIn auth | entry gate |
| 0 | Persona form & save | core matching |
| 0 | Basic matching (mock) nightly cron | deliver value quickly |
| 0 | Icebreaker generation | sparks conversation |
| 1 | Venue recommender (mock → live) | convert to meet-ups |
| 1 | Scraper pipelines | enrich data -> better matches |
| 1 | Mobile-ready Next.js PWA | usability |
| 2 | Voice interface | differentiation |
| 2 | Safety hooks (report, check-in) | trust |
| 3 | Payments / monetisation | out-of-scope for now |

---

## 7. Resource Requirements

| Role | Hrs (Phase) | Responsibility |
|------|-------------|----------------|
| Tech Lead | 4 / 4 / 6 | Architecture, code reviews |
| Backend Eng (2) | 16 / 24 / 24 | Micro-services, DB, CI |
| Frontend Eng | 8 / 12 / 16 | Onboarding, chat, voice UI |
| DevOps Eng | 2 / 6 / 12 | K8s, Observability, Security |
| Data Scientist | 4 / 10 / 12 | Embeddings, similarity tuning |
| QA / SDET | 2 / 6 / 10 | Test harness, load tests |
| PM / UX | 4 / 6 / 8 | Scope guard, user feedback |
| Total (person-hours) | **40** / **68** / **88** |

Hardware:
* Dev laptops (Docker 16 GB RAM)  
* Staging: K8s cluster 4 × vCPU, 8 GB RAM  
* Prod: HPA min 3 max 12 pods/service; Postgres db-r5.large

---

## 8. Timeline Gantt (48 h Sprint)

```
H0   Repo bootstrap ─┬─➤
H4   Auth+Profile API│
H12  Match Engine v0 │
H20  Gateway+Next UI │
H24  Staging deploy  ┴──➤ Smoke test
H24-30 Scraper MVP
H30-36 Venue, voice prototype
H36-46 QA, load test, Grafana
H46-48 Demo video + deck
```

---

## 9. Definition of “Done”

* All mandatory endpoints covered by unit + integration tests.  
* Green CI; container images tagged & pushed.  
* Staging environment reproduces local setup via Helm.  
* README quick-start works on new machine within 10 min.  
* p95 latency and error-rate dashboards green.  
* Security scan: no critical/high CVEs.  
* PM demo: create account → get matches → accept icebreaker → pick venue.

---

### Appendix A – Useful Make Targets

| Command | Purpose |
|---------|---------|
| `make dev-auth` | Hot-reload auth service |
| `make docker-up` | Launch full local stack |
| `make db-reset` | Recreate DB schema |
| `make codegen` | Update TS GraphQL types |
| `make deploy-staging` | Manual staging push |

---

_End of file_
