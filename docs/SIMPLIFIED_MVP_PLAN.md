# Simplified MVP Plan (Email + Password Only)

_Yeyzer AI Match-Assistant — “No-OAuth” Track_

---

## 1 · Goals

| Objective | Why |
|-----------|-----|
| Email/password signup & login | Removes external OAuth complexity |
| Mock social profiles (LinkedIn/GitHub/Twitter/Crunchbase) | Enables matching algorithm without live APIs |
| Core matching (nightly job) | Delivers primary value: relevant connections |
| Chat + icebreaker UI | Drives the “conversation ignition” metric |
| Deployable via Docker Compose in 10 minutes | Fast onboarding for new devs/stakeholders |

---

## 2 · Implementation Order

| # | Component | Owner | ETA | Notes |
|---|-----------|-------|-----|-------|
| 1 | **Auth Service** – strip OAuth, keep email/pass flow | BE | 1 h | Remove LinkedIn passport strategy & routes |
| 2 | **Mock-Data Seeder** (`scripts/seed-mock-data.ts`) | BE | 1 h | Inserts 100 users + mock social JSON into DB |
| 3 | **Profile Service** – CRUD for profile & ideal-persona | BE | 2 h | REST + GraphQL resolvers |
| 4 | **Match Engine v0** – random embeddings + cosine | DS | 2 h | Nightly cron or manual trigger |
| 5 | **Conversation Service** – icebreaker generator (static templates) | BE | 1 h | `faker.company.catchPhrase()` fallback if no OpenAI key |
| 6 | **Chat Service** – WebSocket relay (in-memory) | FE | 2 h | `socket.io` inside Gateway for speed |
| 7 | **Next.js Frontend** – onboarding wizard + match cards + chat UI | FE | 4 h | Tailwind, no OAuth buttons |
| 8 | **Docker Compose & Healthchecks** | DevOps | 1 h | Ensure `docker compose up` → green |
| 9 | **Smoke Tests** – register → match → chat flow | QA | 1 h | Supertest script in CI |

_Total: ≈14 hrs team time_

---

## 3 · Mock Data Strategy

1. Directory layout  
   ```
   mock-data/
     users.json                # firstName, lastName, email, avatarUrl
     linkedin.json             # headline, skills[]
     github.json               # topLanguages[]
     twitter.json              # recentTweets[]
     crunchbase.json           # companyDetails
   ```
2. Seed script (`make db-seed`) merges `users.json` with per-provider records and writes to:
   - `users`  
   - `user_profiles`  
   - `linkedin_data` / `github_data` …  
3. Environment flag  
   ```
   USE_MOCK_DATA=true   # default for dev/CI
   ```

---

## 4 · Code Snippets

### 4.1 Auth — Register & Login Routes

```ts
// services/auth/src/routes/auth.ts
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { signJwt, createSuccessResponse, AppError } from '@yeyzer/utils';
import db from '../db';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

router.post('/register', async (req, res, next) => {
  try {
    const data = RegisterSchema.parse(req.body);
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await db.user.create({ data: { ...data, password: hashed } });

    const token = await signJwt({ userId: user.id }, process.env.JWT_SECRET!);
    res.json(createSuccessResponse({ token, user }));
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = RegisterSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }
    const token = await signJwt({ userId: user.id }, process.env.JWT_SECRET!);
    res.json(createSuccessResponse({ token, user }));
  } catch (err) { next(err); }
});

export default router;
```

### 4.2 Mock Seeder (excerpt)

```ts
// scripts/seed-mock-data.ts
import { readFileSync } from 'fs';
import faker from 'faker';
import db from '../services/profile/src/db';

const users = JSON.parse(readFileSync('mock-data/users.json', 'utf-8'));

await Promise.all(users.map(async (u: any) => {
  const user = await db.user.create({ data: { ...u, password: '$2a$10$hash' } });
  await db.userProfile.create({
    data: {
      userId: user.id,
      headline: faker.name.jobTitle(),
      skills: faker.helpers.uniqueArray(faker.hacker.verb, 6),
    },
  });
}));
console.log('Mock users seeded ✓');
process.exit(0);
```

### 4.3 Matching Logic (simplified)

```ts
// services/match-engine/src/matcher.ts
import cosine from 'compute-cosine-distance';
import { fetchAllUsersWithVectors } from './repository';

export async function matchAll() {
  const users = await fetchAllUsersWithVectors();

  for (const user of users) {
    for (const candidate of users) {
      if (user.id === candidate.id) continue;
      const score = 1 - cosine(user.vector, candidate.vector);
      if (score > 0.75) {
        await db.match.upsert({
          where: { userId_matchedUserId: { userId: user.id, matchedUserId: candidate.id } },
          update: { scoreOverall: score },
          create: { userId: user.id, matchedUserId: candidate.id, scoreOverall: score },
        });
      }
    }
  }
}
```

### 4.4 In-Memory Chat Relay

```ts
// gateway/src/chatSocket.ts
import { Server } from 'socket.io';

export function initChat(server: any, authMiddleware: any) {
  const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN } });

  io.use(authMiddleware);

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.on('joinChat', (chatId: string) => socket.join(chatId));

    socket.on('sendMessage', async (msg) => {
      await db.message.create({ data: { ...msg, senderId: userId } });
      io.to(msg.chatId).emit('messageReceived', msg);
    });
  });
}
```

---

## 5 · Service Checklist

- [ ] **Auth** – register/login endpoints; JWT middleware
- [ ] **Seeder** – mock profiles (100 users)
- [ ] **Profile** – CRUD + ideal-persona form
- [ ] **Match Engine** – nightly job, simple cosine
- [ ] **Conversation** – static icebreakers
- [ ] **Chat** – socket relay, message persistence
- [ ] **Gateway** – GraphQL resolvers & depth-limit
- [ ] **Frontend** – onboarding, match list, chat UI
- [ ] **Docker Compose** – all services healthy
- [ ] **Smoke Tests** – register→match→chat passes

---

## 6 · Definition of Done (Simplified)

1. `docker compose up` → site loads in browser.
2. Register with email/password.
3. Complete persona wizard.
4. Receive ≥3 matches instantly (mock vectors).
5. Accept icebreaker → chat opens.
6. Send message; it echoes in 2nd incognito window.
7. Unit tests & linter pass in CI.

---

## 7 · Future Upgrade Path

| Next Step | Impact |
|-----------|--------|
| Add OAuth back (feature flag) | Real profiles improve match accuracy |
| Replace mock vectors with OpenAI embeddings | Quality jump |
| Swap static icebreakers for LLM | Higher engagement |
| Integrate Places API | Meet-up conversion metric |

_Build the simplest thing that proves value, then iterate._ 🚀
