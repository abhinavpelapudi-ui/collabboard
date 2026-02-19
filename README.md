# CollabBoard

A production-ready real-time collaborative whiteboard with an AI agent — built in one week.

**Live demo:** [collabboard.up.railway.app](https://collabboard.up.railway.app) *(replace with your deployed URL)*

---

## Features

- **Infinite canvas** — pan (H), zoom (scroll wheel), with 60 FPS rendering via Konva.js
- **Object types** — sticky notes, rectangles, circles, text, frames, connector arrows
- **Real-time multiplayer** — cursor sync (<50ms), object sync (<100ms), presence bar
- **AI board agent** — 10 tools: create/move/resize/color/delete objects, templates (SWOT, Kanban, User Journey, Brainstorm)
- **Multi-select** — shift-click or drag-to-select; Delete/Backspace, Ctrl+D duplicate, Ctrl+A select all
- **Workspaces** — group boards, share entire workspace with editor/viewer roles
- **Board chat** — real-time per-board chat panel with online member list
- **Auth** — Google OAuth, GitHub OAuth, email/password, OTP (passwordless)
- **Free plan limits** — 2 boards, 1 workspace; upgrade via pricing page

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Canvas | Konva.js via react-konva |
| State | Zustand |
| Styling | Tailwind CSS |
| Backend | Node.js + Hono + Socket.IO |
| Database | PostgreSQL (Railway) |
| Auth | Custom JWT + Google/GitHub OAuth (Passport) |
| AI | Anthropic Claude (claude-sonnet-4-5 / claude-haiku-4-5) |
| Deploy | Railway (server + DB) + Vercel (client) |

---

## Project Structure

```
collabboard/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── canvas/     # Konva canvas components
│       │   └── ui/         # Chrome UI (Toolbar, AIChat, etc.)
│       ├── hooks/          # useSocket, useAuth
│       ├── pages/          # Board, Dashboard, Login, Pricing
│       └── stores/         # Zustand (boardStore, uiStore, presenceStore)
├── server/                 # Hono + Socket.IO backend
│   └── src/
│       ├── routes/         # REST: auth, boards, ai, workspaces, members
│       ├── sockets/        # Socket.IO handlers + server
│       ├── middleware/     # requireAuth, rateLimit
│       └── db.ts           # PostgreSQL pool
├── shared/                 # Shared TypeScript types (BoardObject, etc.)
└── docs/                   # Architecture docs, schema
```

---

## Setup Guide

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or Railway/Neon/Supabase)
- Anthropic API key
- (Optional) Google OAuth and GitHub OAuth app credentials

### 1. Clone & install

```bash
git clone https://github.com/your-username/collabboard.git
cd collabboard
npm install          # installs root workspaces
cd client && npm install && cd ..
cd server && npm install && cd ..
cd shared && npm install && npm run build && cd ..
```

### 2. Environment variables

**`server/.env`**

```env
DATABASE_URL=postgresql://user:pass@host:5432/collabboard
JWT_SECRET=your-secret-here
ANTHROPIC_API_KEY=sk-ant-...
CLIENT_URL=http://localhost:5173

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Email (optional — OTP login)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
```

**`client/.env`**

```env
VITE_SERVER_URL=http://localhost:3001
```

### 3. Database schema

Run the schema against your PostgreSQL instance:

```bash
psql $DATABASE_URL -f docs/schema.sql
```

### 4. Run locally

```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

Open http://localhost:5173.

### 5. Deploy

**Client (Vercel):**
```bash
cd client && npx vercel --prod
# Set VITE_SERVER_URL to your Railway server URL in Vercel dashboard
```

**Server (Railway):**
- Connect GitHub repo, set root directory to `server/`
- Add environment variables in Railway dashboard
- Railway auto-deploys on push

---

## Canvas Keyboard Shortcuts

| Key | Action |
|---|---|
| V | Select tool |
| H | Pan tool |
| S | Sticky note |
| T | Text |
| R | Rectangle |
| C | Circle |
| F | Frame |
| X | Connector |
| Escape | Back to Select |
| Delete / Backspace | Delete selected |
| Ctrl+D | Duplicate selected |
| Ctrl+A | Select all |
| Ctrl+Z | Undo |

---

## AI Agent Commands

The AI panel (✦ button or A key) accepts natural language:

- *"Add a yellow sticky note that says 'Launch'"*
- *"Create a SWOT analysis"*
- *"Move all blue stickies to the right"*
- *"Create a Kanban board"*
- *"Arrange these notes in a grid"*
- *"Connect the first box to the second"*
- *"Resize the frame to 600×400"*

---

## Architecture Overview

```
Browser (React + Konva)
    │ HTTP REST          │ Socket.IO (ws://)
    ▼                    ▼
Hono Server ──────── Socket.IO Server
    │                    │
    └──── PostgreSQL ────┘
              │
          Anthropic API (AI agent, server-proxied)
```

**Real-time flow:**
1. User edits object → optimistic local update → emit `object:update`
2. Server validates (Zod) → broadcasts to room → persists to PostgreSQL
3. Other clients receive event → update Zustand store → Konva re-renders

**Conflict resolution:** Last-write-wins by server timestamp.

---

## License

MIT
