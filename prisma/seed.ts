// Seed data for local development. Safe to run more than once.
//   pnpm db:seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../lib/dev-accounts";
import { PrismaClient } from "../lib/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// A few real Codeforces problems so pages have something to show before the
// daily problem cache sync exists (build step 2 replaces this with the full set).
const problems = [
  {
    contestId: 4,
    index: "A",
    name: "Watermelon",
    rating: 800,
    tags: ["brute force", "math"],
  },
  {
    contestId: 71,
    index: "A",
    name: "Way Too Long Words",
    rating: 800,
    tags: ["strings"],
  },
  {
    contestId: 231,
    index: "A",
    name: "Team",
    rating: 800,
    tags: ["brute force", "greedy"],
  },
  {
    contestId: 1,
    index: "A",
    name: "Theatre Square",
    rating: 1000,
    tags: ["math"],
  },
  {
    contestId: 158,
    index: "B",
    name: "Taxi",
    rating: 1100,
    tags: ["greedy", "implementation"],
  },
  {
    contestId: 189,
    index: "A",
    name: "Cut Ribbon",
    rating: 1300,
    tags: ["brute force", "dp"],
  },
  {
    contestId: 230,
    index: "B",
    name: "T-primes",
    rating: 1300,
    tags: ["binary search", "math", "number theory"],
  },
  {
    contestId: 4,
    index: "C",
    name: "Registration System",
    rating: 1300,
    tags: ["data structures", "hashing"],
  },
  {
    contestId: 276,
    index: "C",
    name: "Little Girl and Maximum Sum",
    rating: 1500,
    tags: ["greedy", "sortings"],
  },
  {
    contestId: 20,
    index: "C",
    name: "Dijkstra?",
    rating: 1900,
    tags: ["graphs", "shortest paths"],
  },
];

async function main() {
  await db.cfRateLimit.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  for (const p of problems) {
    const id = `${p.contestId}${p.index}`;
    await db.problem.upsert({
      where: { id },
      update: { name: p.name, rating: p.rating, tags: p.tags },
      create: { id, ...p },
    });
  }

  // Fake accounts for testing two-player matches locally. Each gets a
  // password login that only works outside production.
  const password = await hashPassword(DEV_PASSWORD);
  for (const u of DEV_ACCOUNTS) {
    await db.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, emailVerified: true, cfVerifiedAt: new Date() },
    });
    await db.account.upsert({
      where: { id: `${u.id}-credential` },
      update: { password },
      create: {
        id: `${u.id}-credential`,
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password,
      },
    });
  }

  const [problemCount, userCount] = await Promise.all([
    db.problem.count(),
    db.user.count(),
  ]);
  console.log(
    `Seeded: ${problemCount} problems, ${userCount} users, rate-limit row ready.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
