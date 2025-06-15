# Yeyzer AI Match-Assistant – Frontend Wireframes  
_Last updated: 2025-06-15_

This document visualises how the new AI Match-Assistant module plugs into the existing Yeyzer iOS/React-Native app.  All screens are designed **mobile-first** (375 × 812 reference) and inherit Yeyzer’s core brand colours:

| Role | Hex |
|------|-----|
| Primary gradient | #667Eea → #764Ba2 |
| Accent / Action | #667Eea |
| Background | #FFFFFF |
| Surface subtle | #F8F9FA |
| Text primary | #333333 |
| Text secondary | #6C757D |
| Success | #28A745 |
| Error | #DC3545 |

---

## 0. High-Level User Flow

```
Splash → Auth (existing) 
        ↓
Combined Profile/Persona ▸ Connect Profiles
        ↓
Match Feed ▸ Tap Card
        ↓
Chat ▸ Voice / Icebreaker
        ↓
Venue Map + List ▸ Select Venue
        ↓
Check-in / Safety
```

Backend touchpoints:

| Screen | Auth | Profile svc | Match Engine | Conversation | Venue | Voice | Safety |
|--------|------|------------|--------------|--------------|-------|-------|--------|
| Profile | ✓ token | ✓ updateUserProfile/updateIdealPersona | – | – | – | – | – |
| Match Feed | ✓ | ✓ getProfile | ✓ /api/matches | – | – | – | – |
| Chat | ✓ | – | ✓ status updates | ✓ /api/chats | – | ✓ WebSocket | ✓ profanity |
| Map/Venue | ✓ | ✓ coordinates | ✓ status=SCHEDULED | – | ✓ /api/venues | – | ✓ create check-in |
| Safety | ✓ | – | – | – | – | – | ✓ /api/safety |

---

## 1. Combined Profile & Persona Screen

```
╔════════ HEADER (gradient) ════════╗
║  < Back       Complete Profile    ║
╚═══════════════════════════════════╝
[Avatar 96px  ⊕ edit] Name __________
Ideal Match (textarea multiline)
About You  (textarea)
Interests  (chips, + add)
────────────────────────────────────
SOCIAL CONNECTION GRID (4 cols)
[LinkedIn] [GitHub] [Twitter] [Instagram]
 Connection state: outline → green fill ✓
────────────────────────────────────
Primary CTA:  Save Profile & Find Matches
```

Mobile behaviour: scrollable, sections collapse after save.

Visual indicators:
* Connected profiles turn green, label “Connected”.
* Inline validation border **#DC3545** on required fields.

---

## 2. Matches Feed Screen

```
NAV BAR      Matches  [⚙]
╭─ Match Card (shadow) ─────────────╮
│ ○ AV  Name            92% ▮        │
│ Headline / Company                 │
│ lorem about…                       │
│ #AI  #Startups  #Hiking            │
│ Common: AI, Photography            │
│ [Message] [View]                   │
╰────────────────────────────────────╯
(repeat)
```

Ranking: descending by `score_overall`.  
Swipe-down refresh triggers `/api/matches/calculate/:userId`.

Edge cases: empty state → illustration + hint “Improve your profile”.

---

## 3. Chat Screen (WebSocket)

Header shows avatar + name + flag 🚩 icon (safety report).

```
──────────────
You (bubble right, purple)
Partner (bubble left, light)
──────────────
┆ ● typing…            (italics)
──────────────
[🎙 ]  message input …   ➤ Send
```

Voice:
* Mic idle icon `🎙` = grey, tap to record → pulsating purple ring.
* Live transcription appears in input; release → Send.

Icebreaker banner (first load):

```
💡 “Hey Alex! I saw you love AI …”
[Send]  [Edit]
```

Safety:
* Report flag opens modal reason list → POST /api/safety.
* Automatic check-in banner appears 2 h post-meetup.

---

## 4. Venue Recommendation Screen

Tabs inside Chat → “Meet-up”.

```
MAP (leaflet) height 250
  pin A (you)   pin B (them)  ★ midpoint
List Cards (scroll)
┌───────────┐ Cafe Logo
│ Philz Coffee          0.8 mi
│ ★4.6   $$    Cafe
│ “Popular midpoint spot…”
│ [Select]     ↗ Maps
└───────────┘
```

Selecting a venue:
* POST `/api/venues/:venueId/select/:matchId`
* Success toast **green** “Meet-up scheduled Fri 3 pm”.
* Match status badge in feed becomes **Scheduled** (purple pill).

---

## 5. Safety Hooks & Voice Indicators

| Feature | UI Placement | Indicator |
|---------|--------------|-----------|
| Report user | Chat header | 🚩 Flag icon |
| Check-in prompt | Post-meetup overlay | “Are you safe?” Safe / Help buttons |
| Profanity block | Message input | Red toast “Profanity not allowed” |
| Voice active | Mic pulsating ring | Mic turns solid when processing |
| Voice error | Snackbar red | “Voice offline” |

---

## 6. Wireframe Thumbnails

### 6.1 Profile (mobile)

```
╭──────── gradient header ────────╮
╰──────────────────────────────────╯
[Avatar]  Name
[Ideal Match ▭▭▭]
[About ▭▭▭]
[Interests chip +]
Connect grid 4x
[Save button]
```

### 6.2 Match Card

```
[Avatar] Name  score%
Bio…
#tags
[Message] [View]
```

### 6.3 Chat

```
Partner bubble
You bubble
typing…
[🎙 ][input……………………][➤]
```

### 6.4 Venue

```
(map)
Philz card  ★select
Sightglass…
```

---

## 7. Responsiveness & Desktop

* On tablet/desktop (≥768 px) cards display two-column grid.
* Sidebar shows profile progress (% complete).
* Map and chat split-pane horizontally.

---

## 8. Asset Guidelines

* Mock avatars from `https://randomuser.me/api/portraits/{men|women}/<n>.jpg`
* Icons: Heroicons or SF Symbols (for iOS parity).
* Map: Leaflet with Mapbox tiles (token in `.env`).

---

## 9. Next Steps

1. Build React-Native/Expo screens following wireframes.  
2. Hook GraphQL (profile), REST (matches/venue), WebSocket (chat).  
3. Integrate gradient theme variables into Tailwind config.  
4. QA on iPhone SE, 14 Pro, iPad.  
5. Iterate with stakeholder feedback.
