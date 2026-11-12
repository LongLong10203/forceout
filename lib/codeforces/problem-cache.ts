import { db } from "@/lib/db";
import { problemsetProblems } from "./client";
import type { CfFailureReason } from "./types";

export type ProblemSyncResult =
  | {
      ok: true;
      fetched: number;
      stored: number;
      skippedUnrated: number;
      total: number;
    }
  | { ok: false; reason: CfFailureReason; message: string };

export function problemUrl(contestId: number, index: string) {
  return `https://codeforces.com/problemset/problem/${contestId}/${index}`;
}

const CHUNK = 2000;

/**
 * Copy the Codeforces problemset into the `problems` table.
 * Problems with no rating are skipped. Existing rows are updated in place
 * (ratings and tags do change), and nothing is ever deleted, because old
 * matches point at these rows.
 */
export async function syncProblemCache(): Promise<ProblemSyncResult> {
  const response = await problemsetProblems({ onBusy: "wait" });
  if (!response.ok) return response;

  const all = response.result.problems;
  const rows = all
    .filter((p) => p.contestId !== undefined && p.rating !== undefined)
    .map((p) => ({
      id: `${p.contestId}${p.index}`,
      contest_id: p.contestId,
      index: p.index,
      name: p.name,
      rating: p.rating,
      tags: p.tags,
    }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = JSON.stringify(rows.slice(i, i + CHUNK));
    await db.$executeRaw`
      INSERT INTO problems (id, contest_id, index, name, rating, tags)
      SELECT x.id, x.contest_id, x.index, x.name, x.rating,
             ARRAY(SELECT jsonb_array_elements_text(x.tags))
      FROM jsonb_to_recordset(${chunk}::jsonb)
        AS x(id text, contest_id int, index text, name text, rating int, tags jsonb)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, rating = EXCLUDED.rating, tags = EXCLUDED.tags
        WHERE (problems.name, problems.rating, problems.tags)
          IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.rating, EXCLUDED.tags)`;
  }

  return {
    ok: true,
    fetched: all.length,
    stored: rows.length,
    skippedUnrated: all.length - rows.length,
    total: await db.problem.count(),
  };
}
