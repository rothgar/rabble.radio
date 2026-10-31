-- AlterTable
ALTER TABLE "Space" ADD COLUMN "emptySince" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Space_emptySince_idx" ON "Space"("emptySince");
