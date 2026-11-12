import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { devAccountsEnabled } from "@/lib/dev-accounts";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  // Password sign-in exists only for the seeded fake accounts in local
  // development (lib/dev-accounts.ts). It is off in production, and nobody
  // can sign up with a password anywhere.
  emailAndPassword: { enabled: devAccountsEnabled, disableSignUp: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    // The Codeforces fields on the users table. `input: false` means a client
    // can never set them: only the handle verification flow writes them.
    additionalFields: {
      cfHandle: { type: "string", required: false, input: false },
      cfRating: { type: "number", required: false, input: false },
      cfVerifiedAt: { type: "date", required: false, input: false },
    },
  },
  // Must be last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
