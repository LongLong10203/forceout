import { timingSafeEqual } from "node:crypto";
import { syncProblemCache } from "@/lib/codeforces/problem-cache";
import { cleanUp, refreshRatings } from "@/lib/maintenance";

export const maxDuration = 60;
/** Leave time to answer before the platform cuts the request off. */
const BUDGET_MS = 45_000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends the secret as a bearer token.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** One step of the job. A failure in one step must not stop the others. */
async function step<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    console.error("Daily job step failed", error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The daily job, called by Vercel Cron (see vercel.json):
 * 1. sync the problem cache from Codeforces;
 * 2. refresh every player's Codeforces rating;
 * 3. clear abandoned rooms and expired records.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const problems = await step(syncProblemCache);
  const ratings = await step(() => refreshRatings(deadline));
  const cleanup = await step(() => cleanUp(deadline));
  const body = { problems, ratings, cleanup, tookMs: Date.now() - started };

  // Shows up in the host's logs, so a run can be checked afterwards.
  const ok =
    "ok" in problems &&
    problems.ok &&
    !("error" in ratings) &&
    !("error" in cleanup);
  if (ok) console.log("Daily job finished", JSON.stringify(body));
  else console.error("Daily job had failures", JSON.stringify(body));

  // A failed Codeforces call is not an error on our side: the next run retries.
  return Response.json(body, { status: ok ? 200 : 503 });
}
