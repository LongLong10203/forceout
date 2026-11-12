// Fake accounts for local development, so one person can test a two-player
// match without two Google accounts. Created by `pnpm db:seed`.
// They only work when NODE_ENV is not "production": see lib/auth.ts.

export const DEV_PASSWORD = "forceout-dev-only";

export const DEV_ACCOUNTS = [
  {
    id: "dev-alice",
    name: "Alice (dev)",
    email: "alice@forceout.test",
    cfHandle: "dev_alice",
    cfRating: 1500,
  },
  {
    id: "dev-bob",
    name: "Bob (dev)",
    email: "bob@forceout.test",
    cfHandle: "dev_bob",
    cfRating: 1400,
  },
] as const;

export const devAccountsEnabled = process.env.NODE_ENV !== "production";
