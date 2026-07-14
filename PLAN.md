# BlazeBot — Build Plan

## Goal

Build a Discord bot starting with a single slash command, but structured from day one so new
features (APIs, databases, AI integrations, background jobs, more commands) can be dropped in
without refactoring the core. Optimize for: low resource footprint, clear module boundaries,
and a fast "add one file, register it, done" workflow for new features.

This document is the spec. An AI coding agent should follow it top to bottom, checking off each
phase, and should not introduce abstractions beyond what's listed here — the modularity comes
from folder/interface boundaries, not from speculative generic frameworks.

---

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ (LTS) | Lightweight, best Discord library support |
| Language | TypeScript | Type safety across a growing command/feature surface |
| Discord library | discord.js v14 | Most mature, first-class slash command + interaction support |
| Database | SQLite via `better-sqlite3` | Zero-config, file-based, synchronous (fast for a single bot process), trivial to swap for Postgres later |
| DB access layer | Plain repository modules (no ORM initially) | Keep it lightweight; swap in Prisma/Drizzle later only if schema complexity grows |
| Config/secrets | `.env` via `dotenv` | Standard, simple |
| Logging | `pino` | Fast, structured logging, negligible overhead |
| Process management | none required for dev; `pm2` optional for prod | Keep footprint small |
| Testing | `vitest` | Fast, TS-native |
| Linting/formatting | `eslint` + `prettier` | Consistency as codebase grows |

No web framework, no message-based queue, no Docker requirement at this stage — those are
explicitly deferred until a real feature needs them (see "Future Expansion").

---

## Architecture Overview

The core principle: **the bot's core (login, event wiring, command dispatch) never changes when
you add a feature.** Features are self-contained modules that register themselves into the core
via well-defined interfaces.

```
src/
  index.ts                 # entrypoint: build client, load modules, login
  core/
    client.ts               # extended Discord.Client factory
    commandLoader.ts         # scans commands/ and registers them
    eventLoader.ts           # scans events/ and binds them
    deployCommands.ts        # script: push slash commands to Discord API
    logger.ts                # pino instance, shared
    config.ts                # loads/validates env vars (fail fast on missing)
  commands/
    ping/
      command.ts             # SlashCommandBuilder definition + execute()
  events/
    ready.ts
    interactionCreate.ts
  services/                  # feature-agnostic integrations, added over time
    database/
      db.ts                  # opens the SQLite connection
      migrations/             # numbered .sql files
      repositories/            # one file per table/entity, plain functions
    (future: api/, ai/, cache/, scheduler/ ...)
  types/
    command.ts               # shared Command interface
    index.ts
tests/
  commands/
  services/
.env.example
package.json
tsconfig.json
```

### Core contracts (write these first, keep them stable)

```ts
// types/command.ts
export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
```

```ts
// types/event.ts
export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}
```

- **Adding a command** = create `commands/<name>/command.ts` exporting a `Command`. The loader
  auto-discovers it (glob over `commands/*/command.ts`). No edits to core files.
- **Adding an event listener** = same pattern under `events/`.
- **Adding a feature that needs state** = add a repository module under `services/database/repositories/`
  and a migration file. Commands call repositories; they never touch `db.ts` directly.
- **Adding an external API integration** = new folder under `services/`, exposing a small typed
  client (e.g. `services/weather/client.ts`). Commands import the service; the service knows
  nothing about Discord.
- **Adding AI integration later** = same pattern: `services/ai/client.ts` wrapping the Claude/OpenAI
  SDK, with its own config keys. Commands call it like any other service.

This keeps every dependency direction one-way: `commands/events -> services -> external world`.
Nothing reaches back up, so services stay testable and swappable in isolation.

---

## Implementation Phases

### Phase 0 — Project scaffolding
- `npm init`, install dependencies (discord.js, typescript, dotenv, pino, better-sqlite3,
  eslint, prettier, vitest, tsx for dev running).
- `tsconfig.json` (strict mode on), `.eslintrc`, `.prettierrc`.
- `.env.example` with `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (guild id used for
  fast local command deployment during dev), `LOG_LEVEL`.
- `.gitignore` (node_modules, .env, *.sqlite, dist).
- `src/core/config.ts`: load env, throw on startup if required vars missing.

### Phase 1 — Core bot skeleton
- `src/core/client.ts`: create Client with only the intents currently needed (`Guilds` for
  slash commands; add more only when a feature requires them — don't pre-request intents).
- `src/core/logger.ts`: pino instance exported as singleton.
- `src/core/commandLoader.ts`: recursively load all `commands/*/command.ts`, return a
  `Collection<string, Command>` keyed by `command.data.name`.
- `src/core/eventLoader.ts`: recursively load all `events/*.ts`, bind via `client.on`/`once`.
- `src/index.ts`: wire config -> client -> loaders -> login.
- `src/core/deployCommands.ts`: standalone script (`npm run deploy-commands`) that registers
  slash commands with Discord's REST API — guild-scoped in dev (instant), global in prod
  (~1hr propagation). Keep deployment separate from bot startup.

### Phase 2 — First feature: `/ping` slash command
- `commands/ping/command.ts`: replies with "Pong!" and round-trip latency.
- `events/ready.ts`: log "Bot online as <tag>".
- `events/interactionCreate.ts`: look up command by name in the loaded collection, call
  `execute`, wrap in try/catch that logs errors and replies with a generic error message
  (never let an unhandled rejection crash the process or leave the interaction hanging).
- Manual test: run `npm run deploy-commands`, then `npm run dev`, verify `/ping` in a test
  Discord server.

### Phase 3 — Database foundation (build now, even if unused)
- `services/database/db.ts`: open `data/blazebot.sqlite` (create `data/` if missing), enable
  `PRAGMA journal_mode = WAL`.
- Simple migration runner: `migrations/0001_init.sql` + a `migrations` table tracking applied
  IDs; runner applies any not-yet-applied files in order on startup.
- One example repository (e.g. `services/database/repositories/guildSettings.ts`) with plain
  functions (`getGuildSettings`, `upsertGuildSettings`) to prove the pattern, even if no command
  uses it yet.

### Phase 4 — Testing & quality gates
- `vitest` unit tests for: config validation, commandLoader (loads a fixture command), one
  repository function against an in-memory SQLite DB.
- `npm run lint`, `npm run typecheck`, `npm run test` — document these in README as the pre-commit
  checklist.

### Phase 5 — Documentation
- `README.md`: setup steps, env vars, how to add a command/event/service (point back to this
  file's contracts), how to run locally, how to deploy commands.

---

## Future Expansion (do not build now — just keep the seams open)

These are explicitly out of scope until requested, but the architecture above should not need
rework to support them:

- **More external APIs** (weather, games, etc.): new `services/<name>/` folder + typed client.
- **AI integration** (e.g. Claude): `services/ai/client.ts` wrapping the Anthropic SDK; a
  `/ask` command becomes a thin adapter calling it. Use the `claude-api` skill/reference when
  this is implemented for current model IDs and SDK usage.
- **Scheduled/background jobs**: `services/scheduler/` using `node-cron`; jobs registered
  independently of commands.
- **Swapping SQLite for Postgres**: because DB access is isolated behind repository functions,
  only `db.ts` and repositories change — commands don't.
- **Sharding / multi-process**: discord.js's built-in `ShardingManager`, only needed once the
  bot is in enough guilds to require it.
- **Button/select-menu/modal interactions**: extend `interactionCreate.ts` dispatch with a
  type check (`isChatInputCommand()`, `isButton()`, etc.), each routed to its own handler map —
  mirrors the existing command pattern.

---

## Hosting

The bot is a long-lived process (persistent WebSocket connection to Discord's gateway), not a
request/response web app, so it needs a host that keeps a process running continuously — not a
"serverless"/spin-down-on-idle platform.

**Recommendation: Railway.** Least setup of the viable options: connect the GitHub repo, Railway
auto-detects the Node project, you set the env vars (`DISCORD_TOKEN`, etc.) in its dashboard, and
it builds/deploys on every push — no Dockerfile or server management required. It has no
permanent free plan, but the Hobby plan includes $5/month of usage credit, which comfortably
covers a lightweight bot like this (idle most of the time, minimal CPU/RAM) — realistic cost is
$0–3/month. SQLite works fine as long as you attach a Railway volume so `data/blazebot.sqlite`
persists across redeploys (without a volume, the filesystem resets on each deploy).

Runner-up: **Fly.io** — has a genuinely free always-on allowance (small shared-CPU VM), so it can
run this bot at $0/month. Slightly more setup than Railway (needs a `Dockerfile` and the `flyctl`
CLI), but still scriptable in a few commands. Worth switching to if the Railway credit ever stops
being enough.

Avoid: Render's free tier and similar "free web service" tiers — they spin the process down after
~15 minutes of inactivity, which drops the bot's Discord connection. They only work with an
external keep-alive pinger hack, which adds complexity for no benefit here.

Setup steps to add to Phase 5 (Documentation) once ready to deploy:
1. Push the repo to GitHub.
2. Create a Railway project, link the repo.
3. Add environment variables in the Railway dashboard (never commit `.env`).
4. Attach a volume mounted at `data/` so the SQLite file persists.
5. Set the start command (`npm run build && npm start`) and confirm the deploy logs show the bot
   logging in successfully.
6. Run the command-deploy script once (`npm run deploy-commands`) against production — either as
   a one-off Railway shell command or a local run using the prod token/guild ID.

---

## Ground Rules for the Implementing Agent

- Keep `core/` free of feature-specific logic — if you're editing a core file to add a feature,
  stop and add a module instead.
- No premature abstraction: don't build a generic "plugin system," config schema validator
  library, or ORM until a real feature needs it. The folder convention + shared interfaces above
  *are* the plugin system.
- Every new command gets its own folder even if it's one file — keeps future multi-file commands
  (e.g. with subcommands) consistent.
- Fail fast and loud on missing config at startup; never silently default a secret.
- Never commit `.env` or the `data/*.sqlite` file.
