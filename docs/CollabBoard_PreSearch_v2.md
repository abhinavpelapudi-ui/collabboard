# CollabBoard Pre-Search Document

*Production-Ready Architecture & Stack Decision Log*

---

## Phase 1: Define Your Constraints

### 1. Scale & Load Profile

| Question | Decision |
|---|---|
| Users at launch? | 50–100 public users at launch (shared via social post + GauntletAI community). Target 500+ within 6 months as a portfolio piece and public tool. |
| Traffic pattern | Spiky — bursts during demos, social sharing, and evaluation. Need to handle 20–30 concurrent users in peak sessions. Low baseline traffic otherwise. |
| Real-time requirements | Custom WebSocket server (Socket.IO on Node.js). Cursor sync <50ms, object sync <100ms. WebSockets provide bidirectional, low-latency communication without polling overhead. |
| Cold start tolerance | Very low. Public users expect instant load. Using a persistent Node.js server on Render/Railway (not serverless) to eliminate cold starts entirely. WebSocket connections stay warm. |

**Rationale:** A custom WebSocket server gives full control over message routing, room management, and conflict resolution logic. Unlike Firebase RTDB which abstracts the transport layer, Socket.IO lets us implement custom event types (cursor:move, object:create, object:update, presence:join) with fine-grained control over broadcasting, throttling, and batching. This matters for a public-facing app where performance under load is visible to real users.

### 2. Budget & Cost Ceiling

| Question | Decision |
|---|---|
| Monthly spend limit | $20–$50/month. Render/Railway free tier for server ($0–$7), PostgreSQL via Supabase or Neon free tier, AI API spend ~$10–20/month at moderate usage, Vercel free for frontend. |
| Pay-per-use vs fixed? | Hybrid. Fixed cost for server hosting (always-on Node.js process). Pay-per-use for AI API calls (Anthropic/OpenAI). This keeps baseline costs predictable while AI scales with usage. |
| Money for time tradeoffs | Investing time in custom WebSocket server (2–3 hours setup) for long-term flexibility and performance control. Using managed DB (Supabase/Neon) to avoid database administration overhead. |

### 3. Time to Ship

| Question | Decision |
|---|---|
| MVP timeline | 24 hours for core multiplayer (cursor sync, object sync, auth, deploy). But building beyond MVP — targeting a polished, public-ready app by Day 7. |
| Speed vs maintainability | Balanced. Clean architecture from Day 1 (typed events, modular hooks, separated concerns) because this is a public app that needs to be maintainable for iteration. AI agents handle boilerplate; human handles architecture decisions. |
| Iteration cadence | Day 1: WebSocket server + cursor sync + basic canvas. Day 2: Object CRUD + persistence + auth. Day 3–4: Full feature set (shapes, frames, connectors, transforms, multi-select). Day 5–6: AI agent + complex commands. Day 7: Polish, animations, responsive UI, deploy, docs. |

### 4. Compliance & Regulatory Needs

No strict compliance requirements (no HIPAA, SOC 2, data residency). However, since this is public-facing, basic privacy practices apply: no storing unnecessary PII, clear data handling in auth flow, secure WebSocket connections (wss://), and HTTPS everywhere. GDPR is not a primary concern but we avoid collecting EU-specific sensitive data.

### 5. Team & Skill Constraints

| Question | Decision |
|---|---|
| Solo or team? | Solo developer with heavy AI-assisted workflow (Claude Code + Cursor). AI agents handle 50–60% of code generation; human handles architecture, debugging, and real-time sync logic. |
| Known frameworks | React + TypeScript (strong), Node.js + Express (strong), Socket.IO (moderate), PostgreSQL (moderate). New to canvas libraries (Konva.js) — will use AI agents to accelerate canvas learning. |
| Learning vs shipping | Strategic learning. Investing upfront in understanding Socket.IO room management and Konva.js transforms because these are core to the product. Using AI agents for everything else (auth flows, CRUD, UI components, AI tool schemas). |

---

## Phase 2: Architecture Discovery

### 6. Hosting & Deployment

| Question | Decision |
|---|---|
| Infrastructure approach | Persistent Node.js server on Render or Railway (not serverless — WebSockets need long-lived connections). Vercel for frontend static hosting. Managed PostgreSQL via Supabase or Neon. |
| CI/CD requirements | Vercel auto-deploys frontend on git push. Render/Railway auto-deploys backend on git push. Monorepo with /client and /server directories. No custom CI pipeline needed. |
| Scaling characteristics | Render scales to multiple instances with sticky sessions for WebSocket affinity. For >100 concurrent users, would add Redis pub/sub for cross-instance message broadcasting. Not needed at launch scale. |

**Why not serverless?** AWS Lambda / Cloud Functions have cold starts (1–3s) that break real-time cursor sync. WebSockets require persistent connections that serverless architectures don't natively support (API Gateway WebSockets add complexity and cost). A single always-on Node.js process handles thousands of concurrent WebSocket connections efficiently.

**Why not Docker / ECS / EKS?** Container orchestration adds operational complexity (Dockerfiles, container registries, cluster management, health checks, load balancer config) with zero benefit at our scale. Render/Railway provide container-like deployment (auto-scaling, health monitoring, zero-downtime deploys) without the overhead. EKS is designed for teams running dozens of microservices — we have one server process.

### 7. Authentication & Authorization

| Question | Decision |
|---|---|
| Auth approach | Auth.js (NextAuth successor) or Clerk for production-ready auth. Google + GitHub OAuth as primary methods for fast public onboarding. Email/password as fallback. JWT tokens validated on WebSocket connection. |
| RBAC needed? | Yes, lightweight. Board-level permissions: Owner (full control, can delete board), Editor (can modify objects), Viewer (read-only, can see cursors but not edit). Stored as a permissions map on each board record. |
| Multi-tenancy | Board-level isolation. Each board is a separate room in Socket.IO and a separate record in the database. Users access boards via shareable links with optional password protection. |

**WebSocket auth flow:** User authenticates via HTTP → receives JWT → passes JWT in Socket.IO handshake → server validates token and extracts userId before allowing room join. Unauthenticated connections are rejected at the handshake level.

### 8. Database & Data Layer

| Question | Decision |
|---|---|
| Database type | PostgreSQL (via Supabase or Neon) for persistent data: boards, objects, users, permissions. In-memory state on the Node.js server for ephemeral data: cursor positions, active presence, typing indicators. |
| Real-time sync architecture | Client → WebSocket event → Server validates & broadcasts to room → Server persists to PostgreSQL (async, non-blocking). Clients receive updates via WebSocket listeners. Server is the source of truth for conflict resolution. |
| Read/write ratio | Write-heavy during collaboration (cursor moves at 20–50Hz per user, object edits). Cursor data is ephemeral (in-memory only, never persisted). Object changes are batched and persisted every 500ms to reduce DB writes. Estimated 80% write / 20% read during active sessions. |

**Data model:** `users` table (id, name, email, avatar_url). `boards` table (id, title, owner_id, created_at, settings JSON). `board_members` table (board_id, user_id, role). `objects` table (id, board_id, type, props JSONB, z_index, created_by, updated_at). Using JSONB for object props gives flexibility — sticky notes, shapes, frames, and connectors all share one table with type-specific properties in the JSONB column.

**Why not Redis?** At our scale (<100 concurrent users, single server instance), in-memory JavaScript objects handle cursor/presence state faster than a Redis round-trip. Redis becomes valuable when scaling to multiple server instances (pub/sub for cross-instance broadcasting). We'll add it as a scaling optimization, not a launch requirement.

### 9. Backend/API Architecture

| Question | Decision |
|---|---|
| Architecture | Monolith Node.js server (Express + Socket.IO). Single process handles HTTP endpoints (auth, board CRUD, AI proxy) and WebSocket connections (real-time sync). Clean separation via modules: /routes, /sockets, /services, /middleware. |
| API style | REST for CRUD operations (create board, list boards, manage members). WebSocket events for real-time operations (cursor:move, object:create, object:update, object:delete). AI commands via POST /api/ai/command → processes with LLM → emits results via WebSocket. |
| Event schema | Typed WebSocket events with TypeScript interfaces. Every event includes: { type, payload, userId, boardId, timestamp }. Server validates all incoming events before broadcasting. Last-write-wins for conflict resolution with server timestamp as tiebreaker. |

### 10. Frontend Framework & Rendering

| Question | Decision |
|---|---|
| Framework | React 18 + TypeScript + Vite. Zustand for lightweight global state (board objects, cursor positions, presence). React-konva for canvas rendering with built-in transforms, drag, and hit detection. |
| Canvas library | Konva.js via react-konva. Provides: declarative React components for canvas objects, built-in Transformer for resize/rotate, drag-and-drop, layering/z-index, and efficient re-rendering. Performance target: 60fps with 500+ objects. |
| UI framework | Tailwind CSS + shadcn/ui for the chrome around the canvas (toolbar, sidebar, modals, presence bar, AI chat panel). Framer Motion for micro-animations (object appear/disappear, panel transitions, cursor trails). |
| Offline / PWA? | Not for launch. Future consideration: service worker for offline canvas viewing, sync queue for reconnection. |

**Why Konva over Fabric.js?** Fabric.js has a more imperative API that doesn't integrate as naturally with React's declarative model. react-konva gives us JSX canvas components (`<Rect>`, `<Text>`, `<Group>`, `<Transformer>`) that feel native to React. Fabric is more feature-rich for image manipulation, but we don't need that — we need smooth object interaction and transforms, which Konva handles well.

### 11. Third-Party Integrations

| Service | Details |
|---|---|
| AI API | Anthropic Claude (claude-sonnet-4-20250514) with function/tool calling. 9 tool functions mapping to board operations (createStickyNote, createShape, moveObject, etc.). Proxied through server to protect API keys. Estimated cost: $0.003–$0.01 per command. |
| Auth provider | Clerk or Auth.js with Google + GitHub OAuth. Clerk offers a polished drop-in UI and webhook-based user sync. Auth.js is free and more customizable. Decision: Clerk for faster polished auth, Auth.js if budget-constrained. |
| Database | Supabase (free tier: 500MB, 2 projects) or Neon (free tier: 512MB, branching). Both provide managed PostgreSQL with connection pooling. No real-time features used from Supabase — our WebSocket server handles that. |
| Vendor lock-in risk | Low. Standard PostgreSQL (portable anywhere), standard WebSocket protocol (Socket.IO or swap to ws library), standard React frontend. The only lock-in is the auth provider, which is easily replaceable. |

---

## Phase 3: Post-Stack Refinement

### 12. Security Vulnerabilities

- **WebSocket authentication:** Validate JWT on every Socket.IO handshake. Reject unauthenticated connections. Re-validate tokens on reconnect. Set connection timeout for idle sockets.
- **Input validation:** Validate all WebSocket event payloads on the server (type, bounds, string length). Malicious clients could send crafted events to corrupt board state. Use Zod schemas for runtime validation.
- **AI API key protection:** Never expose Anthropic/OpenAI keys to the client. All AI calls go through the server's /api/ai/command endpoint. Rate limit: max 10 AI commands/minute/user to prevent abuse and cost overruns.
- **XSS mitigation:** Konva renders to canvas (not DOM), which inherently prevents XSS for canvas content. However, any HTML overlays (tooltips, chat panel, board title) must sanitize user input. Use DOMPurify for HTML contexts.
- **Rate limiting:** Express-rate-limit on HTTP endpoints. Custom throttle on WebSocket events (max 60 cursor events/second/user, max 30 object events/second/user). Prevents abuse and protects server resources.
- **CORS & CSP:** Strict CORS allowing only the frontend domain. Content Security Policy headers to prevent script injection. HTTPS enforced on all endpoints.

### 13. File Structure & Project Organization

Monorepo with clear client/server separation:

- `/client/src/components/canvas/` — Konva canvas components (StickyNote, Rectangle, Frame, Connector, Cursor, SelectionBox)
- `/client/src/components/ui/` — Chrome UI (Toolbar, Sidebar, PresenceBar, AIChat, BoardHeader)
- `/client/src/hooks/` — Custom hooks (useSocket, useBoard, useCursors, usePresence, useAIAgent, useTransform)
- `/client/src/stores/` — Zustand stores (boardStore, cursorStore, presenceStore, uiStore)
- `/client/src/types/` — Shared TypeScript interfaces (BoardObject, SocketEvents, AICommand)
- `/server/src/routes/` — Express routes (auth, boards, ai)
- `/server/src/sockets/` — Socket.IO event handlers (cursorHandler, objectHandler, presenceHandler)
- `/server/src/services/` — Business logic (boardService, aiService, authService)
- `/server/src/middleware/` — Auth middleware, rate limiting, validation
- `/shared/` — Shared types and constants used by both client and server

### 14. Naming Conventions & Code Style

- **React components:** PascalCase (StickyNote.tsx, BoardCanvas.tsx, AIChat.tsx)
- **Hooks:** camelCase with `use` prefix (useSocket.ts, useBoard.ts, usePresence.ts)
- **Socket events:** namespaced with colon (cursor:move, object:create, presence:join, ai:command)
- **Database tables:** snake_case (board_members, object_history)
- **TypeScript interfaces:** PascalCase, descriptive (BoardObject, CursorPosition, SocketEvent)
- **Zustand stores:** camelCase with Store suffix (boardStore, cursorStore)
- **Linter:** ESLint + @typescript-eslint + Prettier (2-space indent, single quotes, no semicolons). Shared config across client and server.

### 15. Testing Strategy

| Type | Approach |
|---|---|
| Manual real-time testing | Two browser windows (Chrome + Firefox) side-by-side throughout development. Every feature tested for real-time sync before merge. Network throttling via DevTools to simulate poor connections. |
| WebSocket integration tests | Vitest + socket.io-client to test server-side event handling: connect, emit event, assert broadcast to other clients. Critical for verifying conflict resolution and room isolation. |
| Unit tests | Vitest for utility functions: grid layout algorithms, position calculations, AI tool schema parsing, Zod validation schemas. Target: 80% coverage on /shared and /server/src/services. |
| E2E tests (stretch goal) | Playwright with two browser contexts. Scenario: User A creates sticky note → User B sees it within 100ms. User A moves object → User B sees smooth movement. |
| Load testing | Artillery.io to simulate 50+ concurrent WebSocket connections. Verify: server handles load without degradation, cursor events don't pile up, memory stays stable. |

**Testing priority:** Manual multi-browser testing > WebSocket integration tests > Unit tests > E2E > Load testing. The first two are non-negotiable; the rest scale with available time.

### 16. Recommended Tooling & DX

- **AI dev tools:** Claude Code + Cursor (meets 'at least two AI tools' requirement). Claude Code for architecture scaffolding and complex logic. Cursor for iterative feature development.
- **VS Code extensions:** ESLint, Prettier, Tailwind IntelliSense, Thunder Client (API testing), GitLens
- **CLI tools:** Vite (frontend dev/build), tsx (run TypeScript server directly), nodemon (server hot reload), concurrently (run client + server together)
- **Debugging:** React DevTools, Chrome DevTools (Network tab for WebSocket frame inspection), VS Code debugger attached to Node.js server, Socket.IO Admin UI for connection monitoring
- **Performance:** Chrome DevTools Performance tab for 60fps canvas validation, Lighthouse for initial load audit, why-did-you-render for unnecessary React re-renders

---

## System Architecture Overview

The architecture follows a classic real-time collaboration pattern with three layers:

| Layer | Components | Responsibility |
|---|---|---|
| Client | React + Konva.js + Zustand + Socket.IO Client | Canvas rendering, local state, optimistic updates, UI chrome |
| Server | Node.js + Express + Socket.IO + Zod | WebSocket room management, event validation, broadcasting, AI proxy, auth |
| Persistence | PostgreSQL (Supabase/Neon) | Board state, user data, permissions. Async writes batched every 500ms |

**Real-time data flow:**

1. User moves a sticky note on canvas (client-side optimistic update renders immediately)
2. Client emits `object:update` event via Socket.IO with the new position + userId + timestamp
3. Server validates the event payload (Zod schema), resolves any conflicts (last-write-wins by timestamp)
4. Server broadcasts the validated update to all other clients in the room
5. Server batches the update and persists to PostgreSQL asynchronously (every 500ms)
6. Other clients receive the event and update their local Zustand store, triggering React re-render on the Konva canvas

---

## Final Stack Decision Summary

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Canvas | Konva.js via react-konva |
| State Management | Zustand (lightweight, minimal boilerplate) |
| Styling | Tailwind CSS + shadcn/ui + Framer Motion |
| Backend | Node.js + Express + Socket.IO (custom WebSocket server) |
| Database | PostgreSQL via Supabase or Neon (managed, free tier) |
| Auth | Clerk or Auth.js (Google + GitHub OAuth, JWT for WebSocket) |
| AI Integration | Anthropic Claude with function/tool calling, proxied through server |
| Deployment | Vercel (frontend) + Render/Railway (backend) + Supabase/Neon (database) |
| AI Dev Tools | Claude Code + Cursor |

**Key tradeoff vs Firebase:** A custom WebSocket server requires 2–3 hours more setup than Firebase, but provides full control over event routing, conflict resolution, message batching, and scaling strategy. For a public-facing app where performance and reliability directly impact user experience, this control is worth the investment. Firebase abstracts too much of the real-time layer, making it difficult to debug sync issues, implement custom conflict resolution, or optimize broadcasting patterns.

**Why not Redis / AWS / Docker / EKS?** Redis is unnecessary at single-server scale — JavaScript in-memory state handles cursor/presence faster than a Redis round-trip. Redis becomes relevant when horizontally scaling to multiple server instances (pub/sub for cross-instance sync), which is a future optimization. AWS (DynamoDB + Lambda + API Gateway WebSockets) adds 1–2 days of infrastructure wiring for capabilities our Node.js server provides natively. Docker and container orchestration (ECS/EKS) are designed for multi-service production deployments with dedicated ops teams — our single-process server deploys directly to Render/Railway with zero container overhead.

---

## Build Priority Order

1. WebSocket server + Socket.IO rooms + cursor sync across two browsers
2. Object sync (create/move/edit sticky notes visible to all users in room)
3. PostgreSQL persistence (board state survives all users leaving)
4. Auth (Clerk/Auth.js + JWT WebSocket handshake + board permissions)
5. Full canvas features (shapes, frames, connectors, transforms, multi-select, z-index)
6. AI agent — basic commands (create sticky, create shape, move object)
7. AI agent — complex commands (SWOT template, grid layout, journey map)
8. Polish — animations, responsive toolbar, presence avatars, board sharing UI
