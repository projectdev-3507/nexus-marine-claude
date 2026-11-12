-- Finans ve tahsilat: sözleşme bedeli, ödeme durumu, tahsilat makbuzu
ALTER TABLE "Report" ADD COLUMN "contractAmount" DOUBLE PRECISION;
ALTER TABLE "Report" ADD COLUMN "contractCurrency" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "Report" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "paidBy" TEXT;

ALTER TABLE "Payment" ADD COLUMN "number" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reportId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "receivedBy" TEXT;
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");
CREATE INDEX "Payment_reportId_idx" ON "Payment"("reportId");
