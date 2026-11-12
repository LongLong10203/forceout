# ForceOut — Project Overview

Nov 12, 2026 · Long Huang

## Summary

ForceOut is a web app where Codeforces users duel each other in real time on Codeforces problems. Players join a room, get the same set of problems, and solve them on codeforces.com. ForceOut watches their submissions and updates a shared game board. The first player to solve a problem claims it, and it is locked for everyone else.

The site supports several game modes built on that one mechanic. Version 1 ships three: Classic, Tic-Tac-Toe and Blitz.

Goals for v1:

- A player can sign in with Google, link a Codeforces handle once, create a room, invite a friend by link or room code, and finish a match with no manual refresh.
- Solves show on the board within about 10 seconds of the Codeforces verdict when few matches are running. The Codeforces rate limit sets the ceiling.
- Adding a new game mode means adding one module, not changing the match engine.

Not in v1: ratings, matchmaking, teams, chat, tournaments.

## How a match works

Every mode follows the same seven steps. Only steps 5 and 6 differ by mode.

1. **Create a room.** The host picks a mode, a duration (default 60 minutes), a problem rating range (for example 1200 to 1800), and optional tag filters. The room gets a 6 character code and an invite link.
2. **Join the lobby.** Other players open the invite link, or type the room code on the Play page. Both lead to the same lobby. Every player must have a verified Codeforces handle. Players mark themselves ready.
3. **Pick problems.** When the host starts the match, the server picks problems from the cached Codeforces problemset. It only uses rated problems inside the range that pass the tag filters and that no player in the room has already solved.
4. **Play.** Players open each problem on codeforces.com and submit there. ForceOut never accepts code itself.
5. **Claim.** While the room is open, the server checks each player's recent Codeforces submissions. The earliest Accepted submission on a problem claims it. Claiming is automatic: no player has to press anything. Ties are broken by submission time, then by lower submission ID.
6. **End.** The match ends when the timer runs out or the mode's win condition is met. Every player gets a browser notification and a sound, so anyone still coding on Codeforces knows to stop.
7. **Results.** Players see the final board, who claimed what and when, and a link to each winning submission. The match is saved to both players' history.

Rules that apply to every mode:

- Only submissions made after the match start time count.
- A claimed problem stays claimed, even if the submission is later hacked or rejudged. This keeps v1 simple.
- If a player leaves, the match continues. A player can forfeit, which ends a two-player match at once.

### End-of-match notification

- In the lobby, the room page asks for permission to show browser notifications.
- When the room page sees the match change to finished, it shows a system notification with the result, plays a sound and changes the tab title.
- The room tab must stay open while the player codes on Codeforces. Browsers slow down background tabs, so the notice can arrive up to about a minute late.
- If the player refuses permission, only the sound and the tab title are used.

## Game modes

V1 ships three modes. All use the same claim mechanic and differ only in the board layout and the win condition.

|                 | Classic                                   | Tic-Tac-Toe                                                   | Blitz                                                                          |
| --------------- | ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Players         | 2 or more                                 | Exactly 2                                                     | Exactly 2                                                                      |
| Board           | A list of 5 problems, ordered by rating   | A 3 x 3 grid, one problem per cell                            | One problem at a time, shown when its round starts                             |
| Problems needed | 5 (host can set 3 to 10)                  | 9                                                             | One per round. Host picks best of 3, 5, 7, 9 or any odd number up to 15        |
| Claiming        | First solve takes the problem's points    | First solve takes the cell                                    | First solve wins the round, and the next round starts at once                  |
| Points          | 100, 200, 300, 400, 500 by rating order   | None                                                          | 1 per round won                                                                |
| Time limit      | Whole match, default 60 minutes           | Whole match, default 60 minutes                               | Per round, default 15 minutes. If nobody solves in time, nobody wins the round |
| Win condition   | Highest score when time runs out          | Three cells in a row, column or diagonal                      | Win more than half of the rounds                                               |
| Early end       | When no other player can catch the leader | When a line is made, or no line is possible for either player | As soon as one player has won more than half of the rounds                     |
| Draw            | Equal scores                              | No line: more cells wins, equal cells is a draw               | Equal round wins after the last round                                          |

### Mode interface

Each mode is one self-contained module that the match engine calls. The engine itself knows nothing about scores or grids. A mode provides:

- `id`, `name` and a short description for the room creation screen.
- `configSchema`: the settings the host can change, with defaults and limits (a Zod schema).
- `problemCount(config)`: how many problems to pick, and any rating rule per slot.
- `initialState(config, players, problems)`: the starting board.
- `applySolve(state, solveEvent)`: returns the new state. It must be a pure function so it can be unit tested.
- `checkEnd(state, timeLeft)`: returns nothing, or the result (winner or draw, and the reason).
- `Board`: the React component that draws the state.

Blitz needs two more functions, which the other modes implement trivially:

- `visibleSlots(state)`: the problems players may see now. Blitz hides the problems of later rounds, and the server never sends them to the browser.
- `onTick(state, now)`: changes caused by time alone, such as a Blitz round timing out and the next round starting.

### Ideas for later modes

- **Bingo:** a 5 x 5 grid, first full line wins.
- **Territory:** a larger grid where a player can only claim a cell next to one they already own.
- **Team modes:** 2v2 or 3v3 versions of any mode. A solve by any member claims the problem for the whole team.

## Features

The MVP is the smallest set that lets two friends play a full match.

| Area       | MVP                                                                                                         | Later                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Accounts   | Sign in with Google; link and verify one Codeforces handle, once                                            | Change the linked handle, profile customization                                    |
| Rooms      | Create a room, join by invite link or by typing the room code, ready check, host starts                     | Public room list, quick matchmaking                                                |
| Modes      | Classic, Tic-Tac-Toe, Blitz                                                                                 | Bingo, Territory, team modes (2v2, 3v3)                                            |
| Problems   | Rating range, tag filters, only problems no player has solved                                               | Custom problem lists, per-slot ratings                                             |
| Live match | Board, timer and claim feed that update without refresh; browser notification and sound when the match ends | Spectator view, chat, animation, a notification when the opponent claims a problem |
| Results    | Final board, claim timeline, links to submissions                                                           | Shareable result image                                                             |
| History    | List of a player's past matches                                                                             | Head-to-head stats, win rate by mode                                               |
| Ranking    | None                                                                                                        | ForceOut rating (Elo), leaderboard, seasons                                        |
| Admin      | None                                                                                                        | Reports, bans, cancel a stuck match                                                |

## Tech stack

One Next.js app on Vercel holds everything. There is no background worker: Codeforces checks run inside short serverless requests that the players' browsers trigger.

| Layer           | Choice                                                                                            | Why                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework       | Next.js 16, App Router, React Server Components                                                   | Current stable major version                                                                           |
| Language        | TypeScript, strict mode                                                                           | Shared types between pages, server code and game modes                                                 |
| Database        | PostgreSQL, hosted on Neon through the Vercel Marketplace                                         | One store for users, matches and the problem cache                                                     |
| ORM             | Prisma ORM with Prisma Migrate                                                                    | Typed client, the whole schema in one file                                                             |
| Auth            | Better Auth with Google sign-in and the Prisma adapter                                            | One click to sign in on any device. Codeforces has no OAuth, so the handle is verified once and linked |
| Validation      | Zod                                                                                               | Forms, server actions and mode configs                                                                 |
| UI              | Tailwind CSS 4, shadcn/ui, lucide icons                                                           | Fast to build, easy to restyle                                                                         |
| Mutations       | Server Actions                                                                                    | No separate REST layer for create, join, ready, forfeit                                                |
| Realtime        | Short polling: the room page calls one sync endpoint every 3 seconds (TanStack Query)             | Works on serverless with no extra service and no long-lived connections                                |
| Background work | One daily Vercel Cron job that syncs the problem cache. Match checks run inside the sync endpoint | The Hobby plan runs cron at most once a day, so nothing can poll in the background                     |
| Tests           | Vitest for mode logic, Playwright for one full match flow                                         | Mode functions are pure, so they are cheap to test                                                     |
| Tooling         | pnpm, ESLint, Prettier, Docker Compose for local Postgres                                         |                                                                                                        |
| Hosting         | Vercel; the Hobby plan is enough to start                                                         | Every request must finish in seconds, and no process stays alive between requests                      |

Rules for the AI model:

- All game rules live in `/lib/modes`. The match engine and the sync endpoint never contain mode-specific code.
- All Codeforces calls go through one client in `/lib/codeforces`. Nothing else calls the Codeforces API.
- The server is the only source of truth for match state. The browser never decides who claimed a problem.
- Store all times in UTC as `timestamptz`.

Next.js version checked against the [Next.js blog](https://nextjs.org/blog); confirm the other versions when the project is scaffolded.

Hobby cron jobs run at most once a day ([Vercel cron docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)).

## Codeforces integration

ForceOut reads public data from the official Codeforces API and never submits anything. The API allows one request every two seconds, and that limit shapes the whole design ([Codeforces API help](https://codeforces.com/apiHelp)).

| Method                               | Used for                                                            | When                                             |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| `problemset.problems`                | Fill the local problem cache: contest ID, index, name, rating, tags | Once a day                                       |
| `user.info`                          | Check a handle exists; read rating and rank for the profile         | On handle link, then daily                       |
| `user.status` (full)                 | List every problem a player has solved, to exclude them             | At match start                                   |
| `user.status` with `from=1&count=20` | Find new Accepted submissions during a match                        | Continuously while the player is in a live match |

### Rate-limited client

- A one-row table (`cf_rate_limit`) holds the time of the next allowed call. Before any Codeforces call, the server claims that slot with one atomic UPDATE. If the slot is not free, it skips the call. This holds the limit across all serverless instances.
- A failed call (`status: FAILED`, HTTP error or timeout) is skipped and tried again on a later sync. A match is never ended or changed because of a failed call.
- No API key is needed. All methods used here are public.

Risk to test first: Codeforces sits behind Cloudflare and may block or challenge requests from cloud hosts. Call the API from a deployed Vercel function in build step 2, before building anything on top of it.

### Polling during a match

- While a match is live, each player's browser calls the sync endpoint every 3 seconds. Each call returns the current board. If the rate-limit slot is free, the call first checks one player on Codeforces: the player in any live match who was checked longest ago.
- With P players live, each player is checked every 2 x P seconds. One 1v1 match gives a 4 second delay. Ten 1v1 matches give 40 seconds.
- A "Check my submissions" button makes that player the next one checked. It has a 15 second cooldown per player.
- A submission counts when its verdict is `OK`, its problem (contest ID plus index) is on the board, and its `creationTimeSeconds` is after the match start and before the match end.
- Claim order uses the Codeforces submission time, not the time ForceOut noticed it. The first sync after the end time does one final check of every player, then closes the match. If nobody has the room open, the match closes on the next visit.

### Fair claims

The risk: player A solves first but is checked late, while player B solves later, is checked first and gets the problem. Two rules prevent this:

- Claiming is automatic. A solve counts without the player pressing any button.
- When a check finds an Accepted submission on an unclaimed problem, the same request checks every other player in that match before it writes the claim, waiting for the rate-limit slot each time. The problem goes to the earliest submission time among them.

To save calls, skip the extra check for any player whose last check came after that submission's time and showed no submission still being judged. In a 1v1 the rule costs at most one extra call, about 2 seconds, and only at the moment of a solve. Routine polling does not change.

An option to test later: `problemset.recentStatus` returns the most recent submissions of all users in one call, so one request could cover every live match. Check on the real API how far back its 1000 submissions reach before relying on it.

### Handle verification

1. After the first Google sign-in, the player types a handle on the Settings page. The server confirms it exists with `user.info`.
2. The server shows a random problem and asks the player to submit anything that gives a Compilation Error within 5 minutes.
3. The server checks `user.status` for a `COMPILATION_ERROR` on that problem submitted after the challenge began.
4. On success the handle is linked to the Google account for good. One handle can belong to only one account. Later sign-ins on any device need only Google, never the challenge again.

### Problem cache

- Skip problems with no rating.
- Store the problem URL as `https://codeforces.com/problemset/problem/{contestId}/{index}`.
- If fewer problems match than the mode needs, block the start and tell the host to widen the rating range.

Tag filters: the host can choose tags to include and tags to exclude, from the tag list in the cached problems. A problem passes when it has at least one included tag (or no include list is set) and none of the excluded tags.

## Data model

Seven tables cover the MVP, and Better Auth adds its own session and account tables.

| Table               | Holds                                                                                           | Key fields                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | One row per ForceOut account. This is Better Auth's user table with the Codeforces fields added | `id`, `name`, `cf_handle` (unique, empty until linked), `cf_rating`, `cf_verified_at`                                                                                                                |
| `handle_challenges` | Pending handle verifications                                                                    | `user_id`, `cf_handle`, `problem_id`, `expires_at`                                                                                                                                                   |
| `problems`          | Cache of the Codeforces problemset                                                              | `id` (contest ID plus index), `contest_id`, `index`, `name`, `rating`, `tags[]`                                                                                                                      |
| `matches`           | One row per room and its match                                                                  | `id`, `code` (invite code), `host_id`, `mode`, `config` (jsonb), `status` (lobby, live, finished, cancelled), `state` (jsonb, the mode's board), `version`, `starts_at`, `ends_at`, `result` (jsonb) |
| `match_players`     | Who is in a match                                                                               | `match_id`, `user_id`, `seat` (0, 1, ...), `ready`, `score`, `outcome` (win, loss, draw, forfeit), `last_checked_at`                                                                                 |
| `match_problems`    | The problems on the board                                                                       | `match_id`, `slot` (list position, grid cell 0 to 8, or round number), `problem_id`, `points`, `claimed_by`, `claimed_at`, `cf_submission_id`, `revealed_at`                                         |
| `cf_rate_limit`     | One row that enforces the Codeforces rate limit                                                 | `id`, `next_allowed_at`                                                                                                                                                                              |

Notes:

- `match_problems` has a unique key on (`match_id`, `slot`). A claim is one `UPDATE ... WHERE claimed_by IS NULL`, so two solves can never claim the same problem.
- `matches.state` is rebuilt from `match_problems` by the mode module. It is a cache for fast reads, not the source of truth.
- `matches.version` goes up by one on every change to a match. The browser sends the version it has, and the sync endpoint returns the board only when a newer one exists.

## Pages and routes

The MVP has six pages, one sync endpoint and one cron endpoint.

| Route                   | Page                                                                             | Sign-in needed                  |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `/`                     | Landing page: what ForceOut is, the modes, a "Create room" button                | No                              |
| `/login`                | Sign in with Google                                                              | No                              |
| `/settings`             | Link and verify the Codeforces handle, sign out                                  | Yes                             |
| `/play`                 | Create a room (mode, duration, rating range, tags) or join by typing a room code | Yes                             |
| `/room/[code]`          | One page with three states: lobby, live match, results                           | Yes to play, no to view results |
| `/u/[handle]`           | Profile: Codeforces rating, match history, win and loss count                    | No                              |
| `/api/room/[code]/sync` | Returns the board; checks Codeforces when the rate-limit slot is free            | No                              |
| `/api/cron/problems`    | Daily problem cache sync, called by Vercel Cron                                  | Cron secret                     |

## Build order

Build in eight steps, and make each one work before starting the next. Give the AI model one step at a time with this whole document as context.

Before step 1 the user needs three things: a Vercel account, a Neon database with its connection string, and a Google OAuth client ID and secret from Google Cloud Console. The model should explain how to get each one and where to put it in the environment variables.

1. **Scaffold.** Next.js app, Tailwind, shadcn/ui, Prisma, Docker Compose Postgres, the schema above, a seed script. Deploy to Vercel with a Neon database from the first day.
2. **Codeforces client.** The rate-limited client with the `cf_rate_limit` table, and the daily problem cache sync on Vercel Cron. Confirm that Codeforces answers requests from the deployed Vercel function.
3. **Auth.** Google sign-in and sign out with Better Auth. Protected routes redirect to `/login`.
4. **Handle verification.** The `/settings` flow that links a Codeforces handle, end to end against the real API. A player with no linked handle cannot create or join a room.
5. **Rooms and lobby.** Create, join by link or by typed code, ready check, start. The lobby updates by polling the sync endpoint.
6. **Match engine with Classic.** Problem picking with rating and tag filters, the mode interface, claim logic, the timer, the results state, the end-of-match notification. Add a dev-only "fake solve" button so the engine can be tested without Codeforces.
7. **Live polling.** The sync endpoint checks players in live matches on Codeforces and applies real solves, using the fair-claim rule. Add the "Check my submissions" button.
8. **Tic-Tac-Toe, Blitz, history and profile.** Each new mode as a new module only, then `/u/[handle]` and the landing page.

Done means: two real accounts play one match in each of the three modes to the end, and all three appear in history.

Instruction to the AI model: build only the step the user names. When that step works, stop, summarize what you built and how to test it, and wait for the user to name the next step. Never start a later step on your own.

## Open decisions

Each item below has a default that the rest of this document assumes. Change the default here and in the matching section before you hand the document to the model.

- [ ] **Sign-in method.** Decided: Google sign-in; the verified Codeforces handle is linked once to the Google account.
- [ ] **Players per match.** Default: Classic allows 2 or more, Tic-Tac-Toe and Blitz exactly 2.
- [ ] **Hosting.** Decided: Vercel. No worker; the players' browsers drive Codeforces checks through a sync endpoint.
- [ ] **ORM.** Decided: Prisma.
- [ ] **Hacked or rejudged solves.** Default: a claim is final.
- [ ] **Problem points in Classic.** Default: fixed 100 to 500. Alternative: points equal to the problem rating.
- [ ] **Visual style.** Default: dark theme, close to the Codeforces rank colors.
- [ ] **Language.** Default: English only.
