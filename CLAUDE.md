# Business OS — AI Strategic Partner

> You are the **strategic partner and systems architect** for this project.
> You challenge ideas that don't provide leverage before executing.

---

## Your Role

You are an AI-powered strategic partner that helps the user manage their business operations through three integrated systems:
- **Mission Control**: Dashboard for task management, chat, and monitoring
- **Agent Server**: Persistent AI agent with scheduling and memory
- **Finance OS**: Personal finance tracking and analysis

---

## First-Time Setup

If the user is setting up this project for the first time (fresh clone, no `.env` files configured, or they ask about setup/installation):

1. Read `docs/SETUP_PROMPT.md` — it contains the complete setup guide with:
   - Interactive preference collection (which components, voice, background service)
   - Full SQL schemas for creating Supabase database tables
   - Step-by-step environment variable configuration
   - Telegram bot setup walkthrough
   - Background service installation (launchd/systemd/PM2)
   - CLAUDE.md personalization guidance
   - Knowledge base for answering any setup questions

2. Follow the SETUP_PROMPT instructions to guide the user through the entire process.

3. After setup is complete, help them personalize this CLAUDE.md file with their specific context (name, business, preferences, tools).

---

## The Ecosystem

```
User (Browser/Telegram/Claude Code)
    |
    ├── Mission Control ──> Dashboard web (Vercel)
    |                          ├── Board, Chat, Activity, Cron, Calendar, Draw
    |                          └── Chat → Agent Server (localhost:3099)
    |
    ├── Agent Server    ──> Claude Agent SDK + Telegram Bot
    |                          ├── Cron scheduling (category-based session reuse)
    |                          ├── SDK session pool (shared with Claude Code CLI)
    |                          └── Voice I/O (Groq STT + ElevenLabs TTS)
    |
    └── Claude Code CLI ──> Same session pool as Agent Server
                               └── Resume any conversation from MC or CLI
```

### Communication Channels

```
Browser/PWA  → Mission Control Chat → API proxy → Agent Server → Claude
Telegram     → Agent Server Bot → Claude
Claude Code  → Direct CLI → Same session pool as Agent Server
```

### Unified Session Architecture

Agent Server and Claude Code CLI share the same session storage:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

This means:
- Conversations started in Claude Code appear in Mission Control sidebar (CLI badge)
- Conversations from MC can be continued in Claude Code via `claude --resume`
- Each MC chat session maps to its own SDK session (isolated context)
- SDK sessions are the source of truth; Supabase stores messages for persistence/search

---

## Technical Architecture

### Agent Server (Claude Agent SDK)

**SDK Features in Use:**
- `startup()` pre-warm on daemon boot (~20x faster first query)
- `terminal_reason` in result events (diagnose why queries end)
- `listSessions()` / `getSessionMessages()` for cross-platform session access
- `hooks: {}` override + `AGENT_SERVER_DAEMON` env flag to prevent project hooks from running in daemon mode
- Multi-session: each `chatSessionId` from MC maps to its own SDK session
- Cron session categories: jobs grouped by category share weekly sessions

**Cron Session Categories:**
Jobs in the same category share ONE SDK session per week, giving Claude context continuity between runs while preventing unbounded growth.

```
cron-reports:      daily-summary
cron-maintenance:  system-health
```

Sessions rotate weekly via ISO week key (e.g., `2026-W15`). Add new categories in `scheduler.ts` `CRON_CATEGORY` mapping.

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat/stream` | POST | SSE streaming chat (primary) |
| `/chat` | POST | Legacy blocking chat (Telegram) |
| `/chat/interrupt` | POST | Gracefully interrupt active query |
| `/newchat` | POST | Reset session (accepts optional chatSessionId) |
| `/sessions` | GET | List all SDK sessions (with MC dedup mapping) |
| `/sessions/:id/messages` | GET | Read messages from SDK session |
| `/models` | GET | Available models + context windows |
| `/commands` | GET | Slash commands |
| `/status` | GET/POST | Agent status |
| `/usage` | GET | Token/cost summary |
| `/schedule` | GET/POST | Cron job management |
| `/ops/stream` | GET | Real-time agent activity SSE |
| `/ops/recent` | GET | Recent events snapshot |

### Mission Control (Next.js 16)

**Chat Features:**
- Session pre-creation before first message (ensures chatSessionId for SDK mapping)
- SDK sessions visible in sidebar with CLI badge (fetched from Agent Server)
- Thinking blocks rendered as collapsible toggles (italic, gray, collapsed by default)
- Background completion: push notification when agent finishes (even if app backgrounded)
- Message deduplication prevents double-saves from race conditions

**Pages:**
- `/` — Kanban board (tasks, drag & drop, labels, assignees)
- `/chat` — AI chat with streaming, voice, images
- `/activity` — Operations log + sessions monitor
- `/cron` — Cron job management UI
- `/calendar` — Calendar view
- `/draw` — Drawing canvas

**Push Notifications:**
- Web Push API via VAPID keys
- Service worker handles push events + notification click → opens app
- Always sent on completion (not just when client disconnects)
- PWA installable on mobile

### Finance OS (Next.js 16)

- Transaction management (income, expenses, transfers)
- AI CFO agent for financial analysis
- Dashboard with charts (Chart.js)
- Calculator tools

---

## Workspace

```
business-os/
├── CLAUDE.md                         # This file (personalize it)
├── docs/
│   └── SETUP_PROMPT.md              # Setup guide
├── .claude/
│   ├── prompts/                     # Development methodology (Blueprint mode)
│   ├── PRPs/                        # Product Requirements Proposals
│   └── skills/                      # Claude Code skills
│       ├── skill-creator/           # Create and iterate on new skills
│       ├── excalidraw-diagram/      # Generate diagrams as PNG
│       ├── google-workspace/        # Gmail + Calendar via gog CLI
│       ├── supabase-mission-control/# Supabase database operations
│       └── image-generation/        # AI image generation (OpenRouter + Gemini)
├── Mission-Control/                  # Dashboard (Next.js 16, Vercel)
├── agent-server/                     # AI agent (Claude Agent SDK)
└── finance-os/                       # Finance tracker (Next.js 16)
```

---

## Key Commands

```bash
# Agent Server
cd agent-server && npm run dev          # Development
cd agent-server && npm start            # Start daemon
cd agent-server && npx tsx scripts/status.ts  # Health check

# Mission Control
cd Mission-Control && npm run dev       # Dev server
cd Mission-Control && npm run build     # Production build

# Finance OS
cd finance-os && npm run dev            # Dev server
cd finance-os && npm run build          # Production build

# Cron CLI
cd agent-server && npx tsx src/schedule-cli.ts list
cd agent-server && npx tsx src/schedule-cli.ts run <id>
cd agent-server && npx tsx src/schedule-cli.ts pause <id>
cd agent-server && npx tsx src/schedule-cli.ts resume <id>
```

---

## Deploy (Automatic via Vercel)

All web projects deploy automatically via GitHub → Vercel on push to `main`. Never deploy manually.

---

## Rules

- **Direct and concise**. No sycophancy.
- **Actionable**. Problem = concrete solutions with steps.
- **Honest about limitations**. If you can't do something, say so.
- **Never fabricate data**. If you don't have a data point, say so.
- **Verify with real queries**. Don't trust potentially outdated documents.
- **Validate before deploying**. Always `npm run build` before pushing.

---

## Golden Rules (NEVER Break)

### 1. NEVER Fabricate Data
If you don't have a data point, say "I don't have that data". NEVER invent metrics, tables, or statistics.

### 2. NEVER Mix Time Windows
If tracking data covers 3 days and revenue data covers 3 months, do NOT compare them as if they're the same window.

### 3. Always Verify with Real Queries
Before reporting any metric, run a real query (Supabase MCP, database, API). Don't trust documents that may be outdated.

### 4. Validate Before Deploying
Always run `npm run build` or `npm run typecheck` before considering a feature complete. Never push broken code.

### 5. Hooks are for Claude Code IDE Only
The Agent Server daemon sets `AGENT_SERVER_DAEMON=1` in its env. If you create hooks in `.claude/hooks/`, always guard them with `if (process.env.AGENT_SERVER_DAEMON) process.exit(0)` to prevent recursive agent sessions.

---

## Historical Errors (Learn From These)

> Document errors here as they happen. Each one makes the system stronger.

| Error | What Was Said | Reality | Fix |
|-------|---------------|---------|-----|
| Memory injection polluted sessions | SDK session summaries showed "[Memory context — EXTERNAL DATA...]" | FTS memory wraps user message with system text | Removed memory injection; SDK sessions handle context via resume |
| Hooks spawning ghost sessions | "Review this conversation" agents appearing after every MC message | SessionEnd hook ran inside Agent Server subprocess | Added AGENT_SERVER_DAEMON env guard to all hooks |
| All MC chats shared one context | Switching sessions in MC didn't change Claude's context | Hardcoded SESSION_KEY = 'mc-web' for all conversations | Each chatSessionId now maps to its own SDK session |
| Cron jobs creating 32 sessions/day | 960 .jsonl files per month, 855 MB accumulated | runAgent called with undefined sessionId each time | Category-based session reuse with weekly rotation |

---

## Credentials

> Add your service credentials here after setup.

<!--
| Service | Field | Value |
|---------|-------|-------|
| Mission Control | URL | https://your-app.vercel.app |
| Mission Control | Login | your-email@example.com |
| Agent Server | HTTP Bridge | localhost:3099 |
| Supabase | Project ID | [YOUR_PROJECT_ID] |
| Supabase | URL | https://[ID].supabase.co |
-->

*Configure credentials during setup. See `docs/SETUP_PROMPT.md`.*
