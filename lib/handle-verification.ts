import "server-only";
import { z } from "zod";
import { userInfo, userStatus } from "@/lib/codeforces/client";
import type { CfFailureReason } from "@/lib/codeforces/types";
import { db } from "@/lib/db";

/** How long a player has to submit the Compilation Error. */
export const CHALLENGE_MINUTES = 5;

// Codeforces handles: 3 to 24 characters, Latin letters, digits, _ . and -
export const handleSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_.-]{3,24}$/,
    "That does not look like a Codeforces handle.",
  );

export type VerificationResult = { ok: true } | { ok: false; error: string };

function codeforcesDown(reason: CfFailureReason): VerificationResult {
  return {
    ok: false,
    error:
      reason === "rate_limited"
        ? "Codeforces checks are busy right now. Try again in a few seconds."
        : "Codeforces did not answer. Try again in a moment.",
  };
}

/** The player's current challenge, or null if there is none or it has expired. */
export function getActiveChallenge(userId: string) {
  return db.handleChallenge.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: { problem: true },
  });
}

/** Step 1 and 2: confirm the handle exists, then hand out a random problem. */
export async function startChallenge(
  userId: string,
  rawHandle: string,
): Promise<VerificationResult> {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.cfHandle) {
    return { ok: false, error: `You already linked ${user.cfHandle}.` };
  }

  const info = await userInfo(parsed.data, {
    onBusy: "wait",
    maxWaitMs: 10_000,
  });
  if (!info.ok) {
    if (info.reason === "failed") {
      return {
        ok: false,
        error: `Codeforces has no user called "${parsed.data}".`,
      };
    }
    return codeforcesDown(info.reason);
  }
  // Use the spelling Codeforces returns, so the unique check is reliable.
  const cfHandle = info.result.handle;

  const taken = await db.user.findFirst({
    where: { cfHandle: { equals: cfHandle, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) {
    return {
      ok: false,
      error: `${cfHandle} is already linked to another account.`,
    };
  }

  // Any problem works, since the player only has to fail to compile.
  const count = await db.problem.count();
  if (count === 0) {
    return {
      ok: false,
      error: "The problem cache is empty. Run the problem sync first.",
    };
  }
  const problem = await db.problem.findFirstOrThrow({
    orderBy: { id: "asc" },
    skip: Math.floor(Math.random() * count),
  });

  await db.$transaction([
    db.handleChallenge.deleteMany({ where: { userId } }),
    db.handleChallenge.create({
      data: {
        userId,
        cfHandle,
        problemId: problem.id,
        expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
      },
    }),
  ]);
  return { ok: true };
}

/** Step 3 and 4: look for the Compilation Error, then link the handle for good. */
export async function checkChallenge(
  userId: string,
): Promise<VerificationResult> {
  const challenge = await getActiveChallenge(userId);
  if (!challenge) {
    return { ok: false, error: "The challenge expired. Start again." };
  }

  const recent = await userStatus(
    challenge.cfHandle,
    { count: 10 },
    { onBusy: "wait", maxWaitMs: 10_000 },
  );
  if (!recent.ok) {
    if (recent.reason === "failed") {
      return { ok: false, error: `Codeforces said: ${recent.message}` };
    }
    return codeforcesDown(recent.reason);
  }

  // Codeforces times are whole seconds, so compare at that precision.
  const startedAt = Math.floor(challenge.createdAt.getTime() / 1000);
  const expiresAt = Math.floor(challenge.expiresAt.getTime() / 1000);
  const onProblem = recent.result.filter(
    (s) =>
      s.problem.contestId === challenge.problem.contestId &&
      s.problem.index === challenge.problem.index &&
      s.creationTimeSeconds >= startedAt &&
      s.creationTimeSeconds <= expiresAt,
  );

  if (!onProblem.some((s) => s.verdict === "COMPILATION_ERROR")) {
    if (onProblem.some((s) => !s.verdict || s.verdict === "TESTING")) {
      return {
        ok: false,
        error:
          "Your submission is still being judged. Check again in a few seconds.",
      };
    }
    if (onProblem.length > 0) {
      return {
        ok: false,
        error:
          "We found your submission, but it compiled. Submit something that gives a Compilation Error.",
      };
    }
    return {
      ok: false,
      error: `No submission by ${challenge.cfHandle} on this problem yet. Submit, wait for the verdict, then check again.`,
    };
  }

  try {
    await db.$transaction(async (tx) => {
      // Only link if this account still has no handle. The unique index on
      // cf_handle rejects a handle that another account linked meanwhile.
      const linked = await tx.user.updateMany({
        where: { id: userId, cfHandle: null },
        data: { cfHandle: challenge.cfHandle, cfVerifiedAt: new Date() },
      });
      if (linked.count !== 1) throw new Error("Account already has a handle");
      await tx.handleChallenge.deleteMany({ where: { userId } });
    });
  } catch {
    return {
      ok: false,
      error: `${challenge.cfHandle} could not be linked. It may already belong to another account.`,
    };
  }

  // Rating for the profile. Not essential: the daily refresh fills it in later.
  const info = await userInfo(challenge.cfHandle, {
    onBusy: "wait",
    maxWaitMs: 5_000,
  });
  if (info.ok) {
    await db.user.update({
      where: { id: userId },
      data: { cfRating: info.result.rating ?? null },
    });
  }
  return { ok: true };
}

export async function cancelChallenge(userId: string) {
  await db.handleChallenge.deleteMany({ where: { userId } });
}
