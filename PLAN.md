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
  eslint, prettier, tsx for dev running).
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

### Phase 4 — Documentation
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

**Production host: [Bot-Hosting.net](https://bot-hosting.net/).** BlazeBot runs there as a Node.js
22 application with 1 GB RAM, 50% shared CPU, and 1 GB persistent storage. Secrets are configured
through the host's environment-variable manager and are never committed to GitHub.

The production entry file is `dist/index.js`. The configured start command installs dependencies,
builds the TypeScript project, copies the SQL migrations into `dist/`, and launches the compiled
entry point:

```sh
cd /home/container && if [ -f package.json ]; then npm install --no-fund --no-audit && npm run build; fi && node ${STARTUP_FILE}
```

Deployments are updated through **Files → GitHub sync** using the `main` branch and the **Merge —
overwrite repo files only; keep everything else** strategy. Never select **Replace all files**:
that option wipes the deployment root, including `data/blazebot.sqlite`. Merge updates tracked
repository files while retaining the SQLite database, `node_modules`, and generated `dist` files.
After syncing, restart the deployment and confirm `Bot online` appears in the console.

SQLite persistence has been verified across this sync-and-restart procedure: a stored 500-chip
balance remained available after a GitHub update. Host backups are useful, but important database
data should also be backed up off-site periodically.

Run `npm run deploy-commands` separately whenever slash command definitions change.

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
