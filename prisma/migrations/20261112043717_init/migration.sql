-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('lobby', 'live', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "PlayerOutcome" AS ENUM ('win', 'loss', 'draw', 'forfeit');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cf_handle" TEXT,
    "cf_rating" INTEGER,
    "cf_verified_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handle_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cf_handle" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "handle_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "contest_id" INTEGER NOT NULL,
    "index" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'lobby',
    "state" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "result" JSONB,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "match_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "outcome" "PlayerOutcome",
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMPTZ(3),

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("match_id","user_id")
);

-- CreateTable
CREATE TABLE "match_problems" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "problem_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMPTZ(3),
    "cf_submission_id" BIGINT,
    "revealed_at" TIMESTAMPTZ(3),

    CONSTRAINT "match_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cf_rate_limit" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "next_allowed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cf_rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cf_handle_key" ON "users"("cf_handle");

-- CreateIndex
CREATE INDEX "handle_challenges_user_id_idx" ON "handle_challenges"("user_id");

-- CreateIndex
CREATE INDEX "problems_rating_idx" ON "problems"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "problems_contest_id_index_key" ON "problems"("contest_id", "index");

-- CreateIndex
CREATE UNIQUE INDEX "matches_code_key" ON "matches"("code");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "match_players_user_id_idx" ON "match_players"("user_id");

-- CreateIndex
CREATE INDEX "match_players_last_checked_at_idx" ON "match_players"("last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_match_id_seat_key" ON "match_players"("match_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "match_problems_match_id_slot_key" ON "match_problems"("match_id", "slot");

-- AddForeignKey
ALTER TABLE "handle_challenges" ADD CONSTRAINT "handle_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handle_challenges" ADD CONSTRAINT "handle_challenges_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_problems" ADD CONSTRAINT "match_problems_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_problems" ADD CONSTRAINT "match_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_problems" ADD CONSTRAINT "match_problems_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
