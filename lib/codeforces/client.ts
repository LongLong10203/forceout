// The only place in ForceOut that talks to the Codeforces API.
// Every call goes through the shared rate limit in ./rate-limit.

import { tryClaimSlot, waitForSlot } from "./rate-limit";
import type { CfProblem, CfResult, CfSubmission, CfUser } from "./types";

const API_BASE = "https://codeforces.com/api";
const DEFAULT_TIMEOUT_MS = 15_000;

export type CfCallOptions = {
  /**
   * What to do when the rate-limit slot is taken.
   * - "skip" (default): do not call, return `rate_limited`. Used by routine polling.
   * - "wait": queue for the next slot. Used when the answer is needed now
   *   (handle verification, fair-claim checks, the cron sync).
   */
  onBusy?: "skip" | "wait";
  /** Longest time to queue for a slot when `onBusy` is "wait". */
  maxWaitMs?: number;
  timeoutMs?: number;
};

type Params = Record<string, string | number | undefined>;

async function call<T>(
  method: string,
  params: Params,
  options: CfCallOptions = {},
): Promise<CfResult<T>> {
  const {
    onBusy = "skip",
    maxWaitMs = 20_000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const gotSlot =
    onBusy === "wait" ? await waitForSlot(maxWaitMs) : await tryClaimSlot();
  if (!gotSlot) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "Rate-limit slot is taken",
    };
  }

  const url = new URL(`${API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ForceOut" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      reason: timedOut ? "timeout" : "network",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // Codeforces sends JSON even for most errors (HTTP 400 with status FAILED).
  // Anything that is not JSON is a Cloudflare page or a gateway error.
  let body: { status?: string; result?: T; comment?: string };
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      reason: "http",
      message: `HTTP ${response.status}, body was not JSON`,
    };
  }

  if (body.status === "OK" && body.result !== undefined) {
    return { ok: true, result: body.result };
  }
  if (body.status === "FAILED") {
    return { ok: false, reason: "failed", message: body.comment ?? "FAILED" };
  }
  return { ok: false, reason: "http", message: `HTTP ${response.status}` };
}

/** All problems in the problemset. A large response (about 2 MB). */
export function problemsetProblems(options?: CfCallOptions) {
  return call<{ problems: CfProblem[] }>(
    "problemset.problems",
    {},
    { timeoutMs: 45_000, ...options },
  );
}

/** Profile data for one handle. Fails with `failed` when the handle does not exist. */
export async function userInfo(
  handle: string,
  options?: CfCallOptions,
): Promise<CfResult<CfUser>> {
  const result = await call<CfUser[]>(
    "user.info",
    { handles: handle },
    options,
  );
  if (!result.ok) return result;
  const user = result.result[0];
  if (!user)
    return { ok: false, reason: "failed", message: "Handle not found" };
  return { ok: true, result: user };
}

/**
 * A user's submissions, newest first.
 * Pass `count` for the recent ones only; omit it for the full history.
 */
export function userStatus(
  handle: string,
  range: { from?: number; count?: number } = {},
  options?: CfCallOptions,
) {
  const from = range.count !== undefined ? (range.from ?? 1) : range.from;
  return call<CfSubmission[]>(
    "user.status",
    { handle, from, count: range.count },
    {
      timeoutMs: range.count === undefined ? 45_000 : DEFAULT_TIMEOUT_MS,
      ...options,
    },
  );
}

/**
 * IDs ("1520C") of every problem a user has solved. Reads the full
 * submission history, so it is slow for very active users.
 */
export async function solvedProblemIds(
  handle: string,
  options?: CfCallOptions,
): Promise<CfResult<string[]>> {
  const result = await userStatus(handle, {}, options);
  if (!result.ok) return result;
  const solved = new Set<string>();
  for (const submission of result.result) {
    if (
      submission.verdict === "OK" &&
      submission.problem.contestId !== undefined
    ) {
      solved.add(`${submission.problem.contestId}${submission.problem.index}`);
    }
  }
  return { ok: true, result: [...solved] };
}
