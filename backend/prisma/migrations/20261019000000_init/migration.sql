-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."LanguageEnum" AS ENUM ('ko', 'en', 'ja', 'zh', 'es', 'de', 'fr', 'pt', 'ru', 'zh_Hant', 'it', 'ar', 'id', 'tr', 'vi', 'th', 'hi', 'nl', 'pl', 'sv');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('Normal', 'Admin');

-- CreateEnum
CREATE TYPE "public"."ProviderTypeEnum" AS ENUM ('local', 'google', 'facebook', 'apple', 'anonymous');

-- CreateEnum
CREATE TYPE "public"."PlatformEnum" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "public"."PurchaseStatusEnum" AS ENUM ('NONE', 'ACTIVE', 'GRACE_PERIOD', 'ACCOUNT_HOLD', 'PAUSED', 'EXPIRED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionTypeEnum" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."PaymentPlatformEnum" AS ENUM ('GOOGLE_PLAY', 'APPLE_APP_STORE');

-- CreateEnum
CREATE TYPE "public"."DeviceEnum" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "paymentUUID" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile_image" TEXT,
    "auth_provider" "public"."ProviderTypeEnum" NOT NULL,
    "refreshToken" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'Normal',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "whenDeleted" TIMESTAMP(3),
    "googleId" TEXT,
    "facebookId" TEXT,
    "appleId" TEXT,
    "initialPlatform" "public"."PlatformEnum" NOT NULL DEFAULT 'ANDROID',
    "alarmAllowed" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" "public"."LanguageEnum" NOT NULL DEFAULT 'en',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FcmToken" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "deviceType" "public"."DeviceEnum" NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FcmToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platform" "public"."PaymentPlatformEnum" NOT NULL,
    "status" "public"."PurchaseStatusEnum" NOT NULL DEFAULT 'NONE',
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseToken" TEXT,
    "promotionCode" TEXT,
    "receipt" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "isTrialPeriod" BOOLEAN NOT NULL DEFAULT false,
    "trialEndDate" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "refundReason" TEXT,
    "autoRenewStatus" BOOLEAN NOT NULL DEFAULT true,
    "autoRenewChangedAt" TIMESTAMP(3),
    "gracePeriodExpiryDate" TIMESTAMP(3),
    "resumeDate" TIMESTAMP(3),
    "userId" INTEGER,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentHistory" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" INTEGER NOT NULL,
    "userId" INTEGER,
    "platform" "public"."PaymentPlatformEnum" NOT NULL,
    "eventType" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "public"."PurchaseStatusEnum" NOT NULL,
    "promotionCode" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "autoRenewStatus" BOOLEAN NOT NULL DEFAULT true,
    "gracePeriodExpiryDate" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "refundReason" TEXT,
    "receiptData" TEXT,

    CONSTRAINT "PaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_paymentUUID_key" ON "public"."User"("paymentUUID");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FcmToken_fcmToken_key" ON "public"."FcmToken"("fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "public"."Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_originalTransactionId_key" ON "public"."Payment"("originalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_purchaseToken_key" ON "public"."Payment"("purchaseToken");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "public"."Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_expiryDate_idx" ON "public"."Payment"("expiryDate");

-- CreateIndex
CREATE INDEX "PaymentHistory_paymentId_idx" ON "public"."PaymentHistory"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentHistory_userId_idx" ON "public"."PaymentHistory"("userId");

-- CreateIndex
CREATE INDEX "PaymentHistory_transactionId_idx" ON "public"."PaymentHistory"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentHistory_createdAt_idx" ON "public"."PaymentHistory"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentHistory_platform_eventType_idx" ON "public"."PaymentHistory"("platform", "eventType");

-- CreateIndex
CREATE INDEX "PaymentHistory_eventType_idx" ON "public"."PaymentHistory"("eventType");

-- AddForeignKey
ALTER TABLE "public"."FcmToken" ADD CONSTRAINT "FcmToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentHistory" ADD CONSTRAINT "PaymentHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentHistory" ADD CONSTRAINT "PaymentHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
