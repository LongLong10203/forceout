// Shapes returned by the Codeforces API. Only the fields ForceOut uses.
// Reference: https://codeforces.com/apiHelp/objects

export type CfProblem = {
  contestId?: number;
  index: string;
  name: string;
  rating?: number;
  tags: string[];
};

export type CfUser = {
  handle: string;
  rating?: number;
  rank?: string;
  maxRating?: number;
  maxRank?: string;
};

export type CfVerdict =
  | "OK"
  | "COMPILATION_ERROR"
  | "TESTING"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | (string & {});

export type CfSubmission = {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: CfProblem;
  /** Missing while the submission is still in the queue. */
  verdict?: CfVerdict;
};

/** Why a call did not produce a result. None of these are fatal: try later. */
export type CfFailureReason =
  /** The shared rate-limit slot was taken, so no request was sent. */
  | "rate_limited"
  /** Codeforces answered with `status: FAILED` (for example unknown handle). */
  | "failed"
  /** Non-JSON or non-2xx answer (Cloudflare challenge, 5xx, ...). */
  | "http"
  | "timeout"
  | "network";

export type CfResult<T> =
  | { ok: true; result: T }
  | { ok: false; reason: CfFailureReason; message: string };
