# START HERE – Quick Launch Guide 🚀

Get the Yeyzer AI Match-Assistant running on your machine in **< 10 minutes**.

---

## 1 · Prerequisites

| Tool | Version (min) |
|------|---------------|
| Docker Desktop | 20+ |
| docker-compose plugin | v2 |
| Node.js | 18 LTS |
| Make | any |

> macOS users: `brew install docker make`, Windows WSL2 users: enable Docker Desktop WSL integration.

---

## 2 · Clone & Configure

```bash
# 1. Clone the repo you just pushed
git clone https://github.com/bbuxton0823/yeyzer-ai.git
cd yeyzer-ai

# 2. Install workspace dependencies
npm ci               # ~1-2 min

# 3. Copy environment template
cp .env.example .env # adjust ports/keys only if they clash locally
```

_No API keys needed for the mock-data MVP._

---

## 3 · Launch Infrastructure

```bash
# Build & run Postgres, Redis, Qdrant, Prometheus, etc.
make docker-up             # first run pulls images (~1 GB)

# Prepare database (schema + mock seed data)
make db-reset              # creates >10 demo users with matches
```

Check everything is **healthy**:

```bash
docker compose ps          # STATUS should be "healthy"
```

---

## 4 · Start Backend Services

For the slim MVP we only need **Auth** to confirm the stack works:

```bash
make dev-auth              # hot-reload auth service on http://localhost:4001
```

Health check:

```bash
curl http://localhost:4001/health        # → {"status":"UP"}
```

Register a demo account:

```bash
curl -X POST http://localhost:4001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@local.dev","password":"Password123!","firstName":"Demo","lastName":"User"}'
```

Response returns a **JWT** – success! 🔑

---

## 5 · What to Build First (Next 4–6 h)

| Priority | Component | Why |
|----------|-----------|-----|
| 1 | **Profile Service** (`services/profile`) | Save persona data – feeds matcher |
| 2 | **Match Engine v0** (`services/match-engine`) | Turn mock vectors into live similarity scores |
| 3 | **Conversation Service** (`services/conversation`) | Auto-generate icebreakers |
| 4 | **Frontend Onboarding** (`frontend`) | Users can sign up & see matches |

Suggested sequence:

```bash
# scaffold service
cd services/profile
npm run dev        # start coding CRUD endpoints
```

Use `make dev-<service>` to hot-reload each service.

---

## 6 · Daily Workflow Cheatsheet

| Task | Command |
|------|---------|
| Start all services dev-mode | `make dev` |
| Lint & tests                | `make lint && make test` |
| Re-seed DB                  | `make db-reset` |
| View logs                   | `make docker-logs` |
| Stop containers             | `make docker-down` |

Happy hacking! Ping `#yeyzer-dev` Slack for help. 💬
