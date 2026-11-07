import { ApiProperty } from '@nestjs/swagger';
import { PaymentPlatformEnum } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class VerifyAppleReceiptReqDto {
  @ApiProperty({
    required: true,
    example: 'ewoJInNpZ25hdHVyZSIgPSAiQXBwbGVJbmNSZWNlaXB0...',
    description: 'Apple 영수증 데이터 (Base64 인코딩)',
  })
  @IsString({ message: '영수증 데이터는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '영수증 데이터는 필수 입력 항목입니다.' })
  receiptData: string;

  @ApiProperty({
    required: true,
    example: 'configured.subscription.monthly',
    description: '상품 ID',
  })
  @IsString({ message: '상품 ID는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '상품 ID는 필수 입력 항목입니다.' })
  productId: string;

  @ApiProperty({
    required: false,
    example: false,
    description: '만료된 구독도 허용할지 여부 (복원 시 true)',
  })
  @IsBoolean({ message: 'passWhenExpired는 boolean이어야 합니다.' })
  @IsOptional()
  passWhenExpired?: boolean;
}

export class VerifyGoogleReceiptReqDto {
  @ApiProperty({
    required: true,
    example: 'GPA.1234-5678-9012-34567',
    description: 'Google Play 구매 토큰',
  })
  @IsString({ message: '구매 토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '구매 토큰은 필수 입력 항목입니다.' })
  purchaseToken: string;

  @ApiProperty({
    required: true,
    example: 'configured.subscription.monthly',
    description: '상품 ID',
  })
  @IsString({ message: '상품 ID는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '상품 ID는 필수 입력 항목입니다.' })
  productId: string;

  @ApiProperty({
    required: false,
    example: false,
    description: '만료된 구독도 허용할지 여부 (복원 시 true)',
  })
  @IsBoolean({ message: 'passWhenExpired는 boolean이어야 합니다.' })
  @IsOptional()
  passWhenExpired?: boolean;
}

export class RestorePurchaseReqDto {
  @ApiProperty({
    required: true,
    example: PaymentPlatformEnum.APPLE_APP_STORE,
    enum: PaymentPlatformEnum,
    description: '결제 플랫폼',
  })
  @IsEnum(PaymentPlatformEnum, {
    message: '유효한 결제 플랫폼을 선택해주세요.',
  })
  @IsNotEmpty({ message: '결제 플랫폼은 필수 입력 항목입니다.' })
  platform: PaymentPlatformEnum;

  @ApiProperty({
    required: true,
    example: ['ewoJInNpZ25hdHVyZSIgPSAiQXBwbGVJbmNSZWNlaXB0...'],
    description:
      'Apple 영수증 데이터 배열 (Apple: 데이터 포함, Google: 빈 배열)',
    type: [String],
  })
  @IsArray({ message: '영수증 데이터는 배열이어야 합니다.' })
  @IsString({
    each: true,
    message: '영수증 데이터는 문자열 배열이어야 합니다.',
  })
  receiptDataList: string[];

  @ApiProperty({
    required: true,
    example: ['GPA.1234-5678-9012-34567'],
    description:
      'Google Play 구매 토큰 배열 (Google: 데이터 포함, Apple: 빈 배열)',
    type: [String],
  })
  @IsArray({ message: '구매 토큰은 배열이어야 합니다.' })
  @IsString({ each: true, message: '구매 토큰은 문자열 배열이어야 합니다.' })
  purchaseTokens: string[];
}

export class GetSubscriptionStatusReqDto {
  // Query params are handled by controller
}

export class CancelSubscriptionReqDto {
  @ApiProperty({
    required: true,
    example: 1,
    description: '취소할 구독의 결제 ID',
  })
  @IsNotEmpty({ message: '결제 ID는 필수 입력 항목입니다.' })
  paymentId: number;
}

/**
 * Apple App Store Server Notifications V2 웹훅 요청
 * @see https://developer.apple.com/documentation/appstoreservernotifications
 */
export class AppleWebhookReqDto {
  @ApiProperty({
    required: true,
    description: 'Apple JWS 서명된 페이로드',
  })
  @IsString()
  @IsNotEmpty()
  signedPayload: string;
}

/**
 * Google Play Real-time Developer Notifications 웹훅 요청. message의 data는 Base64 인코딩된 SubscriptionNotification
 * @see https://developer.android.com/google/play/billing/rtdn-reference
 */
export class GoogleWebhookReqDto {
  @ApiProperty({
    required: false,
    description: 'Google Pub/Sub 구독 ID',
  })
  @IsOptional()
  subscription?: string;

  @ApiProperty({
    required: true,
    description: 'Google Pub/Sub 메시지',
  })
  @IsNotEmpty()
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
}
