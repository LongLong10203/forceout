# ForceOut

Real-time duels on Codeforces problems. The full design is in [docs/OVERVIEW.md](docs/OVERVIEW.md).

## Run locally

You need Node.js, pnpm and Docker Desktop (running).

```bash
cp .env.example .env   # first time only
pnpm install
pnpm db:up             # start Postgres in Docker
pnpm db:migrate        # apply the schema
pnpm db:seed           # sample problems and two dev users
pnpm dev               # http://localhost:3000
```

Other commands:

| Command          | What it does                                                    |
| ---------------- | --------------------------------------------------------------- |
| `pnpm db:down`   | Stop Postgres (data is kept)                                    |
| `pnpm db:studio` | Browse the database                                             |
| `pnpm cf:sync`   | Run the daily problem cache sync now (needs `pnpm dev` running) |
| `pnpm cf:check`  | Try the Codeforces client against the real API                  |
| `pnpm test`      | Unit tests for the game mode rules                              |
| `pnpm lint`      | ESLint                                                          |
| `pnpm format`    | Prettier                                                        |
| `pnpm build`     | Production build                                                |

## Deploy to Vercel

1. Push this repository to GitHub and import it in Vercel (framework: Next.js).
2. In the Vercel project, open **Storage** and add a **Neon** Postgres database. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
3. Add these environment variables in **Settings → Environment Variables**:

   | Variable                                   | Value                                                        |
   | ------------------------------------------ | ------------------------------------------------------------ |
   | `BETTER_AUTH_SECRET`                       | A new secret: `openssl rand -base64 32`                      |
   | `BETTER_AUTH_URL`                          | Your site address, for example `https://forceout.vercel.app` |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From your Google OAuth client                                |
   | `CRON_SECRET`                              | A new secret: `openssl rand -hex 24`                         |

4. In Google Cloud Console, add `https://YOUR-SITE/api/auth/callback/google` to the OAuth client's redirect URIs and `https://YOUR-SITE` to its JavaScript origins.
5. Deploy. The build runs `prisma migrate deploy`, which creates the tables.
6. Fill the problem cache once (afterwards the daily cron does it):

   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-SITE/api/cron/problems
   ```

Do not run `pnpm db:seed` against the production database: it only adds fake development accounts. The "Alice (dev)" and "Bob (dev)" logins and the fake solve button exist only outside production.

## Build progress

Steps from the overview's "Build order":

- [x] 1. Scaffold
- [x] 2. Codeforces client (still to confirm: Codeforces answering requests from Vercel)
- [x] 3. Auth
- [x] 4. Handle verification
- [x] 5. Rooms and lobby
- [x] 6. Match engine with Classic
- [x] 7. Live polling
- [x] 8. Tic-Tac-Toe, Blitz, history and profile
