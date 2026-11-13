-- AlterTable
ALTER TABLE "cf_rate_limit" ADD COLUMN     "recent_oldest_at" TIMESTAMPTZ(3),
ADD COLUMN     "recent_polled_at" TIMESTAMPTZ(3);
