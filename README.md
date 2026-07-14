# BlazeBot

A modular Discord bot built with TypeScript, discord.js v14, and SQLite. Architecture and
contracts are specified in [PLAN.md](PLAN.md) — read that before adding features.

## Features

- **Leveling / XP** — members earn XP for chatting, with `/rank` cards and a `/leaderboard`.
- **Economy** — daily chip claims (`/daily`), balances (`/balance`), peer transfers (`/give`),
  and cashing chips out into dollars (`/cashout`).
- **Casino** — a single `/casino` hub with a game-select menu; games currently include
  **roulette**, **slots**, and **video blackjack** (hit/stand only, Tower Unite style).
- **Shop & inventory** — spend dollars on cosmetic items (`/shop`, `/inventory`); one item can
  be equipped at a time and grants a casino payout multiplier.
- **Modular core** — adding a command, event listener, or stateful feature never touches
  `src/core/`; features self-register via loaders (see [Adding features](#adding-features)).

## Slash commands

| Command | Description |
|---|---|
| `/ping` | Health check |
| `/rank` | Your level, XP, and progress |
| `/leaderboard` | Server XP leaderboard |
| `/daily` | Claim your daily chips |
| `/balance` | Your chips and dollars |
| `/give` | Give chips to another member |
| `/cashout` | Convert chips into dollars |
| `/casino` | Open the casino hub (roulette, slots, video blackjack) |
| `/shop` | Browse and buy items with dollars |
| `/inventory` | View and equip your items |

## Tech stack

TypeScript on Node.js 20+, discord.js v14, SQLite via `better-sqlite3` (WAL mode, plain-SQL
migrations, repository modules — no ORM), `pino` for structured logging, `vitest` for tests.
The full rationale for each choice is in [PLAN.md](PLAN.md).

## Prerequisites

- Node.js 20+
- A Discord application + bot (see setup below)

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Under **Bot**, click **Reset Token** and copy the token → this is `DISCORD_TOKEN`.
3. Under **General Information**, copy the **Application ID** → this is `DISCORD_CLIENT_ID`.
4. Invite the bot to a test server: **OAuth2 → URL Generator**, check the `bot` and
   `applications.commands` scopes, open the generated URL, and pick your server.
5. In Discord, enable Developer Mode (User Settings → Advanced), right-click your test server,
   **Copy Server ID** → this is `DISCORD_GUILD_ID`.

### 2. Configure and run

```sh
npm install
copy .env.example .env   # then fill in the values
npm run deploy-commands  # registers slash commands (instant when DISCORD_GUILD_ID is set)
npm run dev              # starts the bot with hot reload
```

You should see `Bot online as <name>` in the logs. Type `/ping` in your test server to verify.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token |
| `DISCORD_CLIENT_ID` | yes | Application ID |
| `DISCORD_GUILD_ID` | no | Test server ID — when set, `deploy-commands` registers guild-scoped (instant); when empty, global (~1h to propagate) |
| `LOG_LEVEL` | no | pino level, defaults to `info` |

The bot fails fast at startup if a required variable is missing. Never commit `.env`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run with hot reload (tsx watch) |
| `npm run deploy-commands` | Push slash command definitions to Discord |
| `npm run clear-commands` | Remove all registered slash commands (global + guild), e.g. to wipe stale commands from a previous bot setup |
| `npm run build` | Compile to `dist/` (includes copying migration `.sql` files) |
| `npm start` | Run the compiled build |
| `npm run lint` / `typecheck` / `test` | Quality gates — run all three before committing |
| `npm run format` | Prettier |

## Adding features

The core (`src/core/`) never changes when you add a feature. See PLAN.md for the full contracts.

- **Command**: create `src/commands/<name>/command.ts` exporting `command: Command`
  (a `SlashCommandBuilder` + `execute()`). The loader auto-discovers it. Run
  `npm run deploy-commands` after adding or changing a command definition.
- **Event listener**: create `src/events/<name>.ts` exporting `event: BotEvent<'eventName'>`.
- **Stateful feature**: add a numbered `.sql` file in `src/services/database/migrations/`
  (applied automatically on startup) and a repository module in
  `src/services/database/repositories/`. Commands call repositories, never `db.ts` directly.
- **External API / AI integration**: new folder under `src/services/` exposing a small typed
  client. Services know nothing about Discord.

## Database

SQLite file at `data/blazebot.sqlite` (WAL mode), created automatically on first run.
Migrations are plain `.sql` files applied in filename order and tracked in a `migrations` table.

## Deployment

See the **Hosting** section of PLAN.md (recommendation: Railway with a volume mounted at `data/`).
