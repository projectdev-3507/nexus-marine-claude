-- CreateTable
CREATE TABLE "FaultComment" (
    "id" TEXT NOT NULL,
    "faultId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaultComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaultComment_faultId_idx" ON "FaultComment"("faultId");

-- AddForeignKey
ALTER TABLE "FaultComment" ADD CONSTRAINT "FaultComment_faultId_fkey" FOREIGN KEY ("faultId") REFERENCES "Fault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

