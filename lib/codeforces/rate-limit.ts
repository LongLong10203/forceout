import { db } from "@/lib/db";

/** Codeforces allows one request every two seconds. */
export const CF_INTERVAL_MS = 2000;

/**
 * Try to take the shared rate-limit slot right now.
 *
 * One atomic UPDATE on the single `cf_rate_limit` row, so it holds across
 * every serverless instance. Returns false when the slot is not free; the
 * caller must then skip its Codeforces call.
 */
export async function tryClaimSlot(): Promise<boolean> {
  const claimed = await db.$executeRaw`
    UPDATE cf_rate_limit
    SET next_allowed_at = now() + make_interval(secs => ${CF_INTERVAL_MS / 1000})
    WHERE id = 1 AND next_allowed_at <= now()`;
  return claimed === 1;
}

/**
 * Reserve the next free slot and wait until it arrives.
 *
 * Each caller atomically pushes `next_allowed_at` forward by one interval and
 * gets the slot just before it, so concurrent waiters queue up in order.
 * Returns false (without reserving anything) when the wait would be longer
 * than `maxWaitMs`.
 */
export async function waitForSlot(maxWaitMs: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ wait_ms: number }[]>`
    UPDATE cf_rate_limit
    SET next_allowed_at =
      GREATEST(next_allowed_at, now()) + make_interval(secs => ${CF_INTERVAL_MS / 1000})
    WHERE id = 1
      AND next_allowed_at <= now() + make_interval(secs => ${maxWaitMs / 1000})
    RETURNING GREATEST(
      0,
      EXTRACT(EPOCH FROM (
        next_allowed_at - make_interval(secs => ${CF_INTERVAL_MS / 1000}) - now()
      )) * 1000
    )::float8 AS wait_ms`;

  if (rows.length === 0) return false;
  const waitMs = Math.ceil(rows[0].wait_ms);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  return true;
}
