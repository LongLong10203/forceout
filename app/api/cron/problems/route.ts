import { timingSafeEqual } from "node:crypto";
import { syncProblemCache } from "@/lib/codeforces/problem-cache";

// The problemset download plus the upsert takes well over the default limit.
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends the secret as a bearer token.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily problem cache sync. Called by Vercel Cron (see vercel.json). */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const result = await syncProblemCache();
  const body = { ...result, tookMs: Date.now() - started };
  // Shows up in the host's logs, so a failed run can be diagnosed.
  if (result.ok) console.log("Problem cache sync finished", body);
  else console.error("Problem cache sync failed", body);

  // A failed Codeforces call is not an error on our side: the next run retries.
  return Response.json(body, { status: result.ok ? 200 : 503 });
}
