import { PaymentPlatformEnum, PurchaseStatusEnum } from "../prisma-types";

export interface PaymentDto {
  id: number;
  platform: PaymentPlatformEnum;
  status: PurchaseStatusEnum;
  transactionId: string;
  productId: string;
  promotionCode?: string | null;
  purchaseDate: Date;
  expiryDate: Date;
  isTrialPeriod: boolean;
  trialEndDate?: Date;
}

// CommonResponse<VerifyReceiptDataDto>의 data 필드
export interface VerifyReceiptDataDto {
  payment: PaymentDto;
}

// CommonResponse<RestorePurchaseDataDto>의 data 필드
export interface RestorePurchaseDataDto {
  payments?: PaymentDto[];
  errorCode?: string;
}

// CommonResponse<SubscriptionStatusDataDto>의 data 필드
export interface SubscriptionStatusDataDto {
  hasActiveSubscription: boolean;
  isInTrialPeriod: boolean;
  activePayment?: PaymentDto;
  expiryDate?: Date;
  daysRemaining?: number;
}

// CommonResponse<CancelSubscriptionDataDto>의 data 필드 (빈 객체, 메시지만 반환)
export interface CancelSubscriptionDataDto {}

// ========== 웹훅 응답 DTO ==========

// 웹훅 처리 결과 (빈 객체, 메시지만 반환)
export interface WebhookResultDataDto {}
