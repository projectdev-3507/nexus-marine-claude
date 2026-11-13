-- Periyodik bakım bitiş tarihi
ALTER TABLE "MaintenancePlan" ADD COLUMN "repeatUntil" TIMESTAMP(3);
