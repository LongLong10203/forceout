-- The Codeforces rate limit lives in a single row (id = 1). Every Codeforces
-- call claims it with an UPDATE, so the row has to exist. Without it, every
-- call is skipped as "rate limited". Local databases got the row from the
-- seed script; this makes sure every database has it.
INSERT INTO "cf_rate_limit" ("id", "next_allowed_at")
VALUES (1, now())
ON CONFLICT ("id") DO NOTHING;
