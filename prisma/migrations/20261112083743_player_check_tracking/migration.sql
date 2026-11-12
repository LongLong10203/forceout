-- AlterTable
ALTER TABLE "match_players" ADD COLUMN     "check_requested_at" TIMESTAMPTZ(3),
ADD COLUMN     "checked_through" TIMESTAMPTZ(3);
