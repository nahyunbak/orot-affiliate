-- CreateTable
CREATE TABLE "public"."TestWallet" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateCampaign" (
    "id" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "contractAddress" TEXT,
    "deploymentTx" TEXT,
    "policyTx" TEXT,
    "fundingTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "approvalTx" TEXT,
    "payoutTx" TEXT,
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChainOperation" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "signedTx" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestWallet_userId_key" ON "public"."TestWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TestWallet_address_key" ON "public"."TestWallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignParticipant_campaignId_walletId_key" ON "public"."CampaignParticipant"("campaignId", "walletId");

-- CreateIndex
CREATE UNIQUE INDEX "ChainOperation_operationKey_key" ON "public"."ChainOperation"("operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChainOperation_txHash_key" ON "public"."ChainOperation"("txHash");

-- AddForeignKey
ALTER TABLE "public"."TestWallet" ADD CONSTRAINT "TestWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."AffiliateCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."TestWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
