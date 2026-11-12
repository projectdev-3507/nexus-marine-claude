-- Serbest başlıklı özel rapor türü
ALTER TYPE "ReportType" ADD VALUE 'CUSTOM';

-- Dinamik rapor / sözleşme başlıkları
CREATE TABLE "ReportCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'blue',
    "baseType" "ReportType" NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'reports',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Report" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Report_categoryId_idx" ON "Report"("categoryId");
ALTER TABLE "ReportTemplate" ADD COLUMN "categoryId" TEXT;
