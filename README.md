# ForceOut

**Real-time duels on Codeforces problems.** Play it at **[force-out.vercel.app](https://force-out.vercel.app)**.

Join a room with a friend, get the same set of problems, and solve them on codeforces.com as usual. ForceOut watches your submissions: the first Accepted one claims the problem and locks it for everyone else.

## How a match works

1. **Create a room.** Pick a mode, a problem rating range and optional tag filters. Share the invite link or the 6 character room code.
2. **Get the problems.** When the host starts, ForceOut picks rated problems that no player in the room has solved before.
3. **Solve on Codeforces.** You never paste code into ForceOut. It reads your public submissions and claims a problem for you the moment one is Accepted.
4. **Stay in the loop.** The board updates by itself, and you get a notification when someone claims a problem, when a new round starts and when the match ends.

Sign in with Google, then link your Codeforces handle once by submitting a Compilation Error to a problem ForceOut names. That proves the handle is yours.

## Game modes

| Mode            | Players | How you win                                                                                                                        |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Classic**     | 2 to 8  | A list of problems worth 100 to 500 points by difficulty. The first solve takes the points. Highest score when time runs out wins. |
| **Tic-Tac-Toe** | 2       | A 3 x 3 grid with one problem per cell. The first solve takes the cell. Three in a row, column or diagonal wins.                   |
| **Blitz**       | 2       | One problem at a time, best of 1 to 15 rounds. The first solve wins the round, and the next problem appears after a short break.   |

Every mode also ends early when the result can no longer change, and a player can forfeit.

## Features

- **Fair claims.** A problem goes to the earliest Codeforces submission time, not to whoever ForceOut happened to check first. A solve in the last seconds still counts: the match waits for one final check of every player before it closes.
- **Live board** with a timer and an activity feed, with no page refresh.
- **Notifications and sounds** for claims, new rounds and the end of the match, so you can keep your eyes on Codeforces.
- **Profiles and history.** Every player has a public page with their record and past matches, and every finished match has a results page with the claim timeline and links to the winning submissions.
- **Return to a match.** Closing the tab does not end a match; the home page shows a button to get back in.

## How it is built

ForceOut is one Next.js app with no background worker. The players' browsers poll a sync endpoint every 3 seconds, and those requests also do the background work: checking Codeforces and moving the match clock forward.

| Layer        | Choice                                                         |
| ------------ | -------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, React Server Components), TypeScript   |
| Database     | PostgreSQL with Prisma (Neon in production, Docker locally)    |
| Auth         | Better Auth with Google sign-in                                |
| UI           | Tailwind CSS 4, shadcn/ui                                      |
| Live updates | Short polling with TanStack Query                              |
| Tests        | Vitest for the game rules                                      |
| Hosting      | Vercel, with a daily cron job that refreshes the problem cache |

A few design points:

- **Game modes are plug-ins.** Each mode is one folder in [`lib/modes`](lib/modes) with pure functions for its rules (unit tested) and a board component. The match engine in [`lib/match-engine.ts`](lib/match-engine.ts) contains no game rules, so a new mode is a new folder and one line in the registry.
- **One Codeforces client.** Everything that talks to the Codeforces API goes through [`lib/codeforces`](lib/codeforces), which enforces the API's limit of one request every two seconds across all serverless instances using a single database row.
- **The server decides.** The browser never decides who claimed a problem. A claim is one `UPDATE ... WHERE claimed_by IS NULL`, and the board is rebuilt from the stored claims.

The original design document is in [docs/OVERVIEW.md](docs/OVERVIEW.md).

## Run locally

You need Node.js, pnpm and Docker Desktop (running).

```bash
cp .env.example .env   # first time only, then fill in the Google OAuth values
pnpm install
pnpm db:up             # start Postgres in Docker
pnpm db:migrate        # apply the schema
pnpm db:seed           # sample problems and two fake players
pnpm dev               # http://localhost:3000
```

Outside production, the login page offers two fake players, "Alice (dev)" and "Bob (dev)", and the match page has a "fake solve" panel, so you can test a full match by yourself without touching Codeforces.

| Command          | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `pnpm db:down`   | Stop Postgres (data is kept)                              |
| `pnpm db:studio` | Browse the database                                       |
| `pnpm cf:sync`   | Run the problem cache sync now (needs `pnpm dev` running) |
| `pnpm cf:check`  | Try the Codeforces client against the real API            |
| `pnpm test`      | Unit tests for the game mode rules                        |
| `pnpm lint`      | ESLint                                                    |
| `pnpm format`    | Prettier                                                  |
| `pnpm build`     | Production build                                          |

## Deploy your own

The live site deploys automatically from the `main` branch. To host a copy yourself:

1. Fork this repository and import it in Vercel (framework: Next.js).
2. In the Vercel project, open **Storage** and add a **Neon** Postgres database. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
3. Add these environment variables for Production:

   | Variable                                   | Value                                                         |
   | ------------------------------------------ | ------------------------------------------------------------- |
   | `BETTER_AUTH_SECRET`                       | A new secret: `openssl rand -base64 32`                       |
   | `BETTER_AUTH_URL`                          | Your site address, for example `https://your-site.vercel.app` |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From a Google OAuth client (Google Cloud Console)             |
   | `CRON_SECRET`                              | A new secret: `openssl rand -hex 24`                          |

4. In the Google OAuth client, add `https://YOUR-SITE` to the JavaScript origins and `https://YOUR-SITE/api/auth/callback/google` to the redirect URIs.
5. Deploy. The build creates the database tables.
6. Fill the problem cache once: in Vercel, open **Settings → Cron Jobs** and press **Run** next to `/api/cron/problems`. After that it runs daily.

Do not run `pnpm db:seed` against a production database: it only adds the fake development players.

## Credits

- **Designed by [Long](https://github.com/LongLong10203)**, who wrote the product design, made the decisions and tested the app.
- **Built with [Claude Code](https://claude.com/claude-code).** Claude, Anthropic's AI model, wrote the code and tests and set up the deployment, working step by step from the design document.

## License

[MIT](LICENSE). You are free to use, change and share the code, as long as the copyright notice stays with it.

ForceOut is an independent project. It is not affiliated with or endorsed by Codeforces. It only reads public data through the [official Codeforces API](https://codeforces.com/apiHelp) and never submits anything on your behalf.
