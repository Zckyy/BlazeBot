# BlazeBot

A modular Discord bot built with TypeScript, discord.js v14, and SQLite. Architecture and
contracts are specified in [PLAN.md](PLAN.md) — read that before adding features.

The production bot is hosted by [Bot-Hosting.net](https://bot-hosting.net/) and synchronized
from the `main` branch.

## Features

- **Leveling / XP** — members earn XP for chatting, with `/rank` cards and a `/leaderboard`.
- **Economy** — daily chip claims (`/daily`), balances (`/balance`), peer transfers (`/give`),
  and cashing chips out into dollars (`/cashout`).
- **Casino** — a single `/casino` hub with a game-select menu; games currently include
  **roulette**, **slots**, and **video blackjack** (hit/stand only, Tower Unite style).
- **Shop & inventory** — spend dollars on cosmetic items (`/shop`, `/inventory`); one item can
  be equipped at a time and grants a casino payout multiplier.
- **Grok AI chat** — ask one-off questions or create persistent, owner-only conversation threads
  backed by xAI's Grok 4.3 model, built-in web search, and durable SQLite history.
- **Modular core** — adding a command, event listener, or stateful feature never touches
  `src/core/`; features self-register via loaders (see [Adding features](#adding-features)).

## Slash commands

| Command                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `/ping`                        | Health check                                           |
| `/rank`                        | Your level, XP, and progress                           |
| `/leaderboard`                 | Server XP leaderboard                                  |
| `/daily`                       | Claim your daily chips                                 |
| `/balance`                     | Your chips and dollars                                 |
| `/give`                        | Give chips to another member                           |
| `/cashout`                     | Convert chips into dollars                             |
| `/casino`                      | Open the casino hub (roulette, slots, video blackjack) |
| `/shop`                        | Browse and buy items with dollars                      |
| `/inventory`                   | View and equip your items                              |
| `/grok ask`                    | Ask Grok a one-off question                            |
| `/grok start`                  | Start a persistent Grok conversation thread            |
| `/grok reset` / `info` / `end` | Manage the current Grok conversation                   |

## Tech stack

TypeScript on Node.js 20+, discord.js v14, SQLite via `better-sqlite3` (WAL mode, plain-SQL
migrations, repository modules — no ORM), and `pino` for structured logging.
The full rationale for each choice is in [PLAN.md](PLAN.md).

## Prerequisites

- Node.js 20+
- A Discord application + bot (see setup below)

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Under **Bot**, click **Reset Token** and copy the token → this is `DISCORD_TOKEN`.
3. Still under **Bot**, enable **Message Content Intent** so Grok can read normal messages inside
   its dedicated conversation threads.
4. Under **General Information**, copy the **Application ID** → this is `DISCORD_CLIENT_ID`.
5. Invite the bot to a test server: **OAuth2 → URL Generator**, check the `bot` and
   `applications.commands` scopes, open the generated URL, and pick your server.
6. In Discord, enable Developer Mode (User Settings → Advanced), right-click your test server,
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

| Variable                     | Required           | Purpose                                                                                                              |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`              | yes                | Bot token                                                                                                            |
| `DISCORD_CLIENT_ID`          | yes                | Application ID                                                                                                       |
| `DISCORD_GUILD_ID`           | no                 | Test server ID — when set, `deploy-commands` registers guild-scoped (instant); when empty, global (~1h to propagate) |
| `LOG_LEVEL`                  | no                 | pino level, defaults to `info`                                                                                       |
| `AI_CHAT_ENABLED`            | no                 | Set to `true` to enable `/grok`; defaults to `false`                                                                 |
| `XAI_API_KEY`                | when AI is enabled | xAI Console API key; never commit it                                                                                 |
| `XAI_MODEL`                  | no                 | xAI model, defaults to the fixed `grok-4.3` model ID                                                                 |
| `XAI_REASONING_EFFORT`       | no                 | `none` (default) or `low`                                                                                            |
| `AI_MAX_OUTPUT_TOKENS`       | no                 | Maximum Grok response tokens, defaults to `1000`                                                                     |
| `AI_CONTEXT_TOKEN_BUDGET`    | no                 | Approximate recent-history budget, defaults to `30000`                                                               |
| `AI_MAX_CONCURRENT_REQUESTS` | no                 | Process-wide xAI concurrency, defaults to `2`                                                                        |
| `AI_DAILY_BUDGET_USD`        | no                 | Per-server estimated daily cap, defaults to `$1`; `0` disables it                                                    |

The bot fails fast at startup if a required variable is missing. Never commit `.env`.

To enable Grok, create an API key in the xAI Console, set `AI_CHAT_ENABLED=true` and
`XAI_API_KEY` in `.env`, enable Discord's Message Content Intent, redeploy slash commands, and
restart BlazeBot. The bot also needs View Channel, Create Public Threads, Send Messages in Threads,
and Read Message History permissions in channels where `/grok start` is used.

Every Grok request exposes xAI's server-side Web Search tool. Grok decides when live information is
useful, may return inline source links, and is limited to five tool calls per request. Web Search
invocations are included in the stored cost estimate and daily server budget.

## Scripts

| Script                       | What it does                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                | Run with hot reload (tsx watch)                                                                              |
| `npm run deploy-commands`    | Push slash command definitions to Discord                                                                    |
| `npm run clear-commands`     | Remove all registered slash commands (global + guild), e.g. to wipe stale commands from a previous bot setup |
| `npm run build`              | Compile to `dist/` (includes copying migration `.sql` files)                                                 |
| `npm start`                  | Run the compiled build                                                                                       |
| `npm run lint` / `typecheck` | Optional static quality checks                                                                               |
| `npm test`                   | Run the automated test suite                                                                                 |
| `npm run format`             | Prettier                                                                                                     |

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

Production runs as a Node.js 22 application on [Bot-Hosting.net](https://bot-hosting.net/) with
1 GB RAM, 50% shared CPU, and 1 GB storage. Configure the deployment with:

```text
Entry file: dist/index.js
Start command: cd /home/container && if [ -f package.json ]; then npm install --no-fund --no-audit && npm run build; fi && node ${STARTUP_FILE}
```

Add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `LOG_LEVEL` through the host's
environment-variable page. Never upload or commit `.env`.

### Updating the hosted bot

1. Push the desired changes to the GitHub `main` branch.
2. Open **Files → GitHub sync** in Bot-Hosting.net.
3. Select the `main` branch and the **Merge — overwrite repo files only; keep everything else**
   strategy.
4. Sync the files, then restart the deployment and confirm the console logs `Bot online`.

Always use **Merge** for this deployment. **Replace all files** wipes the deployment root and
would delete the persistent `data/blazebot.sqlite` database. The merge workflow was verified by
redeploying after a `/daily` claim and confirming the 500-chip balance remained intact.

Run `npm run deploy-commands` separately whenever a slash command's definition changes.
