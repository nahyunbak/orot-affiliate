import { SignedDataVerifier } from '@apple/app-store-server-library';
import { createAppleVerifier } from './apple-verifier';
import { GoogleAuth } from 'google-auth-library';
import { Payload } from '@/auth/utils/types';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Payment,
  PaymentPlatformEnum,
  Prisma,
  PurchaseStatusEnum,
} from '@prisma/client';

import { envVariableKeys } from '@/common/constants/env';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { SUCCESS_MESSAGE } from '@/common/constants/successMessage';
import { CommonResponse } from '@/common/dto/res.dto';
import {
  generateErrorResponse,
  generateSuccessResponse,
} from '@/common/helper/format';
import { MIXPANEL_SERVER_EVENTS } from '@/mixpanel/constants';
import type {
  MixpanelPaymentProperties,
  MixpanelServerEventName,
} from '@/mixpanel/utils/types';
import { MixpanelService } from '@/mixpanel/mixpanel.service';
import axios from 'axios';
import { existsSync } from 'fs';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppleWebhookReqDto,
  CancelSubscriptionReqDto,
  GoogleWebhookReqDto,
  RestorePurchaseReqDto,
  VerifyAppleReceiptReqDto,
  VerifyGoogleReceiptReqDto,
} from './dto/req.dto';
import {
  CancelSubscriptionDataDto,
  PaymentDto,
  RestorePurchaseDataDto,
  SubscriptionStatusDataDto,
  VerifyReceiptDataDto,
  WebhookResultDataDto,
} from './dto/res.dto';

// Apple 영수증 검증 응답 타입 (구식 - 하위 호환용)
interface AppleReceiptResponse {
  status: number;
  latest_receipt_info?: Array<{
    transaction_id: string;
    original_transaction_id: string;
    product_id: string;
    purchase_date_ms: string;
    expires_date_ms: string;
    is_trial_period: string;
    cancellation_date_ms?: string;
  }>;
  pending_renewal_info?: Array<{
    auto_renew_status: string;
    expiration_intent?: string;
  }>;
}

// Google 영수증 검증 응답 타입 (V2 API)
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
enum GoogleSubscriptionState {
  SUBSCRIPTION_STATE_UNSPECIFIED = 'SUBSCRIPTION_STATE_UNSPECIFIED', // ✅ 처리됨: default로 진행
  SUBSCRIPTION_STATE_PENDING = 'SUBSCRIPTION_STATE_PENDING', // ✅ 처리됨: 결제 미완료 에러
  SUBSCRIPTION_STATE_ACTIVE = 'SUBSCRIPTION_STATE_ACTIVE', // ✅ 처리됨: 정상 진행
  SUBSCRIPTION_STATE_PAUSED = 'SUBSCRIPTION_STATE_PAUSED', // ✅ 처리됨: resumeDate 설정
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', // ✅ 처리됨: gracePeriodExpiryDate 설정
  SUBSCRIPTION_STATE_ON_HOLD = 'SUBSCRIPTION_STATE_ON_HOLD', // ✅ 처리됨: 정상 진행
  SUBSCRIPTION_STATE_CANCELED = 'SUBSCRIPTION_STATE_CANCELED', // ✅ 처리됨: 정상 진행
  SUBSCRIPTION_STATE_EXPIRED = 'SUBSCRIPTION_STATE_EXPIRED', // ✅ 처리됨: 만료 에러
}

// 구매 확인 상태 (3일 내 acknowledge 안하면 자동 환불) - 현재 미사용 (클라이언트 finalize와 매핑)
enum GoogleAcknowledgementState {
  ACKNOWLEDGEMENT_STATE_UNSPECIFIED = 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED',
  ACKNOWLEDGEMENT_STATE_PENDING = 'ACKNOWLEDGEMENT_STATE_PENDING',
  ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
}

interface GoogleSubscriptionOfferDetails {
  basePlanId: string;
  offerId?: string;
  offerTags?: string[];
}

interface GoogleSignupPromotion {
  oneTimeCode?: object;
  vanityCode?: {
    promotionCode?: string;
  };
}

interface GoogleAutoRenewingPlan {
  autoRenewEnabled: boolean;
  recurringPrice?: {
    units?: string;
    nanos?: number;
    currencyCode: string;
  };
}

interface GooglePrepaidPlan {
  allowExtendAfterTime?: string;
}

interface GoogleLineItem {
  productId: string;
  expiryTime: string; // RFC 3339 timestamp
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: GoogleAutoRenewingPlan;
  prepaidPlan?: GooglePrepaidPlan;
  offerDetails: GoogleSubscriptionOfferDetails;
  signupPromotion?: GoogleSignupPromotion;
}

// 구매 시 클라이언트에서 전달한 사용자 식별 정보 (계정 공유/영수증 도용 방지용) - 현재 미사용
interface GoogleExternalAccountIdentifiers {
  externalAccountId?: string; // 개발자가 설정한 사용자 계정 ID (예: userId)
  obfuscatedExternalAccountId?: string; // 난독화된 계정 ID
  obfuscatedExternalProfileId?: string; // 난독화된 프로필 ID
}

interface GoogleCanceledStateContext {
  userInitiatedCancellation?: object;
  systemInitiatedCancellation?: object;
  developerInitiatedCancellation?: object;
  replacementCancellation?: object;
}

interface GooglePausedStateContext {
  autoResumeTime?: string;
}

interface GoogleReceiptResponseV2 {
  kind: string;
  regionCode: string;
  startTime: string; // RFC 3339 timestamp
  subscriptionState: GoogleSubscriptionState;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  pausedStateContext?: GooglePausedStateContext;
  canceledStateContext?: GoogleCanceledStateContext;
  testPurchase?: object;
  acknowledgementState: GoogleAcknowledgementState;
  externalAccountIdentifiers?: GoogleExternalAccountIdentifiers;
  lineItems: GoogleLineItem[];
}

interface GooglePlayApiErrorResponse {
  error?: {
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

// ========== Apple Webhook Types ==========
// Apple Server Notifications V2 notificationType
enum AppleNotificationType {
  SUBSCRIBED = 'SUBSCRIBED', // ✅ 처리됨: 구독 시작
  DID_RENEW = 'DID_RENEW', // ✅ 처리됨: 구독 갱신
  DID_CHANGE_RENEWAL_STATUS = 'DID_CHANGE_RENEWAL_STATUS', // ✅ 처리됨: 자동갱신 상태 변경
  DID_FAIL_TO_RENEW = 'DID_FAIL_TO_RENEW', // ✅ 처리됨: 갱신 실패 (Grace Period)
  EXPIRED = 'EXPIRED', // ✅ 처리됨: 구독 만료
  REFUND = 'REFUND', // ✅ 처리됨: 환불
  GRACE_PERIOD_EXPIRED = 'GRACE_PERIOD_EXPIRED', // ✅ 처리됨: 유예기간 만료
  REFUND_REVERSED = 'REFUND_REVERSED', // ✅ 처리됨: 환불 취소
  TEST = 'TEST', // ✅ 처리됨: 테스트 알림
  OFFER_REDEEMED = 'OFFER_REDEEMED', // ❌ 미처리: 프로모션 사용
  PRICE_INCREASE = 'PRICE_INCREASE', // ❌ 미처리: 가격 인상
  CONSUMPTION_REQUEST = 'CONSUMPTION_REQUEST', // ❌ 미처리: 소비 정보 요청
  REVOKE = 'REVOKE', // ✅ 처리됨: 가족 공유 액세스 취소
}

// Apple Server Notifications V2 subtype
enum AppleNotificationSubtype {
  AUTO_RENEW_ENABLED = 'AUTO_RENEW_ENABLED', // ✅ 처리됨: 자동갱신 켬
  AUTO_RENEW_DISABLED = 'AUTO_RENEW_DISABLED', // ✅ 처리됨: 자동갱신 끔 (암묵적)
  GRACE_PERIOD = 'GRACE_PERIOD', // ✅ 처리됨: 유예기간 진입
  INITIAL_BUY = 'INITIAL_BUY', // ❌ 미처리: 최초 구매 (SUBSCRIBED에서 처리)
  RESUBSCRIBE = 'RESUBSCRIBE', // ❌ 미처리: 재구독 (SUBSCRIBED에서 처리)
  DOWNGRADE = 'DOWNGRADE', // ❌ 미처리: 다운그레이드
  UPGRADE = 'UPGRADE', // ❌ 미처리: 업그레이드
  VOLUNTARY = 'VOLUNTARY', // ❌ 미처리: 자발적 취소
  BILLING_RETRY = 'BILLING_RETRY', // ❌ 미처리: 결제 재시도
  PRICE_INCREASE = 'PRICE_INCREASE', // ❌ 미처리: 가격 인상
  BILLING_RECOVERY = 'BILLING_RECOVERY', // ❌ 미처리: 결제 복구
  PENDING = 'PENDING', // ❌ 미처리: 대기중
  ACCEPTED = 'ACCEPTED', // ❌ 미처리: 수락됨
}

// ========== Google Webhook Types ==========
// @see https://developer.android.com/google/play/billing/rtdn-reference
// @see https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions

// Google RTDN notification types
// @see https://developer.android.com/google/play/billing/rtdn-reference#sub
enum GoogleNotificationType {
  SUBSCRIPTION_RECOVERED = 1, // ✅ 처리됨: Account Hold/Pause에서 복구
  SUBSCRIPTION_RENEWED = 2, // ✅ 처리됨: 구독 갱신
  SUBSCRIPTION_CANCELED = 3, // ✅ 처리됨: 자동갱신 끔 (만료일까지 유지)
  SUBSCRIPTION_PURCHASED = 4, // ✅ 처리됨: 구독 시작
  SUBSCRIPTION_ON_HOLD = 5, // ✅ 처리됨: Account Hold 진입
  SUBSCRIPTION_IN_GRACE_PERIOD = 6, // ✅ 처리됨: 유예기간 진입
  SUBSCRIPTION_RESTARTED = 7, // ✅ 처리됨: 취소된 구독 재활성화
  SUBSCRIPTION_PRICE_CHANGE_CONFIRMED = 8, // ❌ 미처리: 가격 변경 확인
  SUBSCRIPTION_DEFERRED = 9, // ✅ 처리됨: 구독 기간 연장
  SUBSCRIPTION_PAUSED = 10, // ✅ 처리됨: 일시정지
  SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED = 11, // ❌ 미처리: 일시정지 일정 변경
  SUBSCRIPTION_REVOKED = 12, // ✅ 처리됨: 환불/즉시 취소
  SUBSCRIPTION_EXPIRED = 13, // ✅ 처리됨: 구독 만료
}

// Google 구독 취소 사유
// @see https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions#cancelreason

// integer
// 정기 결제가 취소되었거나 자동 갱신되지 않는 이유입니다. 가능한 값은 0입니다. 0(사용자가 정기 결제 취소), 1(시스템이 정기 결제 취소 - 예: 결제 문제로 인해), 2(새 정기 결제로 교체됨), 개발자가 정기 결제를 취소했습니다.

interface GoogleSubscriptionNotification {
  version: string;
  notificationType: GoogleNotificationType;
  purchaseToken: string;
  subscriptionId: string;
}

interface GoogleDeveloperNotification {
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: GoogleSubscriptionNotification;
  testNotification?: { version: string };
}

// ========== 공통 웹훅 처리 인터페이스 ==========
interface SubscriptionUpdateParams {
  originalTransactionId: string;
  transactionId: string;
  expiryDate: Date;
  purchaseDate: Date;
  productId: string;
  eventType: string; // Apple/Google notificationType
  receiptData?: string; // 웹훅 원본 데이터 (JSON 문자열)
  price?: number; // 결제 금액
  currency?: string; // 통화 코드 (USD, KRW 등)
  platform?: PaymentPlatformEnum; // 결제 플랫폼 (webhook에서 upsert 시 필요)
  purchaseToken?: string; // Google Play 구매 토큰
  isTrialPeriod?: boolean; // 무료 체험 여부
  trialEndDate?: Date | null; // 무료 체험 종료일
  promotionCode?: string | null; // Google Play vanity promo code
  appAccountToken?: string; // Apple: appAccountToken (UUID)
  obfuscatedAccountId?: string; // Google: obfuscatedExternalAccountId (UUID)
}

interface RefundParams {
  originalTransactionId: string;
  refundDate: Date;
  refundReason?: string;
  eventType: string;
  receiptData?: string; // 웹훅 원본 데이터 (JSON 문자열)
  price?: number;
  currency?: string;
}

interface GracePeriodParams {
  originalTransactionId: string;
  gracePeriodExpiryDate: Date;
  eventType: string;
  receiptData?: string; // 웹훅 원본 데이터 (JSON 문자열)
  price?: number;
  currency?: string;
}

interface PauseParams {
  originalTransactionId: string;
  resumeDate: Date;
  eventType: string;
  receiptData?: string; // 웹훅 원본 데이터 (JSON 문자열)
  price?: number;
  currency?: string;
}

type TrackablePayment = Pick<
  Payment,
  | 'id'
  | 'userId'
  | 'platform'
  | 'transactionId'
  | 'originalTransactionId'
  | 'productId'
  | 'promotionCode'
  | 'status'
  | 'purchaseDate'
  | 'expiryDate'
  | 'isTrialPeriod'
  | 'trialEndDate'
  | 'autoRenewStatus'
  | 'gracePeriodExpiryDate'
  | 'refundDate'
  | 'resumeDate'
>;

type GoogleServiceAccountKeyError = Error & {
  code: string;
  envKey: string;
  configuredKeyFilePath: string | null;
  resolvedKeyFilePath: string | null;
  keyFileExists: boolean;
  usedJsonExtensionFallback: boolean;
};

function maskValue(
  value?: string | null,
  visiblePrefix = 6,
  visibleSuffix = 4,
) {
  if (!value) {
    return null;
  }

  if (value.length <= visiblePrefix + visibleSuffix) {
    return `${value.slice(0, 1)}***`;
  }

  return `${value.slice(0, visiblePrefix)}...${value.slice(-visibleSuffix)}`;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService,
    private discordService: DiscordService,
    private readonly mixpanelService: MixpanelService,
  ) {}

  private requireConfiguredProduct(productId: string) {
    const allowed = this.configService
      .get<string>('IAP_PRODUCT_IDS')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed?.length)
      throw new HttpException(
        'IAP products are not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (!allowed.includes(productId))
      throw new HttpException(
        ERROR_MESSAGE.PAYMENT.INVALID_PRODUCT_ID,
        HttpStatus.BAD_REQUEST,
      );
  }

  /**
   * @summary Apple 영수증 검증
   * @description Apple App Store 영수증을 검증하고 구독을 활성화합니다 (StoreKit 2 JWS 지원)
   * @access Normal
   * @route POST /payment/verify/apple
   * @body VerifyAppleReceiptReqDto
   * @response CommonResponse<VerifyReceiptDataDto>
   */
  async verifyAppleReceipt(
    dto: VerifyAppleReceiptReqDto,
    user: Payload,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> {
    try {
      // JWS 검증 실패가 legacy 경로로 우회하지 않도록 형식을 먼저 분류한다.
      const isJWS =
        dto.receiptData.includes('.') || dto.receiptData.startsWith('eyJ');
      console.log({ productId: dto.productId, isJWS }, 'verifyAppleReceipt');

      if (isJWS) {
        // StoreKit 2 JWS 형식 처리
        return await this.verifyAppleJWS(dto, user);
      } else {
        // 구식 영수증 형식 처리 (하위 호환)
        return await this.verifyAppleLegacyReceipt(dto, user);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.APPLE_RECEIPT_VERIFY_FAILED,
        error,
        {
          userId: user.id,
          productId: dto.productId,
          receiptDataLength: dto.receiptData?.length,
        },
      );
      throw new HttpException(
        `${ERROR_MESSAGE.PAYMENT.APPLE_VERIFY_FAILED}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * StoreKit 2 JWS 형식 영수증 검증
   */
  private async verifyAppleJWS(
    dto: VerifyAppleReceiptReqDto,
    user: Payload,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> {
    const result = await this.processAppleJWSInternal(
      { receiptData: dto.receiptData, user },
      { passWhenExpired: false },
    );

    if ('error' in result) {
      return generateErrorResponse(result.error, result.errorCode);
    }

    return generateSuccessResponse(
      { payment: this.mapToPaymentDto(result.payment) },
      SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_ACTIVATED,
    );
  }

  /**
   * Apple JWS 영수증 내부 처리 (verify와 restore 공용)
   */

  /**
   * 공통 Payment 저장/업데이트 로직
   * restore 모드(checkUserId)의 userId 검증과 Payment upsert를 처리
   */
  private async saveOrUpdatePayment(params: {
    user: Payload;
    originalTransactionId: string;
    status: PurchaseStatusEnum;
    expiryDate: Date;
    receiptData: string;
    options: { checkUserId?: boolean };
    createData: Prisma.PaymentUncheckedCreateInput;
    additionalUpdateData?: Record<string, unknown>;
  }): Promise<
    | {
        payment: Payment;
        status: PurchaseStatusEnum;
        alreadySaved?: boolean;
        isUpdatedToNewUser?: boolean;
      }
    | { error: string; errorCode?: string }
  > {
    const {
      user,
      originalTransactionId,
      status,
      expiryDate,
      receiptData,
      options,
      createData,
      additionalUpdateData = {},
    } = params;

    // restore 모드: userId 체크
    if (options.checkUserId) {
      const existingPayment = await this.prisma.payment.findFirst({
        where: { originalTransactionId },
      });

      if (existingPayment) {
        // userId가 존재하고 다른 경우 → 현재 유저로 연결 재설정
        if (existingPayment.userId && existingPayment.userId !== user.id) {
          const updatedPayment = await this.prisma.payment.update({
            where: { id: existingPayment.id },
            data: {
              userId: user.id,
              status,
              expiryDate,
              receipt: receiptData,
              ...additionalUpdateData,
            },
          });
          return { payment: updatedPayment, status, isUpdatedToNewUser: true };
        }

        // userId가 존재하고 같은 경우 → 이미 저장됨
        if (existingPayment.userId === user.id) {
          // 상태만 업데이트
          const updatedPayment = await this.prisma.payment.update({
            where: { id: existingPayment.id },
            data: {
              status,
              expiryDate,
              receipt: receiptData,
              ...additionalUpdateData,
            },
          });
          return { payment: updatedPayment, status, alreadySaved: true };
        }

        // userId가 null인 경우 → 해당 유저의 아이디로 업데이트
        const updatedPayment = await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            userId: user.id,
            status,
            expiryDate,
            receipt: receiptData,
            ...additionalUpdateData,
          },
        });
        return { payment: updatedPayment, status };
      }
    }

    // 히스토리는 웹훅에서만 생성 (중복 방지)
    // 클라이언트 영수증 검증은 Payment 레코드만 생성/업데이트
    const payment = await this.prisma.payment.upsert({
      where: { originalTransactionId },
      update: {
        status,
        expiryDate,
        userId: user.id,
        receipt: receiptData,
        ...additionalUpdateData,
      },
      create: createData,
    });

    // 다른 계정으로 로그인한 상태에서 결제 시 userId가 새 유저로 업데이트됨
    return { payment, status, isUpdatedToNewUser: user.id !== payment.userId };
  }

  private async processAppleJWSInternal(
    params: { receiptData: string; user: Payload },
    options: { passWhenExpired?: boolean; checkUserId?: boolean },
  ): Promise<
    | {
        payment: Payment;
        status: PurchaseStatusEnum;
        alreadySaved?: boolean;
        isUpdatedToNewUser?: boolean;
      }
    | { error: string; errorCode?: string }
  > {
    const { receiptData, user } = params;

    const payload = await this.verifyAppleTransaction(receiptData);
    this.requireConfiguredProduct(payload.productId);

    // 만료일 확인
    const expiryDate = new Date(payload.expiresDate);
    const purchaseDate = new Date(payload.purchaseDate);

    // 무료 체험 여부 확인 (offerType: 1 = introductory offer, offerDiscountType: FREE_TRIAL)
    const isTrialPeriod =
      payload.offerType === 1 && payload.offerDiscountType === 'FREE_TRIAL';
    // 무료 체험 중에는 expiresDate가 바로 무료 체험 종료일
    const trialEndDate = isTrialPeriod ? expiryDate : null;

    // DB에 결제 정보 저장
    const status =
      expiryDate > new Date()
        ? PurchaseStatusEnum.ACTIVE
        : PurchaseStatusEnum.EXPIRED;

    // 만료된 영수증이면 에러 반환 (passWhenExpired가 true면 스킵)
    if (status === PurchaseStatusEnum.EXPIRED && !options.passWhenExpired) {
      return {
        error: ERROR_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
        errorCode: 'SUBSCRIPTION_EXPIRED',
      };
    }

    // 공통 메서드로 Payment 저장/업데이트
    return this.saveOrUpdatePayment({
      user,
      originalTransactionId: payload.originalTransactionId,
      status,
      expiryDate,
      receiptData,
      options: { checkUserId: options.checkUserId },
      createData: {
        userId: user.id,
        platform: PaymentPlatformEnum.APPLE_APP_STORE,
        status,
        transactionId: payload.transactionId,
        originalTransactionId: payload.originalTransactionId,
        productId: payload.productId,
        receipt: receiptData,
        purchaseDate,
        expiryDate,
        isTrialPeriod,
        trialEndDate,
        autoRenewStatus: true,
        gracePeriodExpiryDate: null,
        refundDate: null,
        refundReason: null,
      },
    });
  }

  /**
   * 구식 영수증 형식 검증 (하위 호환)
   */
  private async verifyAppleLegacyReceipt(
    dto: VerifyAppleReceiptReqDto,
    user: Payload,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> {
    const result = await this.processAppleLegacyInternal(
      { receiptData: dto.receiptData, productId: dto.productId, user },
      { passWhenExpired: false },
    );

    if ('error' in result) {
      return generateErrorResponse(result.error, result.errorCode);
    }

    return generateSuccessResponse(
      { payment: this.mapToPaymentDto(result.payment) },
      SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_ACTIVATED,
    );
  }

  /**
   * Apple Legacy 영수증 내부 처리 (verify와 restore 공용)
   */
  private async processAppleLegacyInternal(
    params: { receiptData: string; productId: string; user: Payload },
    options: { passWhenExpired?: boolean; checkUserId?: boolean },
  ): Promise<
    | {
        payment: Payment;
        status: PurchaseStatusEnum;
        alreadySaved?: boolean;
        isUpdatedToNewUser?: boolean;
      }
    | { error: string; errorCode?: string }
  > {
    const { receiptData, productId, user } = params;

    const appleUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://buy.itunes.apple.com/verifyReceipt'
        : 'https://sandbox.itunes.apple.com/verifyReceipt';

    const response = await axios.post<AppleReceiptResponse>(appleUrl, {
      'receipt-data': receiptData,
      password: this.configService.get<string>(
        envVariableKeys.APPLE_SHARED_SECRET,
      ),
      'exclude-old-transactions': true,
    });

    const { status: responseStatus, latest_receipt_info } = response.data;

    // 상태 코드 확인
    if (responseStatus !== 0) {
      return { error: ERROR_MESSAGE.PAYMENT.APPLE_VERIFY_FAILED };
    }

    if (!latest_receipt_info || latest_receipt_info.length === 0) {
      return { error: ERROR_MESSAGE.PAYMENT.NO_SUBSCRIPTION_INFO };
    }

    // 가장 최근 구독 정보 가져오기
    const latestReceipt = latest_receipt_info[0];
    this.requireConfiguredProduct(latestReceipt.product_id);
    const expiryDate = new Date(parseInt(latestReceipt.expires_date_ms));
    const purchaseDate = new Date(parseInt(latestReceipt.purchase_date_ms));
    const isTrialPeriod = latestReceipt.is_trial_period === 'true';

    // 무료 체험 중에는 expiresDate가 바로 무료 체험 종료일
    const trialEndDate = isTrialPeriod ? expiryDate : null;

    // DB에 결제 정보 저장
    const status =
      expiryDate > new Date()
        ? PurchaseStatusEnum.ACTIVE
        : PurchaseStatusEnum.EXPIRED;

    // 만료된 영수증이면 에러 반환 (passWhenExpired가 true면 스킵)
    if (status === PurchaseStatusEnum.EXPIRED && !options.passWhenExpired) {
      return {
        error: ERROR_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
        errorCode: 'SUBSCRIPTION_EXPIRED',
      };
    }

    // 공통 메서드로 Payment 저장/업데이트
    return this.saveOrUpdatePayment({
      user,
      originalTransactionId: latestReceipt.original_transaction_id,
      status,
      expiryDate,
      receiptData,
      options: { checkUserId: options.checkUserId },
      createData: {
        userId: user.id,
        platform: PaymentPlatformEnum.APPLE_APP_STORE,
        status,
        transactionId: latestReceipt.transaction_id,
        originalTransactionId: latestReceipt.original_transaction_id,
        productId: productId || latestReceipt.product_id,
        receipt: receiptData,
        purchaseDate,
        expiryDate,
        isTrialPeriod,
        trialEndDate,
        autoRenewStatus: true,
        gracePeriodExpiryDate: null,
        refundDate: null,
        refundReason: null,
      },
    });
  }

  /**
   * @summary Google 영수증 검증
   * @description Google Play 영수증을 검증하고 구독을 활성화합니다
   * @access Normal
   * @route POST /payment/verify/google
   * @body VerifyGoogleReceiptReqDto
   * @response CommonResponse<VerifyReceiptDataDto>
   */
  async verifyGoogleReceipt(
    dto: VerifyGoogleReceiptReqDto,
    user: Payload,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> {
    try {
      this.logger.log('[Google Payment] Verify request received', {
        userId: user.id,
        productId: dto.productId,
        purchaseTokenLength: dto.purchaseToken?.length,
        purchaseTokenMasked: maskValue(dto.purchaseToken),
      });

      const result = await this.processGoogleInternal(
        { purchaseToken: dto.purchaseToken, user },
        { passWhenExpired: false },
      );

      this.logger.log('[Google Payment] Verify process completed', {
        userId: user.id,
        productId: dto.productId,
        success: !('error' in result),
        status: 'status' in result ? result.status : undefined,
        alreadySaved:
          'alreadySaved' in result ? result.alreadySaved : undefined,
        errorCode: 'errorCode' in result ? result.errorCode : undefined,
      });

      if ('error' in result) {
        return generateErrorResponse(result.error, result.errorCode);
      }

      return generateSuccessResponse(
        { payment: this.mapToPaymentDto(result.payment) },
        SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_ACTIVATED,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.GOOGLE_RECEIPT_VERIFY_FAILED,
        error,
        {
          userId: user.id,
          productId: dto.productId,
          purchaseTokenLength: dto.purchaseToken?.length,
          purchaseTokenMasked: maskValue(dto.purchaseToken),
        },
      );
      throw new HttpException(
        `${ERROR_MESSAGE.PAYMENT.GOOGLE_VERIFY_FAILED}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getGooglePromotionCode(lineItem?: GoogleLineItem | null) {
    return lineItem?.signupPromotion?.vanityCode?.promotionCode?.trim() || null;
  }

  /**
   * Google 영수증 내부 처리 (verify와 restore 공용)
   * V2 API 사용: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
   */
  private async processGoogleInternal(
    params: { purchaseToken: string; user: Payload },
    options: { passWhenExpired?: boolean; checkUserId?: boolean },
  ): Promise<
    | {
        payment: Payment;
        status: PurchaseStatusEnum;
        alreadySaved?: boolean;
        basePlanId?: string;
      }
    | { error: string; errorCode?: string }
  > {
    const { purchaseToken, user } = params;

    // ========== 1. Google API 호출 ==========
    const packageName = this.configService.get<string>(
      envVariableKeys.BUNDLE_ID,
    );
    const googleUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

    this.logger.log('[Google Payment] Calling Play Developer API', {
      userId: user.id,
      packageName,
      purchaseTokenLength: purchaseToken.length,
      purchaseTokenMasked: maskValue(purchaseToken),
      passWhenExpired: options.passWhenExpired,
      checkUserId: options.checkUserId,
    });

    const accessToken = await this.getGoogleAccessToken();

    const response = await axios.get<GoogleReceiptResponseV2>(googleUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const receiptData = response.data;

    this.logger.log('[Google Payment] Play Developer API response received', {
      userId: user.id,
      packageName,
      purchaseTokenLength: purchaseToken.length,
      subscriptionState: receiptData.subscriptionState,
      latestOrderId: receiptData.latestOrderId,
      lineItemCount: receiptData.lineItems?.length ?? 0,
      lineItemOrderIds: receiptData.lineItems
        ?.map((lineItem) => lineItem.latestSuccessfulOrderId)
        .filter(Boolean),
    });

    // ========== 2. 데이터 추출 ==========
    const lineItem = receiptData.lineItems?.[0];
    if (!lineItem) {
      return { error: ERROR_MESSAGE.PAYMENT.PAYMENT_NOT_COMPLETED };
    }

    this.requireConfiguredProduct(lineItem.productId);
    const basePlanId = lineItem.offerDetails?.basePlanId;
    const offerId = lineItem.offerDetails?.offerId;
    const promotionCode = this.getGooglePromotionCode(lineItem);
    const expiryDate = new Date(lineItem.expiryTime);
    const purchaseDate = new Date(receiptData.startTime);
    const googleOrderId = this.resolveGoogleOrderId(receiptData, purchaseToken);
    const originalOrderId = this.extractGoogleOriginalOrderId(googleOrderId);
    const receiptDataString = JSON.stringify(receiptData);

    this.logger.log('[Google Payment] Receipt line item parsed', {
      userId: user.id,
      productId: lineItem.productId,
      basePlanId,
      offerId,
      offerTags: lineItem.offerDetails?.offerTags,
      promotionCode,
      expiryTime: lineItem.expiryTime,
      googleOrderId,
      originalOrderId,
    });

    // 무료 체험 확인
    // 1. offerId가 존재하면 프로모션/무료 체험 오퍼가 적용된 것
    // 2. 또는 offerTags에 trial/free가 포함된 경우
    const offerTags = lineItem.offerDetails?.offerTags || [];
    const hasTrialOffer = !!offerId; // offerId가 있으면 오퍼 적용됨
    const hasTrialTag = offerTags.some(
      (tag) =>
        tag.toLowerCase().includes('trial') ||
        tag.toLowerCase().includes('free'),
    );
    const isTrialPeriod = hasTrialOffer || hasTrialTag;
    const trialEndDate = isTrialPeriod ? expiryDate : null;
    const autoRenewStatus =
      lineItem.autoRenewingPlan?.autoRenewEnabled ?? false;

    console.log(
      `[Google Receipt] basePlanId: ${basePlanId}, offerId: ${offerId}, isTrialPeriod: ${isTrialPeriod}`,
    );

    // ========== 3. 구독 상태별 처리 (switch-case) ==========
    let gracePeriodExpiryDate: Date | null = null;
    let resumeDate: Date | null = null;

    switch (receiptData.subscriptionState) {
      case GoogleSubscriptionState.SUBSCRIPTION_STATE_PENDING:
        return { error: ERROR_MESSAGE.PAYMENT.PAYMENT_NOT_COMPLETED };

      case GoogleSubscriptionState.SUBSCRIPTION_STATE_EXPIRED:
        if (!options.passWhenExpired) {
          return {
            error: ERROR_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
            errorCode: 'SUBSCRIPTION_EXPIRED',
          };
        }
        break;

      case GoogleSubscriptionState.SUBSCRIPTION_STATE_IN_GRACE_PERIOD:
        gracePeriodExpiryDate = expiryDate;
        break;

      case GoogleSubscriptionState.SUBSCRIPTION_STATE_PAUSED:
        resumeDate = receiptData.pausedStateContext?.autoResumeTime
          ? new Date(receiptData.pausedStateContext.autoResumeTime)
          : null;
        break;

      case GoogleSubscriptionState.SUBSCRIPTION_STATE_ACTIVE:
      case GoogleSubscriptionState.SUBSCRIPTION_STATE_CANCELED:
      case GoogleSubscriptionState.SUBSCRIPTION_STATE_ON_HOLD:
      default:
        // 계속 진행
        break;
    }

    // ========== 4. DB 저장 ==========
    const status =
      expiryDate > new Date()
        ? PurchaseStatusEnum.ACTIVE
        : PurchaseStatusEnum.EXPIRED;

    // 만료된 영수증이면 에러 반환 (passWhenExpired가 true면 스킵)
    if (status === PurchaseStatusEnum.EXPIRED && !options.passWhenExpired) {
      return {
        error: ERROR_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
        errorCode: 'SUBSCRIPTION_EXPIRED',
      };
    }

    const result = await this.saveOrUpdatePayment({
      user,
      originalTransactionId: originalOrderId,
      status,
      expiryDate,
      receiptData: receiptDataString,
      options: { checkUserId: options.checkUserId },
      createData: {
        userId: user.id,
        platform: PaymentPlatformEnum.GOOGLE_PLAY,
        status,
        transactionId: googleOrderId,
        originalTransactionId: originalOrderId,
        productId: lineItem.productId,
        purchaseToken: purchaseToken,
        promotionCode,
        receipt: receiptDataString,
        purchaseDate,
        expiryDate,
        isTrialPeriod,
        trialEndDate,
        autoRenewStatus,
        gracePeriodExpiryDate,
        refundDate: null,
        refundReason: null,
        resumeDate,
      },
      additionalUpdateData: {
        transactionId: googleOrderId,
        autoRenewStatus,
        gracePeriodExpiryDate,
        resumeDate,
        ...(promotionCode ? { promotionCode } : {}),
      },
    });

    if ('payment' in result) {
      return { ...result, basePlanId };
    }
    return result;
  }

  /**
   * @summary 구매 복원
   * @description 사용자의 이전 구매를 복원합니다 (Apple/Google). 여러 구매 토큰/영수증을 받아서 가장 적합한 것을 선택합니다.
   * @access Normal
   * @route POST /payment/restore
   * @body RestorePurchaseReqDto
   * @response CommonResponse<RestorePurchaseDataDto>
   */
  async restorePurchase(
    dto: RestorePurchaseReqDto,
    user: Payload,
  ): Promise<CommonResponse<RestorePurchaseDataDto>> {
    console.log(
      {
        ...dto,
        receiptDataList: dto.receiptDataList.length,
        purchaseTokens: dto.purchaseTokens.length,
      },
      'restorePurchase',
    );
    try {
      if (dto.platform === PaymentPlatformEnum.APPLE_APP_STORE) {
        // Apple 구매 복원
        if (dto.receiptDataList.length === 0) {
          return generateErrorResponse(
            ERROR_MESSAGE.PAYMENT.APPLE_RECEIPT_REQUIRED,
          );
        }

        return await this.restoreApplePurchase(dto.receiptDataList, user);
      } else if (dto.platform === PaymentPlatformEnum.GOOGLE_PLAY) {
        // Google 구매 복원
        if (dto.purchaseTokens.length === 0) {
          return generateErrorResponse(
            ERROR_MESSAGE.PAYMENT.GOOGLE_TOKEN_REQUIRED,
          );
        }

        return await this.restoreGooglePurchase(user, dto.purchaseTokens);
      }

      return generateErrorResponse(ERROR_MESSAGE.PAYMENT.UNSUPPORTED_PLATFORM);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.RESTORE_PURCHASE_FAILED,
        error,
        {
          userId: user.id,
          platform: dto.platform,
          receiptDataCount: dto.receiptDataList?.length,
          purchaseTokenCount: dto.purchaseTokens?.length,
        },
      );
      throw new HttpException(
        `${ERROR_MESSAGE.PAYMENT.RESTORE_FAILED}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @summary 구독 상태 조회
   * @description 사용자의 현재 구독 상태를 조회합니다
   * @access Normal
   * @route GET /payment/status
   * @response CommonResponse<SubscriptionStatusDataDto>
   */
  async getSubscriptionStatus(
    user: Payload,
  ): Promise<CommonResponse<SubscriptionStatusDataDto>> {
    const now = new Date();

    // 활성화된 구독 찾기
    const activePayment = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: PurchaseStatusEnum.ACTIVE,
        expiryDate: {
          gt: now,
        },
      },
      orderBy: {
        expiryDate: 'desc',
      },
    });

    if (!activePayment) {
      return generateSuccessResponse({
        hasActiveSubscription: false,
        isInTrialPeriod: false,
      });
    }

    const daysRemaining = Math.ceil(
      (activePayment.expiryDate.getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const isInTrialPeriod =
      activePayment.isTrialPeriod &&
      activePayment.trialEndDate &&
      activePayment.trialEndDate > now;

    return generateSuccessResponse({
      hasActiveSubscription: true,
      isInTrialPeriod,
      activePayment: this.mapToPaymentDto(activePayment),
      expiryDate: activePayment.expiryDate,
      daysRemaining,
    });
  }

  /**
   * @summary 구독 취소
   * @description 구독을 취소합니다 (상태만 변경, 실제 환불은 스토어에서 처리)
   * @access Normal
   * @route POST /payment/cancel
   * @body CancelSubscriptionReqDto
   * @response CommonResponse<CancelSubscriptionDataDto>
   */
  async cancelSubscription(
    dto: CancelSubscriptionReqDto,
    user: Payload,
  ): Promise<CommonResponse<CancelSubscriptionDataDto>> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: dto.paymentId,
        userId: user.id,
      },
    });

    if (!payment) {
      return generateErrorResponse(
        ERROR_MESSAGE.PAYMENT.SUBSCRIPTION_NOT_FOUND,
      );
    }

    // 히스토리는 웹훅에서만 생성 (중복 방지)
    // 실제 취소는 스토어에서 발생하고 웹훅으로 전달됨
    await this.prisma.payment.update({
      where: { id: dto.paymentId },
      data: {
        status: PurchaseStatusEnum.CANCELLED,
        autoRenewStatus: false,
      },
    });

    return generateSuccessResponse(
      {},
      SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_CANCELLED,
    );
  }

  // ========== Private Helper Methods ==========

  private async restoreApplePurchase(
    receiptDataList: string[],
    user: Payload,
  ): Promise<CommonResponse<RestorePurchaseDataDto>> {
    const restoredPayments: Payment[] = [];
    let alreadySavedCount = 0;

    for (const receiptData of receiptDataList) {
      // JWS 형식인지 확인
      const isJWS = receiptData.includes('.') || receiptData.startsWith('eyJ');

      if (isJWS) {
        // JWS 형식: processAppleJWSInternal 사용
        const result = await this.processAppleJWSInternal(
          { receiptData, user },
          { passWhenExpired: true, checkUserId: true },
        );

        if ('error' in result) {
          // 다른 에러는 스킵하고 다음 영수증 처리
          continue;
        }

        if (result.alreadySaved) {
          alreadySavedCount++;
        }
        restoredPayments.push(result.payment);
      } else {
        // Legacy 형식: processAppleLegacyInternal 사용
        // productId는 API 응답에서 가져옴 (빈 문자열 전달, 내부에서 처리)
        const result = await this.processAppleLegacyInternal(
          { receiptData, productId: '', user },
          { passWhenExpired: true, checkUserId: true },
        );

        if ('error' in result) {
          // 다른 에러는 스킵하고 다음 영수증 처리
          continue;
        }

        if (result.alreadySaved) {
          alreadySavedCount++;
        }
        restoredPayments.push(result.payment);
        break; // Legacy 영수증은 하나만 처리
      }
    }

    // 복원된 결제가 없음
    if (restoredPayments.length === 0) {
      return generateErrorResponse(ERROR_MESSAGE.PAYMENT.RESTORE_NO_PURCHASE);
    }

    // 모두 이미 저장된 경우
    if (alreadySavedCount === restoredPayments.length) {
      return generateSuccessResponse(
        { payments: restoredPayments.map((p) => this.mapToPaymentDto(p)) },
        ERROR_MESSAGE.PAYMENT.RESTORE_ALREADY_SAVED,
      );
    }

    return generateSuccessResponse(
      { payments: restoredPayments.map((p) => this.mapToPaymentDto(p)) },
      `${restoredPayments.length}${SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTIONS_RESTORED}`,
    );
  }
  private async restoreGooglePurchase(
    user: Payload,
    purchaseTokens: string[],
  ): Promise<CommonResponse<RestorePurchaseDataDto>> {
    const restoredPayments: Payment[] = [];
    let alreadySavedCount = 0;

    for (const purchaseToken of purchaseTokens) {
      let processResult:
        | {
            payment: Payment;
            status: PurchaseStatusEnum;
            alreadySaved?: boolean;
          }
        | { error: string; errorCode?: string };

      try {
        processResult = await this.processGoogleInternal(
          { purchaseToken, user },
          { passWhenExpired: true, checkUserId: true },
        );
      } catch (error) {
        const googleApiError = this.getGooglePlayApiError(error);
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.PAYMENT.RESTORE_GOOGLE_PURCHASE_TOKEN_FAILED,
          error,
          {
            userId: user.id,
            purchaseTokenLength: purchaseToken.length,
            purchaseTokenMasked: maskValue(purchaseToken),
            googleApiStatus: googleApiError.status,
            googleApiReason: googleApiError.reason,
            isFatalRestoreError: this.isFatalGoogleRestoreError(error),
          },
        );

        if (this.isFatalGoogleRestoreError(error)) {
          throw new HttpException(
            ERROR_MESSAGE.PAYMENT.RESTORE_FAILED,
            HttpStatus.BAD_GATEWAY,
          );
        }

        // API 호출 실패 시 다음 토큰 처리
        continue;
      }

      if ('error' in processResult) {
        // 다른 에러는 스킵
        continue;
      }

      if (processResult.alreadySaved) {
        alreadySavedCount++;
      }
      restoredPayments.push(processResult.payment);
    }

    // 복원된 결제가 없음
    if (restoredPayments.length === 0) {
      return generateErrorResponse(ERROR_MESSAGE.PAYMENT.RESTORE_NO_PURCHASE);
    }

    // 모두 이미 저장된 경우
    if (alreadySavedCount === restoredPayments.length) {
      return generateSuccessResponse(
        { payments: restoredPayments.map((p) => this.mapToPaymentDto(p)) },
        ERROR_MESSAGE.PAYMENT.RESTORE_ALREADY_SAVED,
      );
    }

    return generateSuccessResponse(
      { payments: restoredPayments.map((p) => this.mapToPaymentDto(p)) },
      `${restoredPayments.length}${SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTIONS_RESTORED}`,
    );
  }

  private getGooglePlayApiError(error: unknown): {
    status?: number;
    reason?: string;
    message?: string;
  } {
    if (!axios.isAxiosError(error)) {
      return {
        message: error instanceof Error ? error.message : undefined,
      };
    }

    const responseData = error.response?.data as
      | GooglePlayApiErrorResponse
      | undefined;
    const firstError = responseData?.error?.errors?.[0];

    return {
      status: error.response?.status,
      reason: firstError?.reason,
      message: firstError?.message ?? responseData?.error?.message,
    };
  }

  private isFatalGoogleRestoreError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return true;
    }

    const { status, reason } = this.getGooglePlayApiError(error);

    if (!status) {
      return true;
    }

    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      return true;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return true;
    }

    return (
      reason === 'accessNotConfigured' ||
      reason === 'userInsufficientPermission'
    );
  }

  private async getGoogleAccessToken(): Promise<string> {
    // Google Service Account를 사용하여 OAuth2 토큰 발급
    const configuredKeyFilePath = this.configService
      .get<string>(envVariableKeys.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
      ?.trim();
    const jsonExtensionKeyFilePath =
      configuredKeyFilePath && !configuredKeyFilePath.endsWith('.json')
        ? `${configuredKeyFilePath}.json`
        : null;
    const configuredKeyFileExists = configuredKeyFilePath
      ? existsSync(configuredKeyFilePath)
      : false;
    const jsonExtensionKeyFileExists = jsonExtensionKeyFilePath
      ? existsSync(jsonExtensionKeyFilePath)
      : false;
    const resolvedKeyFilePath = configuredKeyFileExists
      ? configuredKeyFilePath
      : jsonExtensionKeyFileExists
        ? jsonExtensionKeyFilePath
        : configuredKeyFilePath;
    const keyFileExists = Boolean(
      resolvedKeyFilePath && existsSync(resolvedKeyFilePath),
    );
    const usedJsonExtensionFallback =
      Boolean(jsonExtensionKeyFilePath) &&
      resolvedKeyFilePath === jsonExtensionKeyFilePath;

    this.logger.log('[Google Payment] Service account key check', {
      envKey: envVariableKeys.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      keyFileConfigured: Boolean(configuredKeyFilePath),
      configuredKeyFilePath: configuredKeyFilePath ?? null,
      resolvedKeyFilePath: resolvedKeyFilePath ?? null,
      keyFileExists,
      usedJsonExtensionFallback,
    });

    if (!resolvedKeyFilePath || !keyFileExists) {
      const sentryError = new Error(
        configuredKeyFilePath
          ? `${INTERNAL_ERROR_MESSAGE.PAYMENT.GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING}: ${configuredKeyFilePath}`
          : `${INTERNAL_ERROR_MESSAGE.PAYMENT.GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING}: ${envVariableKeys.GOOGLE_SERVICE_ACCOUNT_KEY_PATH} is not configured`,
      ) as GoogleServiceAccountKeyError;

      sentryError.code = configuredKeyFilePath
        ? 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING'
        : 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH_MISSING';
      sentryError.envKey = envVariableKeys.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
      sentryError.configuredKeyFilePath = configuredKeyFilePath ?? null;
      sentryError.resolvedKeyFilePath = resolvedKeyFilePath ?? null;
      sentryError.keyFileExists = keyFileExists;
      sentryError.usedJsonExtensionFallback = usedJsonExtensionFallback;

      throw sentryError;
    }

    const auth = new GoogleAuth({
      keyFile: resolvedKeyFilePath,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    this.logger.log('[Google Payment] Service account access token issued', {
      envKey: envVariableKeys.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      configuredKeyFilePath: configuredKeyFilePath ?? null,
      resolvedKeyFilePath,
      usedJsonExtensionFallback,
      hasAccessToken: Boolean(accessToken.token),
    });

    return accessToken.token;
  }

  private mapToPaymentDto(payment: any): PaymentDto {
    return {
      id: payment.id,
      platform: payment.platform,
      status: payment.status,
      transactionId: payment.transactionId,
      productId: payment.productId,
      promotionCode: payment.promotionCode ?? null,
      purchaseDate: payment.purchaseDate,
      expiryDate: payment.expiryDate,
      isTrialPeriod: payment.isTrialPeriod,
      trialEndDate: payment.trialEndDate,
    };
  }

  private trackSubscriptionEvent(params: {
    eventName: MixpanelServerEventName;
    payment: TrackablePayment;
    eventType?: string;
    price?: number;
    currency?: string;
    paymentUUID?: string | null;
  }) {
    const { eventName, payment, eventType, price, currency, paymentUUID } =
      params;
    const distinctId =
      payment.userId ??
      paymentUUID ??
      `payment:${payment.originalTransactionId}`;
    const properties: MixpanelPaymentProperties = {
      user_id: payment.userId,
      payment_id: payment.id,
      platform: payment.platform,
      product_id: payment.productId,
      status: payment.status,
      transaction_id: payment.transactionId,
      original_transaction_id: payment.originalTransactionId,
      promotion_code: payment.promotionCode,
      event_type: eventType,
      price,
      currency,
      payment_uuid_present: Boolean(paymentUUID),
      purchase_date: payment.purchaseDate,
      expiry_date: payment.expiryDate,
      is_trial_period: payment.isTrialPeriod,
      trial_end_date: payment.trialEndDate,
      auto_renew_status: payment.autoRenewStatus,
      grace_period_expiry_date: payment.gracePeriodExpiryDate,
      refund_date: payment.refundDate,
      resume_date: payment.resumeDate,
    };

    void this.mixpanelService.trackEvent({
      eventName,
      distinctId,
      insertId: [
        eventName,
        payment.id,
        eventType ?? 'unknown',
        payment.transactionId,
        payment.status,
        payment.expiryDate?.toISOString() ?? 'no-expiry',
      ].join(':'),
      properties,
    });
  }

  // ========================================
  // ========== 웹훅 핸들러 (Public) ==========
  // ========================================

  /**
   * @summary Apple 웹훅 처리
   * @access public
   * @whitelist true
   * @description Apple App Store Server Notifications V2 웹훅을 처리합니다
   * @route POST /payment/webhook/apple
   * @body AppleWebhookReqDto
   * @response CommonResponse<WebhookResultDataDto>
   */
  async handleAppleWebhook(
    dto: AppleWebhookReqDto,
  ): Promise<CommonResponse<WebhookResultDataDto>> {
    try {
      const verifier = this.requireAppleVerifier();
      const payload = await verifier.verifyAndDecodeNotification(
        dto.signedPayload,
      );
      // TEST 알림은 거래가 없어도 외부 서명과 앱/환경 검증을 통과해야 한다.
      if (
        payload.notificationType === AppleNotificationType.TEST &&
        !payload.data?.signedTransactionInfo &&
        !payload.data?.signedRenewalInfo
      ) {
        return generateSuccessResponse(
          {},
          SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
        );
      }
      if (!payload.data?.signedTransactionInfo) {
        return generateErrorResponse(
          ERROR_MESSAGE.PAYMENT.WEBHOOK_INVALID_PAYLOAD,
        );
      }
      const transactionInfo = await this.verifyAppleTransaction(
        payload.data.signedTransactionInfo,
      );
      this.requireConfiguredProduct(transactionInfo.productId);
      const renewalInfo = payload.data.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(
            payload.data.signedRenewalInfo,
          )
        : null;
      // 갱신 JWS에는 bundleId가 없으므로 검증된 거래와 원거래/상품도 대조한다.
      if (
        renewalInfo &&
        (renewalInfo.originalTransactionId !==
          transactionInfo.originalTransactionId ||
          renewalInfo.productId !== transactionInfo.productId)
      ) {
        return generateErrorResponse(
          ERROR_MESSAGE.PAYMENT.WEBHOOK_INVALID_PAYLOAD,
        );
      }

      // Apple은 가격을 밀리유닛(milliunits)으로 전달하므로 1000으로 나눠서 실제 가격으로 변환
      const actualPrice = transactionInfo.price
        ? transactionInfo.price / 1000
        : undefined;

      // 디버깅 로그
      console.log('![Apple Webhook] Received:', {
        notificationType: payload.notificationType,
        subtype: payload.subtype,
        transactionId: transactionInfo.transactionId,
        originalTransactionId: transactionInfo.originalTransactionId,
        productId: transactionInfo.productId,
        price: actualPrice,
        currency: transactionInfo.currency,
        receiptData: dto.signedPayload.length,
      });
      console.log('[Apple Webhook] Details:', {
        expiresDate: new Date(transactionInfo.expiresDate),
        autoRenewStatus: renewalInfo?.autoRenewStatus,
        gracePeriodExpiresDate: renewalInfo?.gracePeriodExpiresDate
          ? new Date(renewalInfo.gracePeriodExpiresDate)
          : null,
      });

      // 이벤트 타입별 처리 (테스트 시나리오: backend/test.md 참조)
      switch (payload.notificationType) {
        /**
         * @example
         * notificationType: 'SUBSCRIBED',
         * subtype: 'INITIAL_BUY' | 'RESUBSCRIBE',
         * transactionId: '2000001077027124',
         * originalTransactionId: '2000001077027124',
         * productId: 'annual',
         * receiptData: 18555
         *
         * Details:
         * expiresDate: 2025-12-09T10:08:17.000Z,
         * autoRenewStatus: 1,
         * gracePeriodExpiresDate: null
         */
        //TEST:  ✅
        case AppleNotificationType.SUBSCRIBED:
          // 구독 시작 (최초 또는 재구독)
          await this.activateSubscription({
            originalTransactionId: transactionInfo.originalTransactionId,
            transactionId: transactionInfo.transactionId,
            expiryDate: new Date(transactionInfo.expiresDate),
            purchaseDate: new Date(transactionInfo.purchaseDate),
            productId: transactionInfo.productId,
            eventType: AppleNotificationType.SUBSCRIBED,
            price: actualPrice,
            currency: transactionInfo.currency,
            receiptData: dto.signedPayload,
            platform: PaymentPlatformEnum.APPLE_APP_STORE,
            appAccountToken: transactionInfo.appAccountToken, // UUID로 유저 식별
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_ACTIVATED,
          );

        //TEST:  ✅

        case AppleNotificationType.DID_RENEW:
          // 자동 결제 성공, 구독 연장
          await this.renewSubscription({
            originalTransactionId: transactionInfo.originalTransactionId,
            transactionId: transactionInfo.transactionId,
            expiryDate: new Date(transactionInfo.expiresDate),
            purchaseDate: new Date(transactionInfo.purchaseDate),
            productId: transactionInfo.productId,
            eventType: AppleNotificationType.DID_RENEW,
            price: actualPrice,
            currency: transactionInfo.currency,
            receiptData: dto.signedPayload,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_RENEWED,
          );

        //TEST:  ✅

        /**
         * @example
         * notificationType: 'DID_CHANGE_RENEWAL_STATUS',
         * subtype: 'AUTO_RENEW_DISABLED',
         * transactionId: '2000001077027124',
         * originalTransactionId: '2000001077027124',
         * productId: 'annual',
         * receiptData: 18513
         *
         * Details:
         * expiresDate: 2025-12-09T10:08:17.000Z,
         * autoRenewStatus: 0,
         * gracePeriodExpiresDate: null
         */
        case AppleNotificationType.DID_CHANGE_RENEWAL_STATUS:
          // 자동 갱신 끔/켬 (주의: 만료일까지 서비스 유지)
          //끔 이벤트명: 'AUTO_RENEW_DISABLED'
          const autoRenewEnabled =
            payload.subtype === AppleNotificationSubtype.AUTO_RENEW_ENABLED;
          await this.updateAutoRenewStatus(
            transactionInfo.originalTransactionId,
            autoRenewEnabled,
            AppleNotificationType.DID_CHANGE_RENEWAL_STATUS,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
          );
        //TEST:  ✅ ❌

        case AppleNotificationType.DID_FAIL_TO_RENEW:
          // 갱신 실패 - Grace Period 진입 또는 즉시 만료
          if (
            payload.subtype === AppleNotificationSubtype.GRACE_PERIOD &&
            renewalInfo?.gracePeriodExpiresDate
          ) {
            await this.enterGracePeriod({
              originalTransactionId: transactionInfo.originalTransactionId,
              gracePeriodExpiryDate: new Date(
                renewalInfo.gracePeriodExpiresDate,
              ),
              eventType: AppleNotificationType.DID_FAIL_TO_RENEW,
              price: actualPrice,
              currency: transactionInfo.currency,
              receiptData: dto.signedPayload,
            });
            return generateSuccessResponse(
              {},
              SUCCESS_MESSAGE.PAYMENT.GRACE_PERIOD_ENTERED,
            );
          }
          // Grace Period 없이 바로 만료
          await this.expireSubscription(
            transactionInfo.originalTransactionId,
            AppleNotificationType.DID_FAIL_TO_RENEW,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
          );

        //TEST:  ✅
        /**
         * @example
         * notificationType: 'EXPIRED',
         * subtype: 'VOLUNTARY',
         * transactionId: '2000001077027124',
         * originalTransactionId: '2000001077027124',
         * productId: 'annual',
         * receiptData: 18567
         *
         * Details:
         * expiresDate: 2025-12-09T10:08:17.000Z,
         * autoRenewStatus: 0,
         * gracePeriodExpiresDate: null
         */
        case AppleNotificationType.EXPIRED:
          // 구독 만료
          await this.expireSubscription(
            transactionInfo.originalTransactionId,
            AppleNotificationType.EXPIRED,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
          );
        //TEST:  ✅ ❌

        case AppleNotificationType.REFUND:
          // 환불 (즉시 권한 회수)
          await this.refundSubscription({
            originalTransactionId: transactionInfo.originalTransactionId,
            refundDate: new Date(transactionInfo.revocationDate || Date.now()),
            refundReason: transactionInfo.revocationReason?.toString(),
            eventType: AppleNotificationType.REFUND,
            price: actualPrice,
            currency: transactionInfo.currency,
            receiptData: dto.signedPayload,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_REFUNDED,
          );
        //TEST:  ✅ ❌

        case AppleNotificationType.GRACE_PERIOD_EXPIRED:
          // 유예 기간 만료 -> 구독 만료 처리
          await this.expireSubscription(
            transactionInfo.originalTransactionId,
            AppleNotificationType.GRACE_PERIOD_EXPIRED,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
          );

        //TEST:  ✅ ❌
        case AppleNotificationType.REFUND_REVERSED:
          // 환불 취소 -> 구독 복원
          await this.recoverSubscription(
            transactionInfo.originalTransactionId,
            new Date(transactionInfo.expiresDate),
            AppleNotificationType.REFUND_REVERSED,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_RESUMED,
          );
        //TEST:  ✅

        case AppleNotificationType.REVOKE:
          // 가족 공유 액세스 취소 - 구독 만료 처리
          console.log('[Apple Webhook] REVOKE - Family sharing access revoked');
          await this.expireSubscription(
            transactionInfo.originalTransactionId,
            AppleNotificationType.REVOKE,
            dto.signedPayload,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
          );

        case AppleNotificationType.TEST:
          // 테스트 알림 - 로깅만
          console.log('[Apple Webhook] Test notification received.');
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
          );

        default:
          // 기타 이벤트 (로깅만)
          console.log(
            `[Apple Webhook] Unhandled event: ${payload.notificationType}`,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
          );
      }
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.APPLE_WEBHOOK_PROCESS_FAILED,
        error,
        {
          signedPayloadLength: dto.signedPayload?.length,
        },
      );
      return generateErrorResponse(
        `${ERROR_MESSAGE.PAYMENT.WEBHOOK_PROCESSING_FAILED}: ${error.message}`,
      );
    }
  }

  /**
   * @summary Google 웹훅 처리
   * @description Google Play Real-time Developer Notifications 웹훅을 처리합니다
   * @route POST /payment/webhook/google
   * @access public
   * @body GoogleWebhookReqDto
   * @response CommonResponse<WebhookResultDataDto>
   */
  async handleGoogleWebhook(
    dto: GoogleWebhookReqDto,
  ): Promise<CommonResponse<WebhookResultDataDto>> {
    try {
      // Base64 디코딩
      const decodedData = Buffer.from(dto.message.data, 'base64').toString(
        'utf-8',
      );
      const notification: GoogleDeveloperNotification = JSON.parse(decodedData);

      // 테스트 알림 처리
      if (notification.testNotification) {
        console.log('[Google Webhook] Test notification received');
        return generateSuccessResponse(
          {},
          SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
        );
      }

      // 구독 알림만 처리
      if (!notification.subscriptionNotification) {
        return generateSuccessResponse(
          {},
          SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
        );
      }

      const subNotification = notification.subscriptionNotification;

      // 디버깅 로그 1
      console.log('[Google Webhook] Received:', {
        ...subNotification,
        notificationType: subNotification.notificationType,
        subscriptionId: subNotification.subscriptionId,
        purchaseToken: subNotification.purchaseToken?.substring(0, 20) + '...',
      });

      // Google Play Developer API로 상세 정보 조회
      const subscriptionDetails = await this.getGoogleSubscriptionDetails(
        subNotification.subscriptionId,
        subNotification.purchaseToken,
      );

      if (!subscriptionDetails) {
        return generateErrorResponse(
          ERROR_MESSAGE.PAYMENT.WEBHOOK_INVALID_PAYLOAD,
        );
      }

      // 원본 주문 ID 추출 (갱신 시 ..0, ..1 등이 붙으므로 제거)
      const originalOrderId = this.extractGoogleOriginalOrderId(
        subscriptionDetails.orderId,
      );

      // 디버깅 로그 2
      console.log('[Google Webhook] Details:', {
        orderId: subscriptionDetails.orderId,
        originalOrderId: originalOrderId,
        basePlanId: subscriptionDetails.basePlanId,
        offerId: subscriptionDetails.offerId,
        promotionCode: subscriptionDetails.promotionCode,
        isTrialPeriod: subscriptionDetails.isTrialPeriod,
        expiryDate: subscriptionDetails.expiryDate,
        autoRenewing: subscriptionDetails.autoRenewing,
        subscriptionState: subscriptionDetails.subscriptionState,
        cancelReason: subscriptionDetails.cancelReason,
        obfuscatedAccountId:
          subscriptionDetails.obfuscatedExternalAccountId || undefined, // UUID로 유저 식별
      });

      // 이벤트 타입별 처리
      const eventTypeString = this.googleNotificationTypeToString(
        subNotification.notificationType,
      );

      console.log(subNotification.notificationType, 'checkNotification');
      switch (subNotification.notificationType) {
        case GoogleNotificationType.SUBSCRIPTION_PURCHASED:
          // 구독 시작
          await this.activateSubscription({
            originalTransactionId: originalOrderId,
            transactionId: subscriptionDetails.orderId,
            expiryDate: subscriptionDetails.expiryDate,
            purchaseDate: subscriptionDetails.startDate,
            productId:
              subscriptionDetails.productId || subNotification.subscriptionId,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
            platform: PaymentPlatformEnum.GOOGLE_PLAY,
            purchaseToken: subNotification.purchaseToken,
            promotionCode: subscriptionDetails.promotionCode,
            isTrialPeriod: subscriptionDetails.isTrialPeriod,
            trialEndDate: subscriptionDetails.isTrialPeriod
              ? subscriptionDetails.expiryDate
              : null,
            obfuscatedAccountId:
              subscriptionDetails.obfuscatedExternalAccountId || undefined, // UUID로 유저 식별
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_ACTIVATED,
          );

        case GoogleNotificationType.SUBSCRIPTION_RENEWED:
          // 구독 갱신
          await this.renewSubscription({
            originalTransactionId: originalOrderId,
            transactionId: subscriptionDetails.orderId,
            expiryDate: subscriptionDetails.expiryDate,
            purchaseDate: subscriptionDetails.startDate,
            productId:
              subscriptionDetails.productId || subNotification.subscriptionId,
            promotionCode: subscriptionDetails.promotionCode,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_RENEWED,
          );

        case GoogleNotificationType.SUBSCRIPTION_CANCELED:
          // 구독 취소 (자동 갱신 OFF)
          await this.updateAutoRenewStatus(
            originalOrderId,
            false,
            eventTypeString,
            decodedData,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_CANCELLED,
          );

        case GoogleNotificationType.SUBSCRIPTION_IN_GRACE_PERIOD:
          // Grace Period 진입
          await this.enterGracePeriod({
            originalTransactionId: originalOrderId,
            gracePeriodExpiryDate: subscriptionDetails.expiryDate,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.GRACE_PERIOD_ENTERED,
          );

        case GoogleNotificationType.SUBSCRIPTION_ON_HOLD:
          // Account Hold 진입 [Google 전용]
          await this.enterAccountHold(
            originalOrderId,
            eventTypeString,
            decodedData,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.ACCOUNT_HOLD_ENTERED,
          );

        case GoogleNotificationType.SUBSCRIPTION_PAUSED:
          // 일시정지 [Google 전용]
          // V2 API에서는 pausedStateContext.autoResumeTime으로 resumeDate 제공
          await this.pauseSubscription({
            originalTransactionId: originalOrderId,
            resumeDate:
              subscriptionDetails.resumeDate || subscriptionDetails.expiryDate,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_PAUSED,
          );

        case GoogleNotificationType.SUBSCRIPTION_RECOVERED:
        case GoogleNotificationType.SUBSCRIPTION_RESTARTED:
          // 복구 (Account Hold/Pause에서 복구 또는 취소된 구독 재활성화)
          await this.recoverSubscription(
            originalOrderId,
            subscriptionDetails.expiryDate,
            eventTypeString,
            decodedData,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_RESUMED,
          );

        case GoogleNotificationType.SUBSCRIPTION_EXPIRED:
          // 구독 만료
          await this.expireSubscription(
            originalOrderId,
            eventTypeString,
            decodedData,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_EXPIRED,
          );

        case GoogleNotificationType.SUBSCRIPTION_REVOKED:
          // 환불/취소 (즉시 권한 회수)
          await this.refundSubscription({
            originalTransactionId: originalOrderId,
            refundDate: new Date(),
            refundReason: subscriptionDetails.cancelReason || undefined,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_REFUNDED,
          );

        case GoogleNotificationType.SUBSCRIPTION_DEFERRED:
          // 구독 기간 연장 (개발자가 연장)
          await this.renewSubscription({
            originalTransactionId: originalOrderId,
            transactionId: subscriptionDetails.orderId,
            expiryDate: subscriptionDetails.expiryDate,
            purchaseDate: subscriptionDetails.startDate,
            productId:
              subscriptionDetails.productId || subNotification.subscriptionId,
            promotionCode: subscriptionDetails.promotionCode,
            eventType: eventTypeString,
            price: subscriptionDetails.priceAmountMicros
              ? subscriptionDetails.priceAmountMicros / 1000000
              : undefined,
            currency: subscriptionDetails.priceCurrencyCode || undefined,
            receiptData: decodedData,
          });
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.SUBSCRIPTION_RENEWED,
          );

        default:
          console.log(
            `[Google Webhook] Unhandled event: ${subNotification.notificationType}`,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.PAYMENT.WEBHOOK_PROCESSED,
          );
      }
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.GOOGLE_WEBHOOK_PROCESS_FAILED,
        error,
        {
          messageId: dto.message?.messageId,
          dataLength: dto.message?.data?.length,
        },
      );
      return generateErrorResponse(
        `${ERROR_MESSAGE.PAYMENT.WEBHOOK_PROCESSING_FAILED}: ${error.message}`,
      );
    }
  }

  // ================================================
  // ========== 공통 구독 처리 메서드 (Private) ==========
  // ================================================

  /**
   * 구독 활성화 (Apple: SUBSCRIBED, Google: SUBSCRIPTION_PURCHASED)
   */
  private async activateSubscription(
    params: SubscriptionUpdateParams,
  ): Promise<void> {
    // appAccountToken 또는 obfuscatedAccountId로 유저 찾기
    let userId: number | null = null;
    const paymentUUID = params.appAccountToken || params.obfuscatedAccountId;

    if (paymentUUID) {
      const user = await this.prisma.user.findUnique({
        where: { paymentUUID },
      });
      if (user) {
        userId = user.id;
        console.log(
          `[Payment] Found user by paymentUUID: ${paymentUUID} -> userId: ${userId}`,
        );
      }
    }

    let trackedPayment: TrackablePayment | null = null;

    await this.prisma.$transaction(async (tx) => {
      const upsertedPayment = await tx.payment.upsert({
        where: { originalTransactionId: params.originalTransactionId },
        update: {
          status: PurchaseStatusEnum.ACTIVE,
          expiryDate: params.expiryDate,
          transactionId: params.transactionId,
          purchaseDate: params.purchaseDate,
          productId: params.productId,
          autoRenewStatus: true,
          gracePeriodExpiryDate: null,
          resumeDate: null,
          purchaseToken: params.purchaseToken || undefined,
          isTrialPeriod: params.isTrialPeriod ?? false,
          trialEndDate: params.trialEndDate ?? null,
          ...(params.promotionCode
            ? { promotionCode: params.promotionCode }
            : {}),
          // userId가 있고, 기존에 userId가 null인 경우에만 업데이트
          ...(userId ? { userId } : {}),
        },
        create: {
          platform: params.platform || PaymentPlatformEnum.GOOGLE_PLAY,
          status: PurchaseStatusEnum.ACTIVE,
          originalTransactionId: params.originalTransactionId,
          transactionId: params.transactionId,
          productId: params.productId,
          purchaseDate: params.purchaseDate,
          expiryDate: params.expiryDate,
          autoRenewStatus: true,
          receipt: params.receiptData,
          purchaseToken: params.purchaseToken,
          promotionCode: params.promotionCode ?? null,
          isTrialPeriod: params.isTrialPeriod ?? false,
          trialEndDate: params.trialEndDate ?? null,
          userId: userId, // paymentUUID로 찾은 userId 연결
        },
      });
      trackedPayment = upsertedPayment;

      // userId가 있을 때만 PaymentHistory 생성 (PaymentHistory.userId는 필수)
      if (upsertedPayment.userId) {
        await tx.paymentHistory.create({
          data: this.buildPaymentHistoryData(upsertedPayment, {
            eventType: params.eventType,
            receiptData: params.receiptData,
            price: params.price,
            currency: params.currency,
          }),
        });
      }
    });

    if (trackedPayment) {
      this.trackSubscriptionEvent({
        eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_ACTIVATED,
        payment: trackedPayment,
        eventType: params.eventType,
        price: params.price,
        currency: params.currency,
        paymentUUID,
      });
    }

    // Discord 알림 전송 (트랜잭션 완료 후)
    this.discordService
      .sendSubscriptionActivatedNotification({
        userId,
        paymentUUID,
        originalTransactionId: params.originalTransactionId,
        transactionId: params.transactionId,
        productId: params.productId,
        platform: params.platform || PaymentPlatformEnum.GOOGLE_PLAY,
        purchaseDate: params.purchaseDate,
        expiryDate: params.expiryDate,
        isTrialPeriod: params.isTrialPeriod,
        price: params.price,
        currency: params.currency,
      })
      .catch((error) => {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.PAYMENT.DISCORD_NOTIFICATION_SEND_FAILED,
          error,
          {
            userId,
            paymentUUID,
            originalTransactionId: params.originalTransactionId,
            transactionId: params.transactionId,
            productId: params.productId,
            platform: params.platform || PaymentPlatformEnum.GOOGLE_PLAY,
          },
        );
      });
  }

  /**
   * 구독 갱신 (Apple: DID_RENEW, Google: SUBSCRIPTION_RENEWED)
   */
  private async renewSubscription(
    params: SubscriptionUpdateParams,
  ): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      params.originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.ACTIVE,
            expiryDate: params.expiryDate,
            autoRenewStatus: true,
            purchaseDate: params.purchaseDate,
            transactionId: params.transactionId,
            productId: params.productId,
            gracePeriodExpiryDate: null,
            resumeDate: null,
            ...(params.promotionCode
              ? { promotionCode: params.promotionCode }
              : {}),
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType: params.eventType,
          receiptData: params.receiptData,
          price: params.price,
          currency: params.currency,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_RENEWED,
          payment: trackedPayment,
          eventType: params.eventType,
          price: params.price,
          currency: params.currency,
        });
      }
    }
  }

  /**
   * 자동 갱신 상태 변경 (Apple: DID_CHANGE_RENEWAL_STATUS, Google: SUBSCRIPTION_CANCELED)
   * 주의: 즉시 권한 회수 ❌, 만료일까지 서비스 유지
   */
  private async updateAutoRenewStatus(
    originalTransactionId: string,
    autoRenewEnabled: boolean,
    eventType: string,
    receiptData?: string,
  ): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            autoRenewStatus: autoRenewEnabled,
            autoRenewChangedAt: new Date(), // 이벤트 받은 시간.
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType,
          receiptData,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: autoRenewEnabled
            ? MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_AUTO_RENEW_ENABLED
            : MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_CANCELLED,
          payment: trackedPayment,
          eventType,
        });
      }
    }
  }

  /**
   * Grace Period 진입 (Apple: DID_FAIL_TO_RENEW, Google: SUBSCRIPTION_IN_GRACE_PERIOD)
   * 권한 유지하며 재결제 대기
   */
  private async enterGracePeriod(params: GracePeriodParams): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      params.originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.GRACE_PERIOD,
            gracePeriodExpiryDate: params.gracePeriodExpiryDate,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType: params.eventType,
          receiptData: params.receiptData,
          price: params.price,
          currency: params.currency,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_GRACE_PERIOD_ENTERED,
          payment: trackedPayment,
          eventType: params.eventType,
          price: params.price,
          currency: params.currency,
        });
      }
    }
  }

  /**
   * Account Hold 진입 [Google 전용] (SUBSCRIPTION_ON_HOLD)
   * 권한 회수, 최대 30일간 재결제 대기
   */
  private async enterAccountHold(
    originalTransactionId: string,
    eventType: string,
    receiptData?: string,
  ): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.ACCOUNT_HOLD,
            gracePeriodExpiryDate: null,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType,
          receiptData,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_ACCOUNT_HOLD_ENTERED,
          payment: trackedPayment,
          eventType,
        });
      }
    }
  }

  /**
   * 구독 일시정지 [Google 전용] (SUBSCRIPTION_PAUSED)
   */
  private async pauseSubscription(params: PauseParams): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      params.originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.PAUSED,
            resumeDate: params.resumeDate,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType: params.eventType,
          receiptData: params.receiptData,
          price: params.price,
          currency: params.currency,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_PAUSED,
          payment: trackedPayment,
          eventType: params.eventType,
          price: params.price,
          currency: params.currency,
        });
      }
    }
  }

  /**
   * 구독 복구 (Apple: REFUND_REVERSED, Google: SUBSCRIPTION_RECOVERED/RESTARTED)
   */
  private async recoverSubscription(
    originalTransactionId: string,
    expiryDate: Date,
    eventType: string,
    receiptData?: string,
  ): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.ACTIVE,
            expiryDate,
            autoRenewStatus: true,
            gracePeriodExpiryDate: null,
            resumeDate: null,
            refundDate: null,
            refundReason: null,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType,
          receiptData,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_RECOVERED,
          payment: trackedPayment,
          eventType,
        });
      }
    }
  }

  /**
   * 구독 만료 (Apple: EXPIRED, Google: SUBSCRIPTION_EXPIRED)
   *
   */
  private async expireSubscription(
    originalTransactionId: string,
    eventType: string,
    receiptData?: string,
  ): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.EXPIRED,
            autoRenewStatus: false,
            gracePeriodExpiryDate: null,
            resumeDate: null,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType,
          receiptData,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_EXPIRED,
          payment: trackedPayment,
          eventType,
        });
      }
    }
  }

  /**
   * 환불 처리 (Apple: REFUND, Google: SUBSCRIPTION_REVOKED)
   */
  private async refundSubscription(params: RefundParams): Promise<void> {
    const payment = await this.findPaymentByOriginalTransactionId(
      params.originalTransactionId,
    );

    if (payment) {
      let trackedPayment: TrackablePayment | null = null;

      await this.prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PurchaseStatusEnum.REFUNDED,
            refundDate: params.refundDate,
            refundReason: params.refundReason,
            autoRenewStatus: false,
          },
        });
        trackedPayment = updatedPayment;

        // userId가 null인 경우 PaymentHistory 생성 건너뛰기
        const historyData = this.buildPaymentHistoryData(updatedPayment, {
          eventType: params.eventType,
          receiptData: params.receiptData,
          price: params.price,
          currency: params.currency,
        });

        if (historyData) {
          await tx.paymentHistory.create({ data: historyData });
        }
      });

      if (trackedPayment) {
        this.trackSubscriptionEvent({
          eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_REFUNDED,
          payment: trackedPayment,
          eventType: params.eventType,
          price: params.price,
          currency: params.currency,
        });
      }
    }
  }

  // ========== Helper Methods ==========

  /**
   * Payment 객체를 PaymentHistory 생성 데이터로 변환
   */
  private buildPaymentHistoryData(
    payment: {
      id: number;
      userId: number | null;
      platform: PaymentPlatformEnum;
      transactionId: string;
      productId: string;
      promotionCode: string | null;
      status: PurchaseStatusEnum;
      purchaseDate: Date;
      expiryDate: Date;
      autoRenewStatus: boolean;
      gracePeriodExpiryDate: Date | null;
      refundDate: Date | null;
      refundReason: string | null;
    },
    additionalData: {
      eventType: string;
      receiptData?: string;
      price?: number;
      currency?: string;
    },
  ) {
    // userId가 null인 경우 null 반환 (PaymentHistory 생성 불가)
    if (payment.userId === null) {
      return null;
    }

    return {
      payment: { connect: { id: payment.id } },
      user: { connect: { id: payment.userId } },
      platform: payment.platform,
      transactionId: payment.transactionId,
      productId: payment.productId,
      promotionCode: payment.promotionCode,
      status: payment.status,
      purchaseDate: payment.purchaseDate,
      expiryDate: payment.expiryDate,
      autoRenewStatus: payment.autoRenewStatus,
      gracePeriodExpiryDate: payment.gracePeriodExpiryDate,
      refundDate: payment.refundDate,
      refundReason: payment.refundReason,
      ...additionalData,
    };
  }

  private appleVerifier?: SignedDataVerifier;

  private requireAppleVerifier(): SignedDataVerifier {
    this.appleVerifier ??= createAppleVerifier(this.configService);
    return this.appleVerifier;
  }

  private async verifyAppleTransaction(jws: string) {
    const payload =
      await this.requireAppleVerifier().verifyAndDecodeTransaction(jws);
    // 공식 타입의 선택 필드 중 구독 저장에 필요한 값은 별도로 요구한다.
    if (
      !payload.transactionId ||
      !payload.originalTransactionId ||
      !payload.productId ||
      !Number.isFinite(payload.purchaseDate) ||
      !Number.isFinite(payload.expiresDate) ||
      !Number.isFinite(new Date(payload.purchaseDate).getTime()) ||
      !Number.isFinite(new Date(payload.expiresDate).getTime())
    ) {
      throw new Error(ERROR_MESSAGE.PAYMENT.INVALID_JWS_FORMAT);
    }
    return payload;
  }

  /**
   * originalTransactionId로 결제 정보 조회
   */
  private async findPaymentByOriginalTransactionId(
    originalTransactionId: string,
    userId?: number,
  ): Promise<{ id: number; userId: number } | null> {
    // originalTransactionId로 조회 (unique)
    let payment = await this.prisma.payment.findUnique({
      where: { originalTransactionId },
      select: { id: true, userId: true },
    });
    console.log('foundPayment', payment, userId);

    // userId 검증 (제공된 경우)
    if (payment && userId && payment.userId !== userId) {
      return null;
    }

    // Google: transactionId(orderId)로도 조회
    if (!payment) {
      payment = await this.prisma.payment.findUnique({
        where: { transactionId: originalTransactionId },
        select: { id: true, userId: true },
      });

      // userId 검증 (제공된 경우)
      if (payment && userId && payment.userId !== userId) {
        return null;
      }
    }

    return payment;
  }

  /**
   * V2 응답에서 추출한 구독 상세 정보 (webhook 등에서 사용하기 편한 flat 구조)
   */
  private extractGoogleSubscriptionInfo(
    data: GoogleReceiptResponseV2,
    purchaseToken?: string,
  ): {
    orderId: string;
    productId: string;
    basePlanId: string;
    offerId: string | null;
    promotionCode: string | null;
    isTrialPeriod: boolean;
    expiryDate: Date;
    startDate: Date;
    autoRenewing: boolean;
    priceAmountMicros: number | null;
    priceCurrencyCode: string | null;
    subscriptionState: GoogleSubscriptionState;
    cancelReason: string | null;
    resumeDate: Date | null;
    obfuscatedExternalAccountId: string | null; // 유저 식별용 UUID
  } {
    const lineItem = data.lineItems?.[0];
    this.requireConfiguredProduct(lineItem?.productId);
    const recurringPrice = lineItem?.autoRenewingPlan?.recurringPrice;

    // 가격 계산: units + nanos (units는 정수 부분, nanos는 10^-9 단위)
    let priceAmountMicros: number | null = null;
    if (recurringPrice) {
      const units = parseInt(recurringPrice.units || '0', 10);
      const nanos = recurringPrice.nanos || 0;
      priceAmountMicros = units * 1000000 + Math.round(nanos / 1000);
    }

    // 취소 사유 추출
    let cancelReason: string | null = null;
    if (data.canceledStateContext) {
      if (data.canceledStateContext.userInitiatedCancellation)
        cancelReason = 'USER_CANCELED';
      else if (data.canceledStateContext.systemInitiatedCancellation)
        cancelReason = 'SYSTEM_CANCELED';
      else if (data.canceledStateContext.developerInitiatedCancellation)
        cancelReason = 'DEVELOPER_CANCELED';
      else if (data.canceledStateContext.replacementCancellation)
        cancelReason = 'REPLACEMENT';
    }

    // offerId 및 무료 체험 여부 확인
    const offerId = lineItem?.offerDetails?.offerId || null;
    const offerTags = lineItem?.offerDetails?.offerTags || [];
    const hasTrialOffer = !!offerId; // offerId가 있으면 프로모션/무료 체험 오퍼 적용됨
    const hasTrialTag = offerTags.some(
      (tag: string) =>
        tag.toLowerCase().includes('trial') ||
        tag.toLowerCase().includes('free'),
    );
    const isTrialPeriod = hasTrialOffer || hasTrialTag;

    // obfuscatedExternalAccountId 추출 (유저 식별용)
    const obfuscatedExternalAccountId =
      data.externalAccountIdentifiers?.obfuscatedExternalAccountId || null;

    return {
      orderId: this.resolveGoogleOrderId(data, purchaseToken),
      productId: lineItem?.productId || '',
      basePlanId: lineItem?.offerDetails?.basePlanId || '',
      offerId,
      promotionCode: this.getGooglePromotionCode(lineItem),
      isTrialPeriod,
      expiryDate: new Date(lineItem?.expiryTime || data.startTime),
      startDate: new Date(data.startTime),
      autoRenewing: lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false,
      priceAmountMicros,
      priceCurrencyCode: recurringPrice?.currencyCode || null,
      subscriptionState: data.subscriptionState,
      cancelReason,
      resumeDate: data.pausedStateContext?.autoResumeTime
        ? new Date(data.pausedStateContext.autoResumeTime)
        : null,
      obfuscatedExternalAccountId,
    };
  }

  /**
   * Google Play Developer API V2로 구독 상세 정보 조회
   * https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
   */
  private async getGoogleSubscriptionDetails(
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<ReturnType<typeof this.extractGoogleSubscriptionInfo> | null> {
    try {
      const accessToken = await this.getGoogleAccessToken();
      const packageName = this.configService.get<string>(
        envVariableKeys.BUNDLE_ID,
      );
      // V2 API 엔드포인트 (subscriptionId는 더 이상 URL에 필요하지 않음)
      const googleUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

      this.logger.log('[Google Payment] Fetching subscription details', {
        subscriptionId,
        packageName,
        purchaseTokenLength: purchaseToken.length,
        purchaseTokenMasked: maskValue(purchaseToken),
      });

      const response = await axios.get<GoogleReceiptResponseV2>(googleUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      this.logger.log(
        '[Google Payment] Subscription details response received',
        {
          subscriptionId,
          packageName,
          subscriptionState: response.data.subscriptionState,
          latestOrderId: response.data.latestOrderId,
          lineItemCount: response.data.lineItems?.length ?? 0,
        },
      );

      return this.extractGoogleSubscriptionInfo(response.data, purchaseToken);
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.PAYMENT.GOOGLE_SUBSCRIPTION_DETAILS_FETCH_FAILED,
        error,
        {
          subscriptionId,
          purchaseTokenLength: purchaseToken.length,
          purchaseTokenMasked: maskValue(purchaseToken),
        },
      );
      return null;
    }
  }

  /**
   * Google orderId에서 원본 주문 ID 추출
   * 갱신 시 orderId 형식: GPA.xxxx-xxxx-xxxx-xxxxx..0, ..1, ..2 등
   * 첫 구매 시: GPA.xxxx-xxxx-xxxx-xxxxx (..없음)
   * Apple의 originalTransactionId와 동일한 역할
   */
  private extractGoogleOriginalOrderId(orderId: string): string {
    if (!orderId.startsWith('GPA.')) {
      return orderId;
    }

    const dotIndex = orderId.indexOf('..');
    return dotIndex !== -1 ? orderId.substring(0, dotIndex) : orderId;
  }

  private resolveGoogleOrderId(
    data: GoogleReceiptResponseV2,
    purchaseToken?: string,
  ): string {
    const lineItemOrderId = data.lineItems?.find(
      (lineItem) => lineItem.latestSuccessfulOrderId,
    )?.latestSuccessfulOrderId;
    const orderId = lineItemOrderId || data.latestOrderId;

    if (orderId) {
      return orderId;
    }

    if (purchaseToken) {
      return `google-token:${purchaseToken}`;
    }

    throw new Error('Google subscription order id is missing');
  }

  /**
   * Google Notification Type을 문자열로 변환
   */
  private googleNotificationTypeToString(type: number): string {
    return GoogleNotificationType[type] || `UNKNOWN_TYPE_${type}`;
  }
}
