import { PaymentPlatformEnum } from "../prisma-types";

export interface VerifyAppleReceiptReqDto {
  receiptData: string;
  productId: string;
  passWhenExpired?: boolean;
}

export interface VerifyGoogleReceiptReqDto {
  purchaseToken: string;
  productId: string;
  passWhenExpired?: boolean;
}

export interface RestorePurchaseReqDto {
  platform: PaymentPlatformEnum;
  receiptDataList: string[];
  purchaseTokens: string[];
}

export interface GetSubscriptionStatusReqDto {}

export interface CancelSubscriptionReqDto {
  paymentId: number;
}

export interface AppleWebhookReqDto {
  signedPayload: string;
}

export interface GoogleWebhookReqDto {
  subscription?: string;
  message: { data: string; messageId: string; publishTime: string };
}
