-- Bakım görevleri: adımlar (checklist), tamamlama, yorumlar; iş emirleri bakıma ek iş olarak bağlanır
-- AlterTable
ALTER TABLE "MaintCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MaintenancePlan" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedBy" TEXT,
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "completionNote" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "parentPlanId" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceComment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceComment_planId_idx" ON "MaintenanceComment"("planId");

-- CreateIndex
CREATE INDEX "WorkOrder_parentPlanId_idx" ON "WorkOrder"("parentPlanId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceComment" ADD CONSTRAINT "MaintenanceComment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

