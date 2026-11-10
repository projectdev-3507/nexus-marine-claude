-- Yeni rapor türü: Proje Teklif Dosyası
ALTER TYPE "ReportType" ADD VALUE 'PROJECT_PROPOSAL';

-- Denetim matrisi: başlık bilgileri, Bölüm 17-19
ALTER TABLE "Inspection" ADD COLUMN "location" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "pier" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "operationalStatus" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "findings" JSONB;
ALTER TABLE "Inspection" ADD COLUMN "pumpOutDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Inspection" ADD COLUMN "inspectorTitle" TEXT;
ALTER TABLE "InspectionItem" ADD COLUMN "description" TEXT;
ALTER TABLE "InspectionItem" ADD COLUMN "previousMeasurement" TEXT;

-- Müşteri onayı (sözleşme / protokol / teklif dosyası)
ALTER TABLE "Report" ADD COLUMN "approvalStatus" TEXT;
ALTER TABLE "Report" ADD COLUMN "approvalRequestedAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "approvalDecidedAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "approvalDecidedById" TEXT;
ALTER TABLE "Report" ADD COLUMN "approvalDecidedBy" TEXT;
ALTER TABLE "Report" ADD COLUMN "approvalNote" TEXT;
