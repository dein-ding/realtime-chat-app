-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('feature_request', 'bug_report');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
