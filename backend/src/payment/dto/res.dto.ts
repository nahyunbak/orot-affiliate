import { ApiProperty } from '@nestjs/swagger';
import { PaymentPlatformEnum, PurchaseStatusEnum } from '@prisma/client';

export class PaymentDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: PaymentPlatformEnum.APPLE_APP_STORE })
  platform: PaymentPlatformEnum;

  @ApiProperty({ example: PurchaseStatusEnum.ACTIVE })
  status: PurchaseStatusEnum;

  @ApiProperty({ example: '1000000123456789' })
  transactionId: string;

  @ApiProperty({ example: 'configured.subscription.monthly' })
  productId: string;

  @ApiProperty({
    example: 'WELCOME2026',
    required: false,
    description:
      'Google Play vanity promo code. One-time promo codes do not expose the code string.',
  })
  promotionCode?: string | null;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  purchaseDate: Date;

  @ApiProperty({ example: '2025-02-01T00:00:00.000Z' })
  expiryDate: Date;

  @ApiProperty({ example: true })
  isTrialPeriod: boolean;

  @ApiProperty({ example: '2025-01-08T00:00:00.000Z', required: false })
  trialEndDate?: Date;
}

// CommonResponse<VerifyReceiptDataDto>의 data 필드
export class VerifyReceiptDataDto {
  @ApiProperty({ type: PaymentDto })
  payment: PaymentDto;
}

// CommonResponse<RestorePurchaseDataDto>의 data 필드
export class RestorePurchaseDataDto {
  @ApiProperty({ type: [PaymentDto], required: false })
  payments?: PaymentDto[];

  @ApiProperty({
    example: 'NO_PURCHASE',
    description: '복원 실패 사유 코드',
    required: false,
    enum: ['NO_PURCHASE', 'EXPIRED'],
  })
  errorCode?: string;
}

// CommonResponse<SubscriptionStatusDataDto>의 data 필드
export class SubscriptionStatusDataDto {
  @ApiProperty({ example: true })
  hasActiveSubscription: boolean;

  @ApiProperty({ example: false })
  isInTrialPeriod: boolean;

  @ApiProperty({ type: PaymentDto, required: false })
  activePayment?: PaymentDto;

  @ApiProperty({ example: '2025-02-01T00:00:00.000Z', required: false })
  expiryDate?: Date;

  @ApiProperty({ example: 15, description: '남은 일수', required: false })
  daysRemaining?: number;
}

// CommonResponse<CancelSubscriptionDataDto>의 data 필드 (빈 객체, 메시지만 반환)
export class CancelSubscriptionDataDto {}

// ========== 웹훅 응답 DTO ==========

// 웹훅 처리 결과 (빈 객체, 메시지만 반환)
export class WebhookResultDataDto {}
