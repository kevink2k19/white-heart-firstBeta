/*
  Warnings:

  - You are about to drop the column `pushToken` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[roomId,userId]` on the table `VoiceParticipant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[conversationId]` on the table `VoiceRoom` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."VoiceParticipant_roomId_userId_idx";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "pushToken";

-- AlterTable
ALTER TABLE "public"."VoiceParticipant" ADD COLUMN     "isListening" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "public"."VoiceTransmission" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "durationS" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VoiceTransmissionPlayback" (
    "id" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceTransmissionPlayback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceTransmission_roomId_createdAt_idx" ON "public"."VoiceTransmission"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceTransmission_senderId_createdAt_idx" ON "public"."VoiceTransmission"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceTransmissionPlayback_userId_playedAt_idx" ON "public"."VoiceTransmissionPlayback"("userId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTransmissionPlayback_transmissionId_userId_key" ON "public"."VoiceTransmissionPlayback"("transmissionId", "userId");

-- CreateIndex
CREATE INDEX "VoiceParticipant_roomId_userId_isListening_idx" ON "public"."VoiceParticipant"("roomId", "userId", "isListening");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceParticipant_roomId_userId_key" ON "public"."VoiceParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "VoiceRoom_conversationId_isLive_idx" ON "public"."VoiceRoom"("conversationId", "isLive");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceRoom_conversationId_key" ON "public"."VoiceRoom"("conversationId");

-- AddForeignKey
ALTER TABLE "public"."VoiceTransmission" ADD CONSTRAINT "VoiceTransmission_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoiceTransmission" ADD CONSTRAINT "VoiceTransmission_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoiceTransmissionPlayback" ADD CONSTRAINT "VoiceTransmissionPlayback_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "public"."VoiceTransmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoiceTransmissionPlayback" ADD CONSTRAINT "VoiceTransmissionPlayback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
