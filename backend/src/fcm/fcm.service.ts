import { envVariableKeys } from '@/common/constants/env';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { PUSH_MESSAGE } from '@/common/constants/push';
import { CommonResponse } from '@/common/dto/res.dto';
import {
  generateErrorResponse,
  generateSuccessResponse,
} from '@/common/helper/format';
import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { MIXPANEL_SERVER_EVENTS } from '@/mixpanel/constants';
import { MixpanelService } from '@/mixpanel/mixpanel.service';
import { Payload } from '../auth/utils/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFcmReqDto } from './dto/req.dto';
import { DevTestPushBroadcastResDto, FcmTokenResDto } from './dto/res.dto';

const DEV_NODE_ENV_VALUES = new Set(['dev', 'development']);
const INVALID_FCM_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

function getFirebaseMessagingErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;

  if (typeof errorRecord.code === 'string') {
    return errorRecord.code;
  }

  const errorInfo = errorRecord.errorInfo;

  if (typeof errorInfo !== 'object' || errorInfo === null) {
    return undefined;
  }

  const errorInfoRecord = errorInfo as Record<string, unknown>;

  return typeof errorInfoRecord.code === 'string'
    ? errorInfoRecord.code
    : undefined;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private devTestBroadcastEnabled = false;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly mixpanelService: MixpanelService,
  ) {}

  onModuleInit() {
    const keys = [
      envVariableKeys.FIREBASE_PROJECT_ID,
      envVariableKeys.FIREBASE_CLIENT_EMAIL,
      envVariableKeys.FIREBASE_PRIVATE_KEY,
    ];
    if (!keys.every((key) => this.configService.get<string>(key)?.trim()))
      return;
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.get<string>(
            envVariableKeys.FIREBASE_PROJECT_ID,
          ),
          clientEmail: this.configService.get<string>(
            envVariableKeys.FIREBASE_CLIENT_EMAIL,
          ),
          privateKey: this.configService
            .get<string>(envVariableKeys.FIREBASE_PRIVATE_KEY)
            ?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  private requireMessaging() {
    if (!admin.apps.length)
      throw new ServiceUnavailableException('FCM is not configured');
    return admin.messaging();
  }

  private isDevEnvironment() {
    const nodeEnv =
      this.configService.get<string>(envVariableKeys.NODE_ENV) ??
      process.env.NODE_ENV ??
      '';

    return DEV_NODE_ENV_VALUES.has(nodeEnv.toLowerCase());
  }

  private assertDevEnvironment() {
    if (!this.isDevEnvironment()) {
      throw new ForbiddenException(ERROR_MESSAGE.FCM.DEV_ONLY_ENDPOINT);
    }
  }

  private async deactivateInvalidToken(
    fcmToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.prisma.fcmToken.updateMany({
        where: { fcmToken, isActive: true },
        data: { isActive: false },
      });

      this.logger.warn(
        INTERNAL_ERROR_MESSAGE.FCM.INVALID_TOKEN_DEACTIVATED(
          errorCode,
          fcmToken.length,
        ),
      );
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.FCM.INVALID_TOKEN_DEACTIVATE_FAILED,
        error,
        {
          errorCode,
          fcmTokenLength: fcmToken.length,
        },
      );
    }
  }

  private async sendPushBatch(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    image?: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    if (fcmTokens.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const results = await Promise.allSettled(
      fcmTokens.map((fcmToken) =>
        this.sendPush(fcmToken, title, body, data, image),
      ),
    );

    const successCount = results.filter(
      (result) => result.status === 'fulfilled' && result.value !== null,
    ).length;

    return {
      successCount,
      failureCount: results.length - successCount,
    };
  }

  private async sendDevTestBroadcast(): Promise<
    Omit<DevTestPushBroadcastResDto, 'enabled'>
  > {
    const tokens = await this.prisma.fcmToken.findMany({
      where: {
        isActive: true,
        user: {
          isDeleted: false,
        },
      },
      select: {
        fcmToken: true,
        userId: true,
      },
    });

    const { successCount, failureCount } = await this.sendPushBatch(
      tokens.map(({ fcmToken }) => fcmToken),
      PUSH_MESSAGE.DEV_TEST_BROADCAST.TITLE,
      PUSH_MESSAGE.DEV_TEST_BROADCAST.BODY,
      {
        type: 'dev_test_broadcast',
      },
    );

    return {
      targetUserCount: new Set(tokens.map(({ userId }) => userId)).size,
      targetTokenCount: tokens.length,
      successCount,
      failureCount,
    };
  }

  /**
   * @summary FCM 토큰 생성/업데이트
   * @description FCM 토큰으로 조회 후 없으면 생성, 있으면 업데이트
   * @access Normal
   * @route POST /fcm/create
   * @body CreateFcmReqDto
   * @response CommonResponse<FcmTokenResDto>
   */
  async createFcm(
    dto: CreateFcmReqDto,
    user: Payload,
  ): Promise<CommonResponse<FcmTokenResDto>> {
    // userId가 User 테이블에 존재하는지 확인
    const existingUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!existingUser) {
      return generateErrorResponse(ERROR_MESSAGE.AUTH.USER_NOT_FOUND);
    }

    // upsert로 race condition 방지
    const fcmToken = await this.prisma.fcmToken.upsert({
      where: { fcmToken: dto.fcmToken },
      update: {
        deviceType: dto.deviceType,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        lastActiveAt: new Date(),
        userId: user.id,
      },
      create: {
        fcmToken: dto.fcmToken,
        deviceType: dto.deviceType,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        lastActiveAt: new Date(),
        userId: user.id,
      },
    });

    return generateSuccessResponse(fcmToken as FcmTokenResDto);
  }

  /**
   * @description 단일 기기에 푸시 알림 전송 (내부 사용)
   */
  async sendPush(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    image?: string,
  ): Promise<string | null> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: { title, body, imageUrl: image },
        data: data || {},
        android: {
          priority: 'high',
          notification: { sound: 'default', imageUrl: image },
        },
        apns: {
          payload: { aps: { sound: 'default', 'mutable-content': 1 } },
          fcmOptions: { imageUrl: image },
        },
      };

      const response = await this.requireMessaging().send(message);
      console.log('푸시 전송 성공:', response);
      return response;
    } catch (error) {
      const errorCode = getFirebaseMessagingErrorCode(error);

      if (errorCode && INVALID_FCM_TOKEN_ERROR_CODES.has(errorCode)) {
        await this.deactivateInvalidToken(fcmToken, errorCode);
        return null;
      }

      this.logger.error(INTERNAL_ERROR_MESSAGE.FCM.SEND_PUSH_FAILED, error, {
        fcmTokenLength: fcmToken.length,
        title,
        data,
        hasImage: Boolean(image),
      });
      return null;
    }
  }

  /**
   * @description 특정 사용자의 모든 기기에 푸시 알림 전송 (내부 사용)
   */
  async sendPushToUser(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, string>,
    image?: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    const tokens = await this.prisma.fcmToken.findMany({
      where: { userId, isActive: true },
      select: { fcmToken: true },
    });

    if (tokens.length === 0) {
      console.log(`사용자 ${userId}의 활성 FCM 토큰이 없습니다.`);
      return { successCount: 0, failureCount: 0 };
    }

    const notificationId = randomUUID();
    const notificationData = { ...data, notificationId };

    const { successCount, failureCount } = await this.sendPushBatch(
      tokens.map(({ fcmToken }) => fcmToken),
      title,
      body,
      notificationData,
      image,
    );

    console.log(
      `사용자 ${userId}에게 푸시 전송 완료: 성공 ${successCount}, 실패 ${failureCount}`,
    );

    if (successCount > 0) {
      void this.mixpanelService.trackEvent({
        eventName: MIXPANEL_SERVER_EVENTS.NOTIFICATION_SENT,
        distinctId: userId,
        insertId: `notification_sent:${notificationId}`,
        properties: {
          user_id: userId,
          notification_id: notificationId,
          notification_type: data?.type ?? 'unknown',
          success_count: successCount,
          failure_count: failureCount,
          has_image: Boolean(image),
        },
      });
    }

    return { successCount, failureCount };
  }

  async sendScheduledDevTestBroadcast(): Promise<DevTestPushBroadcastResDto | null> {
    if (!this.isDevEnvironment()) {
      return null;
    }

    const result = await this.sendDevTestBroadcast();

    return {
      enabled: true,
      ...result,
    };
  }
}
