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
- **BlazeBot AI chat** — inexpensive one-off or persistent conversation threads backed by
  OpenRouter's DeepSeek V4 Flash, opt-in web search, and durable SQLite history.
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
| `/chat ask`                    | Ask BlazeBot AI; optionally allow web search           |
| `/chat start`                  | Start a persistent AI conversation thread              |
| `/chat reset` / `info` / `end` | Manage the current AI conversation                     |

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
3. Still under **Bot**, enable **Message Content Intent** so AI chat can read normal messages inside
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
| `AI_CHAT_ENABLED`            | no                 | Set to `true` to enable `/chat`; defaults to `false`                                                                 |
| `OPENROUTER_API_KEY`         | when AI is enabled | Rotated OpenRouter API key; never commit or share it                                                                 |
| `OPENROUTER_MODEL`           | no                 | OpenRouter model slug; defaults to `deepseek/deepseek-v4-flash`                                                      |
| `AI_WEB_SEARCH_ENABLED`      | no                 | Global kill switch for explicitly requested search; defaults to `true`                                               |
| `AI_MAX_OUTPUT_TOKENS`       | no                 | Maximum AI response tokens, defaults to `700`                                                                        |
| `AI_CONTEXT_TOKEN_BUDGET`    | no                 | Approximate recent-history budget, defaults to `12000`                                                               |
| `AI_MAX_CONCURRENT_REQUESTS` | no                 | Process-wide OpenRouter concurrency, defaults to `2`                                                                 |
| `AI_DAILY_BUDGET_USD`        | no                 | Per-server daily cap using provider-reported cost, defaults to `$1`; `0` disables it                                 |

The bot fails fast at startup if a required variable is missing. Never commit `.env`.

To enable AI chat, create a limited OpenRouter API key, set `AI_CHAT_ENABLED=true` and
`OPENROUTER_API_KEY` in `.env`, enable Discord's Message Content Intent, redeploy slash commands,
and restart BlazeBot. The bot also needs View Channel, Create Public Threads, Send Messages in
Threads, and Read Message History permissions in channels where `/chat start` is used.

Ordinary messages do not expose a search tool. Enable it for a one-off command with the `search`
option, or prefix a message inside an AI thread with `!search`. Search uses OpenRouter's server-side
tool with strict result/context caps and returns Discord-friendly source links. BlazeBot stores
OpenRouter's exact reported token cost and number of search requests for budget accounting.

## Scripts

| Script                       | What it does                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                | Run with hot reload (tsx watch)                                                                              |
| `npm run deploy-commands`    | Push slash command definitions to Discord                                                                    |
| `npm run clear-commands`     | Remove all registered slash commands (global + guild), e.g. to wipe stale commands from a previous bot setup |
| `npm run build`              | Compile to `dist/` (includes copying migration `.sql` files)                                                 |
| `npm start`                  | Run the compiled build                                                                                       |
| `npm run lint` / `typecheck` | Optional static quality checks                                                                               |
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

Add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `LOG_LEVEL`, and the AI variables you
use through the host's environment-variable page. Never upload or commit `.env`.

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
