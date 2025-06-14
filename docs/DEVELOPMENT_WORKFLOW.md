# Development Workflow Guide
_Yeyzer AI Match-Assistant_

---

## 1. Quick-Start for New Developers

1. **Clone & bootstrap**
   ```bash
   git clone https://github.com/yeyzer/yeyzer-ai.git && cd yeyzer-ai
   cp .env.example .env                 # fill in any API keys later
   make install                         # installs all workspace deps
   make docker-up                       # Postgres, Redis, Qdrant, Prom/Grafana
   make dev                             # hot-reload all services + frontend
   open http://localhost:3000           # GraphQL IDE/Next.js app
   ```

2. **First smoke test**
   ```bash
   curl -X POST http://localhost:3000/graphql \
     -H 'Content-Type: application/json' \
     -d '{"query":"{ __typename }"}'
   ```

3. **Generate IDE types (optional VSCode)**
   ```bash
   make codegen          # GraphQL TS types
   ```

---

## 2. Service Development Template

1. `cd services/<service-name>`
2. `npm run dev` (isolated) or `make dev-<service>`
3. Directory skeleton:
   ```
   src/
     index.ts           # entry
     routes/            # REST/GraphQL handlers
     lib/               # pure logic
     models/            # Prisma/SQL queries
     tests/
   Dockerfile
   tsconfig.json
   ```
4. **Add new env vars** ➜ `services/<svc>/README.md` + `docs/ENV_REFERENCE.md`.
5. **Expose health endpoints**
   - `GET /health`  → liveness
   - `GET /readyz` → readiness

_Note:_ Use `@yeyzer/utils` for logging, env helpers, Prometheus metrics, and error handling.

---

## 3. Common Development Tasks

| Task | Command |
|------|---------|
| Build all | `make build` |
| Lint all | `make lint` |
| Run unit tests | `make test` |
| Run a specific service’s tests | `make test-<service>` |
| Format code | `make format` |
| Reset database (dev) | `make db-reset` |
| View logs | `make docker-logs` or `make docker-logs-<service>` |
| Regenerate GraphQL types | `make codegen` |

---

## 4. Debugging Tips

### 4.1 VSCode Attach
1. Add `"inspect": "node --inspect-brk src/index.ts"` script in the service.
2. Launch config:
   ```json
   {
     "type": "node",
     "request": "attach",
     "name": "Attach <service>",
     "port": 9229
   }
   ```
3. `npm run inspect` and attach.

### 4.2 Database
```bash
docker exec -it $(docker ps -qf name=postgres) psql -U postgres yeyzer
```
Run queries, inspect tables.

### 4.3 API Gateway Tracing
GraphQL Playground → “HTTP HEADERS” → `{ "x-request-id": "debug123" }`  
Search same id in service logs (`grep debug123`).

### 4.4 Hot-reload not firing?
- Ensure service’s `ts-node-dev` / `nodemon` includes `--poll` on macOS.
- Verify volume mounts in `docker-compose.yml`.

---

## 5. Mock Data Implementation Examples

### 5.1 Using Feature Flag
```ts
const useMock = getEnvBoolean('USE_MOCK_DATA', false);
if (useMock) {
  const mockProfile = require('../../../mock-data/linkedin/mock_profile.json');
  return mockProfile;
}
```

### 5.2 Seed Script
`mock-data/seed-linkedin.ts`
```ts
import { writeFileSync } from 'fs';
import faker from 'faker';
const data = [...Array(20)].map(() => ({ id: faker.datatype.uuid(), headline: faker.name.jobTitle(), skills: faker.helpers.uniqueArray(faker.hacker.noun, 5)}));
writeFileSync('mock-data/linkedin/mock_profile.json', JSON.stringify(data, null, 2));
```

### 5.3 Toggle in `.env`
```
USE_MOCK_DATA=true
```
CI sets `USE_MOCK_DATA=true` to avoid rate limits, staging/prod `false`.

---

## 6. GraphQL Development Workflow

1. Update schema: `gateway/src/schema.graphql`
2. Run `make codegen` (auto-hooks in pre-commit)
3. Implement resolvers in `gateway/src/resolvers/`
4. Add/adjust permissions in `gateway/src/permissions.ts`
5. **Contract test** (Pact):
   ```bash
   npm run test:contract --workspace=@yeyzer/gateway
   ```
6. Validate depth & complexity: queries >15 levels will fail depth-limit.

---

## 7. Testing Workflow

| Layer | Command | Notes |
|-------|---------|-------|
| Unit | `make test-<service>` | Jest + ts-jest |
| Contract | `npm run test:contract` | Pact, consumer-driven |
| Integration (docker) | `make test` | Supertest launches stack |
| e2e (k6) | `make test-e2e` | Script in `tests/e2e/` |
| Coverage report | `make test-coverage` | aggregated in `coverage/` |

CI fails if:
* unit <80 % coverage for modified service
* k6 p95 latency >1500 ms
* Trivy finds Critical/High CVEs

---

## 8. Deployment Checklist

| Step | Description | Status |
|------|-------------|--------|
| **✅ CI green** | Lint, tests, Trivy, Pact ✔️ |
| **Bump version** | `npm version patch/minor/major` or tag `vX.Y.Z` |
| **Docker images** | GitHub Action builds & pushes |
| **Helm values updated** | `image.tag=sha-<commit>` |
| **Staging smoke** | `/readyz` endpoints OK, Grafana dashboards green |
| **DB migration** | SQL reviewed, idempotent, committed in `init/` |
| **Secrets** | Pulled from Vault/CI secrets, not `.env` |
| **Feature flags** | New code behind flag default **off** |
| **Rollback plan** | Previous Helm release verified (`helm history`) |
| **Announcement** | Slack #launches with change log |

Use:
```bash
make deploy-staging  # manual; CI runs automatically on main
make deploy-prod     # prompts confirmation
```

---

Happy shipping! 🎉  
For any questions ping `@#yeyzer-dev` Slack or open an issue.  
