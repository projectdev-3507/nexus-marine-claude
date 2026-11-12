-- Haftalık bakım ve servis raporu
ALTER TYPE "ReportType" ADD VALUE 'WEEKLY_SERVICE';

-- Denetimi yapan kaptan / enspektör adı (düzenlenebilir)
ALTER TABLE "Inspection" ADD COLUMN "inspectorName" TEXT;

-- Otomatik dönem raporları
ALTER TABLE "Report" ADD COLUMN "periodKey" TEXT;
CREATE INDEX "Report_vesselId_periodKey_idx" ON "Report"("vesselId", "periodKey");

-- Standart rapor şablonları
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "description" TEXT,
    "data" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportTemplate_type_idx" ON "ReportTemplate"("type");
