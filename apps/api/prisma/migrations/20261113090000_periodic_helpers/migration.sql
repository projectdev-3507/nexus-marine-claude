-- Periyodik bakım (haftanın günleri / ayın günü), ek teknisyenler, müşteri bakım talebi
ALTER TABLE "MaintenancePlan" ADD COLUMN "repeatWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "MaintenancePlan" ADD COLUMN "repeatMonthDay" INTEGER;
ALTER TABLE "MaintenancePlan" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "MaintenancePlan" ADD COLUMN "helperIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MaintenancePlan" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "MaintenancePlan" ADD COLUMN "requestedById" TEXT;
CREATE INDEX "MaintenancePlan_seriesId_idx" ON "MaintenancePlan"("seriesId");
ALTER TABLE "WorkOrder" ADD COLUMN "helperIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
