import * as crypto from 'crypto';
import { envVariableKeys } from '@/common/constants/env';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { SUCCESS_MESSAGE } from '@/common/constants/successMessage';
import { CommonResponse, SingleMessageDto } from '@/common/dto/res.dto';
import {
  generateErrorResponse,
  generateSuccessResponse,
} from '@/common/helper/format';
import { normalizeGeneratedNickname } from '@/common/utils/nickname';
import { MIXPANEL_SERVER_EVENTS } from '@/mixpanel/constants';
import { MixpanelService } from '@/mixpanel/mixpanel.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformEnum, Prisma, UserRole } from '@prisma/client';
import * as appleSignin from 'apple-signin-auth';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthOnboardingReqDto,
  AnonymousLoginReqDto,
  AppleLoginReqDto,
  AppleSignInWebhookReqDto,
  FacebookLoginReqDto,
  GoogleLoginReqDto,
  RefreshTokenReqDto,
  TesterLoginReqDto,
} from './dto/req.dto';
import {
  AppleSignInWebhookResDto,
  AuthTokenResDto,
  CheckUserExistsResDto,
} from './dto/res.dto';
import { userSelectedField } from './utils/constants';
import { Payload, TokenType } from './utils/types';

/**
 * Sign in with Apple Server-to-Server Notifications 페이로드
 * @see https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts
 * @see https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
 */
interface AppleSignInWebhookPayload {
  iss: string; // "https://appleid.apple.com"
  aud: string; // client_id (bundle_id)
  iat: number;
  jti: string;
  events: string; // JSON 문자열로 인코딩된 이벤트 정보
}

/**
 * Sign in with Apple 이벤트 타입
 * @see https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts
 *
 * - consent-revoked: 사용자가 앱에서 Apple로 로그인 사용 중지
 * - account-delete: 사용자가 Apple ID 삭제 (문서상 표기)
 * - account-deleted: 사용자가 Apple ID 삭제 (실제 프로덕션에서 수신되는 값)
 * - email-disabled: 이메일 릴레이 비활성화
 * - email-enabled: 이메일 릴레이 활성화
 */
interface AppleSignInEvent {
  type:
    | 'consent-revoked'
    | 'account-delete'
    | 'account-deleted'
    | 'email-disabled'
    | 'email-enabled';
  sub: string; // Apple User ID
  event_time: number;
}

interface AppleWebSignInConfig {
  clientId: string;
  redirectUri: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

function maskValue(
  value?: string | null,
  visiblePrefix = 4,
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

function maskEmail(email?: string | null) {
  if (!email) {
    return null;
  }

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return maskValue(email, 2, 2);
  }

  const maskedLocalPart =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}*`
      : `${localPart.slice(0, 2)}***`;

  return `${maskedLocalPart}@${domain}`;
}

function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    const serializedError: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      serializedError.stack = error.stack;
    }

    Object.entries(error as unknown as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (!(key in serializedError)) {
          serializedError[key] = value;
        }
      },
    );

    return serializedError;
  }

  if (error && typeof error === 'object') {
    return error;
  }

  return { value: error };
}

function serializeAxiosErrorForLog(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return serializeErrorForLog(error);
  }

  return {
    name: error.name,
    message: error.message,
    code: error.code ?? null,
    status: error.response?.status ?? null,
    data: error.response?.data ?? null,
  };
}

function getGoogleTokenDebugPayload(idToken: string) {
  const decodedToken = jwt.decode(idToken);

  if (
    !decodedToken ||
    typeof decodedToken !== 'object' ||
    Array.isArray(decodedToken)
  ) {
    return null;
  }

  const exp =
    typeof decodedToken.exp === 'number'
      ? new Date(decodedToken.exp * 1000).toISOString()
      : null;
  const iat =
    typeof decodedToken.iat === 'number'
      ? new Date(decodedToken.iat * 1000).toISOString()
      : null;

  return {
    aud: decodedToken.aud ?? null,
    azp: decodedToken.azp ?? null,
    iss: decodedToken.iss ?? null,
    exp,
    iat,
    emailMasked:
      typeof decodedToken.email === 'string'
        ? maskEmail(decodedToken.email)
        : null,
    subMasked:
      typeof decodedToken.sub === 'string' ? maskValue(decodedToken.sub) : null,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private appleJwksClient: jwksClient.JwksClient;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly discordService: DiscordService,
    private readonly mixpanelService: MixpanelService,
  ) {
    // Apple Sign in with Apple JWKS client 초기화
    this.appleJwksClient = jwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24시간
    });
  }

  /**
   * @summary Bearer 토큰 검증
   * @description
   * 1. Bearer 토큰 검증 및 사용자 정보 반환
   * 2. 권한: System (내부 호출)
   * 3. 로직 순서
   *   - Bearer 토큰에서 실제 토큰 추출
   *   - 토큰 타입(access/refresh) 확인
   *   - 해당 시크릿으로 토큰 검증
   *   - 토큰의 이메일로 사용자 존재 여부 확인
   * 4. 사용자 정보 반환
   * @access System
   * @route POST /auth/verify
   * @body bearerToken:string
   * @auth auth
   * @response CheckUserExistsResDto
   */
  async verifyBearerToken(bearerToken: string): Promise<CheckUserExistsResDto> {
    const token = bearerToken.replace('Bearer ', '');
    const decoded = await this.jwtService.decode(token);
    const tokenType = decoded.type;
    const data = await this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>(
        tokenType === 'refresh'
          ? envVariableKeys.JWT_REFRESH_SECRET
          : envVariableKeys.JWT_SECRET,
      ),
    });
    const user = await this.checkUserExists({
      email: data.email,
      throwErrorWhen: 'notExist',
    });
    return user;
  }

  /**
   * @summary Refresh 토큰으로 Access 토큰 갱신
   * @description Refresh 토큰을 검증하고 새로운 Access 토큰을 발급합니다
   * @access Public
   * @route POST /auth/refresh
   * @body RefreshTokenReqDto
   * @response AuthTokenResDto
   */
  async refreshAccessToken(dto: RefreshTokenReqDto): Promise<AuthTokenResDto> {
    const { refreshToken } = dto;
    // 1. 리프레시 토큰 검증
    let decoded: Payload;
    try {
      decoded = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>(
          envVariableKeys.JWT_REFRESH_SECRET,
        ),
      });
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }

    // 2. 토큰 타입 확인
    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }

    // 3. 사용자 존재 여부 확인
    const user = await this.checkUserExists({
      email: decoded.email,
      throwErrorWhen: 'notExist',
    });

    // 4. DB에 저장된 리프레시 토큰과 비교
    if (user.refreshToken !== refreshToken) {
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }

    // 5. 새로운 Access 토큰 발급
    const newAccessToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });

    // 6. 새로운 Refresh 토큰 발급
    const newRefreshToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    });

    // 7. 새로운 Refresh 토큰 DB에 저장
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  private async checkReferralCode(referralCode: string): Promise<void> {
    const referrer = await this.prisma.user.findFirst({
      where: { referral_code: referralCode, isDeleted: false },
      select: { id: true },
    });
    if (!referrer) {
      throw new BadRequestException(ERROR_MESSAGE.AUTH.REFERRAL_CODE_NOT_FOUND);
    }
  }

  private async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    do {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (await this.prisma.user.count({ where: { referral_code: code } }));
    return code;
  }

  private async createAccount(params: {
    data: Omit<Prisma.UserCreateInput, 'referral_code'>;
    onboarding?: AuthOnboardingReqDto;
    notifyDiscord?: boolean;
    trackMixpanel?: boolean;
  }) {
    const user = await this.prisma.user.create({
      data: {
        ...params.data,
        referral_code: await this.generateUniqueReferralCode(),
        alarmAllowed:
          params.onboarding?.alarmAllowed ?? params.data.alarmAllowed,
        timezone: params.onboarding?.timezone ?? params.data.timezone,
        nickName: normalizeGeneratedNickname(params.data.nickName),
      },
      select: userSelectedField,
    });
    if (params.notifyDiscord !== false)
      this.sendNewUserDiscordNotification({
        userId: user.id,
        email: params.data.email,
        authProvider: params.data.auth_provider,
        initialPlatform: params.data.initialPlatform ?? null,
        nickName: params.data.nickName,
      });
    if (params.trackMixpanel !== false)
      void this.mixpanelService.trackEvent({
        eventName: MIXPANEL_SERVER_EVENTS.SIGN_UP,
        distinctId: user.id,
        insertId: `sign_up:${user.id}`,
        properties: {
          user_id: user.id,
          auth_provider: params.data.auth_provider,
          initial_platform: params.data.initialPlatform ?? null,
        },
      });
    return user;
  }

  private sendNewUserDiscordNotification(data: {
    userId: number;
    email: string;
    authProvider: string;
    initialPlatform?: string | null;
    nickName?: string | null;
  }) {
    this.discordService.sendNewUserNotification(data).catch((error) => {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.NEW_USER_DISCORD_NOTIFICATION_FAILED,
        error,
        {
          userId: data.userId,
          authProvider: data.authProvider,
          initialPlatform: data.initialPlatform ?? null,
        },
      );
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(
      password,
      Number(this.configService.get<number>('HASH_ROUND')),
    );
  }

  /**@description 유저 존재 여부 확인 */
  public async checkUserExists({
    email,
    phone,
    throwErrorWhen,
  }: {
    email?: string;
    phone?: string;
    throwErrorWhen: 'exist' | 'notExist';
  }) {
    // 1. 파라미터 유효성 검사 추가
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    // 2. where 조건 동적 구성
    const whereCondition = {
      OR: [] as { email?: string; phone?: string }[],
    };

    if (email) {
      whereCondition.OR.push({ email });
    }
    if (phone) {
      whereCondition.OR.push({ phone });
    }

    const user = await this.prisma.user.findFirst({
      where: whereCondition,
      select: userSelectedField,
    });

    if (user && user.isDeleted) {
      throw new NotFoundException(ERROR_MESSAGE.AUTH.USER_DELETED);
    }
    // 유저 있을 경우 처리
    if (user && throwErrorWhen === 'exist') {
      throw new BadRequestException(ERROR_MESSAGE.AUTH.EMAIL_ALREADY_EXISTS);
    }

    if (!user && throwErrorWhen === 'notExist') {
      throw new NotFoundException(ERROR_MESSAGE.AUTH.USER_NOT_FOUND);
    }

    return user;
  }

  public generateToken({
    id,
    email,
    role,
    type,
  }: {
    id: number;
    email: string;
    role: UserRole;
    type: TokenType;
  }) {
    const secret = this.configService.get<string>(
      type === 'access'
        ? envVariableKeys.JWT_SECRET
        : envVariableKeys.JWT_REFRESH_SECRET,
    );
    return this.jwtService.sign(
      {
        id,
        type,
        email,
        role: role,
        createdAt: Date.now(),
      } satisfies Payload,
      {
        secret,
        expiresIn: type === 'access' ? '7d' : '90d',
      },
    );
  }

  /**
   * anonymous 사용자를 소셜 계정으로 연동
   */
  private async requireActiveAnonymousAccount(
    email: string,
    accessToken?: string,
  ) {
    if (!accessToken)
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    let proof: Payload & { exp?: number };
    try {
      proof = await this.jwtService.verifyAsync(accessToken, {
        secret: this.configService.get<string>(envVariableKeys.JWT_SECRET),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }
    if (
      proof.type !== 'access' ||
      proof.email !== email ||
      !Number.isInteger(proof.id) ||
      typeof proof.exp !== 'number'
    ) {
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }
    const account = await this.prisma.user.findFirst({
      where: {
        id: proof.id,
        email,
        auth_provider: 'anonymous',
        isDeleted: false,
      },
      select: userSelectedField,
    });
    if (!account)
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    return account;
  }

  private async linkAnonymousToSocialAccount(params: {
    anonymousEmail: string;
    anonymousAccessToken?: string;
    email: string;
    nickName: string;
    profileImage?: string;
    providerId: string;
    providerIdField: 'googleId' | 'appleId';
    authProvider: 'google' | 'apple';
  }): Promise<AuthTokenResDto> {
    const {
      anonymousEmail,
      email,
      nickName,
      profileImage,
      providerId,
      providerIdField,
      authProvider,
    } = params;

    // 이메일과 FCM 토큰은 계정 소유 증명이 아니므로 서명된 access 토큰을 요구한다.
    const anonymousUser = await this.requireActiveAnonymousAccount(
      anonymousEmail,
      params.anonymousAccessToken,
    );

    // 소셜 계정으로 기존 사용자가 있는지 확인
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { [providerIdField]: providerId }],
      },
      select: userSelectedField,
    });

    if (existingUser?.isDeleted)
      throw new UnauthorizedException(ERROR_MESSAGE.AUTH.USER_DELETED);
    if (existingUser) {
      // 기존 소셜 계정이 있으면 anonymous 사용자와 관련 레코드 삭제 후 로그인
      await this.prisma.$transaction(async (tx) => {
        // anonymous 유저의 fcmToken을 existingUser로 이전
        const anonymousTokens = await tx.fcmToken.findMany({
          where: { userId: anonymousUser.id },
          select: { fcmToken: true },
        });
        const tokenList = anonymousTokens.map((t) => t.fcmToken);

        if (tokenList.length > 0) {
          // existingUser에게 같은 토큰이 있으면 먼저 삭제 (중복 방지)
          await tx.fcmToken.deleteMany({
            where: {
              userId: existingUser.id,
              fcmToken: { in: tokenList },
            },
          });
          // anonymous 유저의 토큰을 existingUser로 이전
          await tx.fcmToken.updateMany({
            where: { userId: anonymousUser.id },
            data: { userId: existingUser.id },
          });
        }

        // 나머지 관련 레코드 삭제
        await tx.payment.updateMany({
          where: { userId: anonymousUser.id },
          data: { userId: null },
        });
        // anonymous 사용자 삭제
        await tx.user.delete({ where: { id: anonymousUser.id } });
      });

      return this.generateAndSaveTokens(existingUser);
    }

    // anonymous 사용자를 소셜 계정으로 연동
    const normalizedNickName = normalizeGeneratedNickname(nickName);
    const updateData: Record<string, unknown> = {
      email,
      nickName: normalizedNickName,
      [providerIdField]: providerId,
      auth_provider: authProvider,
    };

    if (profileImage) {
      updateData.profile_image = profileImage;
    }

    const user = await this.prisma.user.update({
      where: { id: anonymousUser.id },
      data: updateData,
      select: {
        ...userSelectedField,
        initialPlatform: true,
      },
    });

    this.sendNewUserDiscordNotification({
      userId: user.id,
      email,
      authProvider,
      initialPlatform: user.initialPlatform,
      nickName: normalizedNickName,
    });

    return this.generateAndSaveTokens(user);
  }

  /**
   * JWT 토큰 생성 및 저장
   */
  private async generateAndSaveTokens(user: {
    id: number;
    email: string;
    role: UserRole;
  }): Promise<AuthTokenResDto> {
    const accessToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });

    const refreshToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return { accessToken, refreshToken };
  }

  /**
   * @summary 회원 탈퇴
   * @description 사용자 회원 탈퇴 처리 - 구매 내역이 없으면 즉시 삭제, 있으면 소프트 삭제
   * @access Normal
   * @route DELETE /auth/withdraw
   * @auth auth
   * @response SingleMessageDto
   */
  async deleteUser(payload: Payload): Promise<SingleMessageDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: userSelectedField,
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGE.AUTH.USER_NOT_FOUND);
    }

    if (user.isDeleted) {
      throw new NotFoundException(ERROR_MESSAGE.AUTH.USER_DELETED);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.fcmToken.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: { isDeleted: true, whenDeleted: new Date(), refreshToken: null },
      });
    });

    return { message: SUCCESS_MESSAGE.AUTH.WITHDRAWAL };
  }

  /**
   * @summary 탈퇴 회원 영구 삭제 (CronJob)
   * @description 설정한 보존 기간이 지난 탈퇴 계정만 정리하며 미설정 시 실행하지 않음
   * @access System
   */
  // 12시간마다 보존 기간이 지난 탈퇴 계정을 정리한다.
  @Cron(CronExpression.EVERY_12_HOURS)
  async deleteWithdrawnUsers() {
    const retentionDays = Number(
      this.configService.get<string>('DELETED_USER_RETENTION_DAYS'),
    );
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) return;
    const retentionCutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const usersToDelete = await this.prisma.user.findMany({
      where: {
        isDeleted: true,
        whenDeleted: {
          lt: retentionCutoff,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    // 각 사용자와 관련된 모든 데이터 삭제
    for (const user of usersToDelete) {
      try {
        // 트랜잭션으로 관련 데이터 모두 삭제
        await this.prisma.$transaction(async (tx) => {
          await tx.user.delete({
            where: { id: user.id },
          });
        });

        console.log(`Successfully deleted user: ${user.email}`);
      } catch (error) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.WITHDRAWN_USER_DELETE_FAILED,
          error,
          {
            userId: user.id,
            email: user.email,
          },
        );
      }
    }

    if (usersToDelete.length > 0) {
      console.log(`Deleted ${usersToDelete.length} withdrawn users`);
    }
  }

  /**
   * @summary 구글 로그인
   * @description 구글 ID 토큰을 검증하고 사용자 로그인 또는 회원가입 처리
   * @access Public
   * @route POST /auth/google
   * @body GoogleLoginReqDto
   * @response AuthTokenResDto
   */
  async googleLogin(dto: GoogleLoginReqDto): Promise<AuthTokenResDto> {
    const {
      idToken,
      referralCode,
      onboarding,
      initialPlatform,
      anonymousEmail,
      anonymousAccessToken,
    } = dto;
    const configuredGoogleClientIds = {
      webClientId: this.configService.get<string>(
        envVariableKeys.GOOGLE_CLIENT_ID,
      ),
      androidClientId: this.configService.get<string>(
        envVariableKeys.GOOGLE_ANDROID_CLIENT_ID,
      ),
      iosClientId: this.configService.get<string>(
        envVariableKeys.GOOGLE_IOS_CLIENT_ID,
      ),
    };
    const googleAudience = Array.from(
      new Set(
        [
          configuredGoogleClientIds.webClientId,
          configuredGoogleClientIds.androidClientId,
          configuredGoogleClientIds.iosClientId,
        ]
          .map((clientId) => clientId?.trim())
          .filter((clientId): clientId is string => Boolean(clientId)),
      ),
    );
    const googleLoginLogContext = {
      initialPlatform: initialPlatform ?? null,
      anonymousEmailMasked: maskEmail(anonymousEmail),
      idTokenLength: idToken?.length ?? 0,
      idTokenSegmentCount: idToken?.split('.').length ?? 0,
      configuredAudience: {
        webClientId: Boolean(configuredGoogleClientIds.webClientId?.trim()),
        androidClientId: Boolean(
          configuredGoogleClientIds.androidClientId?.trim(),
        ),
        iosClientId: Boolean(configuredGoogleClientIds.iosClientId?.trim()),
        count: googleAudience.length,
      },
      unverifiedToken: getGoogleTokenDebugPayload(idToken),
    };

    console.log('[Google Login] Request received', googleLoginLogContext);

    if (googleAudience.length === 0) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.GOOGLE_OAUTH_CLIENT_ID_MISSING,
        googleLoginLogContext,
      );
      throw new InternalServerErrorException(
        ERROR_MESSAGE.AUTH.GOOGLE_LOGIN_NOT_CONFIGURED,
      );
    }

    // 1. 구글 ID 토큰 검증
    const client = new OAuth2Client();
    const ticket = await client
      .verifyIdToken({
        idToken,
        audience: googleAudience,
        // 시계 차이 허용 (최대 5분)
        maxExpiry: 86400, // 24시간
      })
      .catch((error) => {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.GOOGLE_ID_TOKEN_VERIFY_FAILED,
          error,
          {
            ...googleLoginLogContext,
            error: serializeErrorForLog(error),
          },
        );
        throw new BadRequestException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
      });

    const payload = ticket.getPayload();
    if (!payload) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.GOOGLE_VERIFIED_PAYLOAD_MISSING,
        googleLoginLogContext,
      );
      throw new BadRequestException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }

    const { sub: googleId, email, name, picture } = payload;

    console.log('[Google Login] Token verified', {
      googleIdMasked: maskValue(googleId),
      emailMasked: maskEmail(email),
      nameProvided: Boolean(name),
      pictureProvided: Boolean(picture),
    });

    if (!googleId) {
      this.logger.error(INTERNAL_ERROR_MESSAGE.AUTH.GOOGLE_ID_MISSING, {
        ...googleLoginLogContext,
        payload: getGoogleTokenDebugPayload(idToken),
      });
      throw new BadRequestException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
    }

    if (!email) {
      this.logger.error(INTERNAL_ERROR_MESSAGE.AUTH.GOOGLE_EMAIL_MISSING, {
        ...googleLoginLogContext,
        googleIdMasked: maskValue(googleId),
      });
      throw new BadRequestException(ERROR_MESSAGE.AUTH.NO_EMAIL);
    }

    if (referralCode) {
      await this.checkReferralCode(referralCode);
    }

    // 3. anonymous 연동 처리
    if (anonymousEmail) {
      console.log('[Google Login] Linking anonymous account', {
        anonymousEmailMasked: maskEmail(anonymousEmail),
        googleEmailMasked: maskEmail(email),
        googleIdMasked: maskValue(googleId),
      });
      return this.linkAnonymousToSocialAccount({
        anonymousEmail,
        anonymousAccessToken,
        email,
        nickName: name || email.split('@')[0],
        profileImage: picture,
        providerId: googleId,
        providerIdField: 'googleId',
        authProvider: 'google',
      });
    }

    // 4. 사용자 찾기 또는 생성
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { googleId: googleId }],
      },
      select: userSelectedField,
    });

    if (!user) {
      console.log('[Google Login] Creating new user', {
        emailMasked: maskEmail(email),
        googleIdMasked: maskValue(googleId),
        initialPlatform: initialPlatform ?? null,
      });
      // 신규 사용자 생성
      user = await this.createAccount({
        onboarding,
        data: {
          email,
          nickName: name || email.split('@')[0],
          profile_image: picture,
          googleId: googleId,
          auth_provider: 'google',
          role: UserRole.Normal,
          initialPlatform,
        },
      });
    } else if (!user.googleId) {
      console.log('[Google Login] Linking Google ID to existing user', {
        userId: user.id,
        emailMasked: maskEmail(user.email),
        googleIdMasked: maskValue(googleId),
      });
      // 기존 사용자에 구글 ID 연결
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleId },
        select: userSelectedField,
      });
    } else {
      console.log('[Google Login] Existing Google account found', {
        userId: user.id,
        emailMasked: maskEmail(user.email),
        googleIdMasked: maskValue(user.googleId),
      });
    }

    // 5. JWT 토큰 생성 및 저장
    const authTokens = await this.generateAndSaveTokens(user);

    console.log('[Google Login] Token issuance complete', {
      userId: user.id,
      emailMasked: maskEmail(user.email),
    });

    return authTokens;
  }

  /**
   * @summary 페이스북 로그인
   * @description 페이스북 Access 토큰을 검증하고 사용자 로그인 또는 회원가입 처리
   * @access Public
   * @route POST /auth/facebook
   * @body FacebookLoginReqDto
   * @response AuthTokenResDto
   */
  async facebookLogin(dto: FacebookLoginReqDto): Promise<AuthTokenResDto> {
    const { accessToken, referralCode, onboarding, initialPlatform } = dto;

    // 1. 페이스북 토큰 검증
    const response = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`,
    );

    const { id: facebookId, email, name, picture } = response.data;

    if (!email) {
      throw new BadRequestException('Facebook 계정에 이메일 정보가 없습니다.');
    }

    if (referralCode) {
      await this.checkReferralCode(referralCode);
    }

    // 3. 사용자 찾기 또는 생성
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { facebookId: facebookId }],
      },
      select: userSelectedField,
    });

    if (!user) {
      // 신규 사용자 생성
      user = await this.createAccount({
        onboarding,
        data: {
          email,
          nickName: name || email.split('@')[0],
          profile_image: picture?.data?.url,
          facebookId: facebookId,
          auth_provider: 'facebook',
          role: UserRole.Normal,
          initialPlatform,
        },
      });
    } else if (!user.facebookId) {
      // 기존 사용자에 페이스북 ID 연결
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { facebookId: facebookId },
        select: userSelectedField,
      });
    }

    // 4. JWT 토큰 생성
    const accessTokenJWT = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });

    const refreshToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    });

    // 5. 리프레시 토큰 저장
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshToken },
    });

    return { accessToken: accessTokenJWT, refreshToken };
  }

  /**
   * @summary 애플 로그인
   * @description 애플 Identity 토큰(iOS) 또는 Authorization Code(Android)를 검증하고 사용자 로그인 또는 회원가입 처리
   * @access Public
   * @route POST /auth/apple
   * @body AppleLoginReqDto
   * @response AuthTokenResDto
   */
  async appleLogin(dto: AppleLoginReqDto): Promise<AuthTokenResDto> {
    const {
      identityToken,
      referralCode,
      onboarding,
      authorizationCode,
      nonce,
      initialPlatform,
      anonymousEmail,
      anonymousAccessToken,
      user: appleUser,
    } = dto;

    let appleId: string;
    let email: string;
    const appleLoginMethod = identityToken
      ? initialPlatform === PlatformEnum.WEB
        ? 'web-identity-token'
        : 'ios-identity-token'
      : authorizationCode
        ? 'android-authorization-code'
        : 'missing-credential';
    const configuredBundleId = this.configService
      .get<string>(envVariableKeys.BUNDLE_ID)
      ?.trim();
    const appleLoginLogContext = {
      loginMethod: appleLoginMethod,
      initialPlatform: initialPlatform ?? null,
      anonymousEmailMasked: maskEmail(anonymousEmail),
      appleUserMasked: maskValue(appleUser),
      identityTokenLength: identityToken?.length ?? 0,
      identityTokenSegmentCount: identityToken?.split('.').length ?? 0,
      authorizationCodeLength: authorizationCode?.length ?? 0,
      configuredAudience: {
        bundleId: configuredBundleId ?? null,
        bundleIdConfigured: Boolean(configuredBundleId),
      },
    };

    console.log('[Apple Login] Request received', appleLoginLogContext);

    // 웹은 Service ID, iOS는 기존 Bundle ID로 검증한다. Android 코드 교환은 유지한다.
    if (identityToken) {
      const webAudience =
        initialPlatform === PlatformEnum.WEB
          ? this.getOptionalConfigValue(envVariableKeys.APPLE_SERVICE_ID)
          : undefined;
      if (initialPlatform === PlatformEnum.WEB && !webAudience) {
        throw new BadRequestException(
          ERROR_MESSAGE.AUTH.APPLE_LOGIN_NOT_CONFIGURED,
        );
      }
      if (!webAudience && !configuredBundleId) {
        throw new BadRequestException(
          ERROR_MESSAGE.AUTH.APPLE_LOGIN_NOT_CONFIGURED,
        );
      }
      const appleIdTokenClaims = await appleSignin
        .verifyIdToken(identityToken, {
          audience: webAudience ?? configuredBundleId,
          nonce,
        })
        .catch((error) => {
          this.logger.error(
            INTERNAL_ERROR_MESSAGE.AUTH.APPLE_ID_TOKEN_VERIFY_FAILED,
            error,
            {
              ...appleLoginLogContext,
              error: serializeErrorForLog(error),
            },
          );
          throw error;
        });

      if (nonce !== undefined && appleIdTokenClaims.nonce !== nonce) {
        throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
      }
      appleId = appleIdTokenClaims.sub;
      email = appleIdTokenClaims.email;
    } else if (authorizationCode) {
      if (!nonce)
        throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
      // Android 방식: Authorization Code로 토큰 교환
      const appleWebSignInConfig = this.getAppleWebSignInConfig();
      const tokenResponse = await this.exchangeAppleAuthCode(
        authorizationCode,
        appleWebSignInConfig,
      );

      // ID Token 검증 (Service ID 사용)
      const appleIdTokenClaims = await appleSignin
        .verifyIdToken(tokenResponse.id_token, {
          audience: appleWebSignInConfig.clientId,
          nonce,
        })
        .catch((error) => {
          this.logger.error(
            INTERNAL_ERROR_MESSAGE.AUTH
              .APPLE_TOKEN_EXCHANGE_ID_TOKEN_VERIFY_FAILED,
            error,
            {
              ...appleLoginLogContext,
              appleServiceIdConfigured: Boolean(appleWebSignInConfig.clientId),
              error: serializeErrorForLog(error),
            },
          );
          throw error;
        });

      if (nonce !== undefined && appleIdTokenClaims.nonce !== nonce) {
        throw new UnauthorizedException(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
      }
      appleId = appleIdTokenClaims.sub;
      email = appleIdTokenClaims.email;
    } else {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.APPLE_LOGIN_CREDENTIAL_MISSING,
        appleLoginLogContext,
      );
      throw new BadRequestException(
        'identityToken 또는 authorizationCode가 필요합니다.',
      );
    }

    console.log('[Apple Login] Token verified', {
      ...appleLoginLogContext,
      appleIdMasked: maskValue(appleId),
      emailMasked: maskEmail(email),
      emailProvided: Boolean(email),
      appleUserMatchesTokenSub: appleUser ? appleUser === appleId : null,
    });

    if (!email) {
      this.logger.error(INTERNAL_ERROR_MESSAGE.AUTH.APPLE_EMAIL_MISSING, {
        ...appleLoginLogContext,
        appleIdMasked: maskValue(appleId),
        appleUserMatchesTokenSub: appleUser ? appleUser === appleId : null,
      });
      throw new BadRequestException('Apple 계정에 이메일 정보가 없습니다.');
    }

    if (referralCode) {
      await this.checkReferralCode(referralCode);
    }

    // 3. anonymous 연동 처리
    if (anonymousEmail) {
      console.log('[Apple Login] Linking anonymous account', {
        anonymousEmailMasked: maskEmail(anonymousEmail),
        appleEmailMasked: maskEmail(email),
        appleIdMasked: maskValue(appleId),
      });
      return this.linkAnonymousToSocialAccount({
        anonymousEmail,
        anonymousAccessToken,
        email,
        nickName: email.split('@')[0],
        providerId: appleId,
        providerIdField: 'appleId',
        authProvider: 'apple',
      });
    }

    // 4. 사용자 찾기 또는 생성
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { appleId: appleId }],
      },
      select: userSelectedField,
    });

    if (!user) {
      console.log('[Apple Login] Creating new user', {
        emailMasked: maskEmail(email),
        appleIdMasked: maskValue(appleId),
        initialPlatform: initialPlatform ?? null,
      });
      // 신규 사용자 생성
      user = await this.createAccount({
        onboarding,
        data: {
          email,
          nickName: email.split('@')[0],
          appleId: appleId,
          auth_provider: 'apple',
          role: UserRole.Normal,
          initialPlatform,
        },
      });
    } else if (!user.appleId) {
      console.log('[Apple Login] Linking Apple ID to existing user', {
        userId: user.id,
        emailMasked: maskEmail(user.email),
        appleIdMasked: maskValue(appleId),
      });
      // 기존 사용자에 애플 ID 연결
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { appleId: appleId },
        select: userSelectedField,
      });
    } else {
      console.log('[Apple Login] Existing Apple account found', {
        userId: user.id,
        emailMasked: maskEmail(user.email),
        appleIdMasked: maskValue(user.appleId),
      });
    }

    // 5. JWT 토큰 생성 및 저장
    const authTokens = await this.generateAndSaveTokens(user);

    console.log('[Apple Login] Token issuance complete', {
      userId: user.id,
      emailMasked: maskEmail(user.email),
    });

    return authTokens;
  }

  /**
   * @description Apple Authorization Code를 Access Token으로 교환 (Android용)
   */
  private async exchangeAppleAuthCode(
    authorizationCode: string,
    appleWebSignInConfig: AppleWebSignInConfig,
  ): Promise<{
    access_token: string;
    id_token: string;
    refresh_token: string;
  }> {
    const clientSecret = this.generateAppleClientSecret(appleWebSignInConfig);
    const { clientId, redirectUri } = appleWebSignInConfig;
    const exchangeLogContext = {
      clientId,
      redirectUri,
      authorizationCodeLength: authorizationCode.length,
    };

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('code', authorizationCode);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);

    console.log('[Apple Login] Token exchange request', exchangeLogContext);

    try {
      const response = await axios.post(
        'https://appleid.apple.com/auth/token',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.APPLE_TOKEN_EXCHANGE_FAILED,
        error,
        {
          ...exchangeLogContext,
          error: serializeAxiosErrorForLog(error),
        },
      );

      if (
        axios.isAxiosError(error) &&
        error.response?.data &&
        typeof error.response.data === 'object' &&
        'error' in error.response.data &&
        error.response.data.error === 'invalid_client'
      ) {
        throw new InternalServerErrorException(
          ERROR_MESSAGE.AUTH.APPLE_LOGIN_NOT_CONFIGURED,
        );
      }

      throw error;
    }
  }

  /**
   * @description Apple Client Secret 생성 (JWT 형식, Android용)
   */
  private generateAppleClientSecret({
    teamId,
    keyId,
    clientId,
    privateKey,
  }: AppleWebSignInConfig): string {
    console.log('[Apple Login] JWT config prepared', {
      clientId,
      teamIdConfigured: Boolean(teamId),
      keyIdConfigured: Boolean(keyId),
      privateKeyConfigured: Boolean(privateKey),
      privateKeyContainsEscapedNewlines: privateKey.includes('\\n'),
    });

    const now = Math.floor(Date.now() / 1000);

    // jsonwebtoken 직접 사용 (ES256 알고리즘 지원)
    const token = jwt.sign(
      {
        iss: teamId,
        iat: now,
        exp: now + 86400 * 180, // 6개월
        aud: 'https://appleid.apple.com',
        sub: clientId,
      },
      privateKey.replace(/\\n/g, '\n'),
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: keyId,
        },
      },
    );

    return token;
  }

  private getAppleWebSignInConfig(): AppleWebSignInConfig {
    const clientId = this.getOptionalConfigValue(
      envVariableKeys.APPLE_SERVICE_ID,
    );
    const redirectUri = this.getOptionalConfigValue(
      envVariableKeys.APPLE_REDIRECT_URI,
    );
    const teamId = this.getOptionalConfigValue(envVariableKeys.APPLE_TEAM_ID);
    const keyId = this.getOptionalConfigValue(envVariableKeys.APPLE_KEY_ID);
    const privateKey = this.getOptionalConfigValue(
      envVariableKeys.APPLE_PRIVATE_KEY,
    );

    if (!clientId || !redirectUri || !teamId || !keyId || !privateKey) {
      throw new InternalServerErrorException(
        ERROR_MESSAGE.AUTH.APPLE_LOGIN_NOT_CONFIGURED,
      );
    }

    return { clientId, redirectUri, teamId, keyId, privateKey };
  }

  private getOptionalConfigValue(key: string): string | undefined {
    const value = this.configService.get<string>(key)?.trim();
    return value ? value : undefined;
  }

  /**
   * @summary 개발자 로그인
   * @description 개발 서버에서만 기존 테스터 계정으로 로그인
   * @access Public
   * @route POST /auth/developer-login
   * @response AuthTokenResDto
   */
  async developerLogin(): Promise<AuthTokenResDto> {
    const nodeEnv = this.configService.get<string>(envVariableKeys.NODE_ENV);
    if (nodeEnv !== 'dev' && nodeEnv !== 'development') {
      throw new ForbiddenException(ERROR_MESSAGE.COMMON.INVALID_REQUEST);
    }

    return this.testerLogin({
      email: this.configService.get<string>('TESTER_EMAIL'),
      password: this.configService.get<string>('TESTER_PASSWORD'),
    });
  }

  /**
   * @summary 테스터 로그인
   * @description 환경변수로 명시한 테스터 계정으로 로그인
   * @access Public
   * @route POST /auth/tester-login
   * @body TesterLoginReqDto
   * @response AuthTokenResDto
   */
  async testerLogin(dto: TesterLoginReqDto): Promise<AuthTokenResDto> {
    const TESTER_EMAIL = this.configService.get<string>('TESTER_EMAIL');
    const TESTER_PASSWORD = this.configService.get<string>('TESTER_PASSWORD');

    const { email, password } = dto;

    // 설정된 테스터 자격 증명을 검증한다.
    if (
      !TESTER_EMAIL ||
      !TESTER_PASSWORD ||
      email !== TESTER_EMAIL ||
      password !== TESTER_PASSWORD
    ) {
      throw new UnauthorizedException(
        ERROR_MESSAGE.AUTH.INVALID_EMAIL_OR_PASSWORD,
      );
    }

    // 테스터 유저 찾기 또는 생성
    let user = await this.prisma.user.findUnique({
      where: { email: TESTER_EMAIL },
      select: userSelectedField,
    });

    if (!user) {
      // 테스터 유저 생성
      user = await this.createAccount({
        data: {
          email: TESTER_EMAIL,
          nickName: 'Tester',
          auth_provider: 'local',
          role: UserRole.Normal,
        },
        notifyDiscord: false,
        trackMixpanel: false,
      });
    }

    // JWT 토큰 생성
    const accessToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });

    const refreshToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    });

    // 리프레시 토큰 저장
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshToken },
    });

    return { accessToken, refreshToken };
  }

  /**
   * @summary 비로그인 사용자 생성
   * @description 로그인 없이 앱을 사용하는 anonymous 사용자를 생성합니다.
   * guest-{timestamp}@example.invalid 형식의 이메일로 생성되며, 나중에 소셜 로그인으로 연동 가능합니다.
   * @access Public
   * @route POST /auth/anonymous
   * @body AnonymousLoginReqDto
   * @response AuthTokenResDto
   */
  async anonymousLogin(dto: AnonymousLoginReqDto): Promise<AuthTokenResDto> {
    const { initialPlatform } = dto;

    // anonymous 이메일 생성 (guest-{timestamp}@example.invalid)
    const timestamp = crypto.randomUUID();
    const email = `guest-${timestamp}@example.invalid`;

    // 신규 anonymous 사용자 생성
    const user = await this.createAccount({
      data: {
        email,
        nickName: 'Guest',
        auth_provider: 'anonymous',
        role: UserRole.Normal,
        initialPlatform,
      },
    });

    // JWT 토큰 생성
    const accessToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });

    const refreshToken = this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    });

    // 리프레시 토큰 저장
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshToken },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Apple Sign in with Apple JWT 서명 검증
   * @see https://developer.apple.com/documentation/signinwithapple/fetch_apple_s_public_key_for_verifying_token_signature
   */
  private async verifyAppleSignInJWT(
    token: string,
  ): Promise<AppleSignInWebhookPayload | null> {
    try {
      // JWT 헤더에서 kid 추출
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string') {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_INVALID_JWT_FORMAT,
        );
        return null;
      }

      const kid = decodedHeader.header.kid;
      if (!kid) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_KID_MISSING,
        );
        return null;
      }

      // Apple JWKS에서 공개 키 가져오기
      const signingKey = await this.appleJwksClient.getSigningKey(kid);
      const publicKey = signingKey.getPublicKey();

      // JWT 서명 검증 및 페이로드 반환
      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256', 'ES256'],
        issuer: 'https://appleid.apple.com',
      }) as AppleSignInWebhookPayload;

      // aud 검증 (bundle id)
      const expectedAud = this.configService.get<string>(
        envVariableKeys.BUNDLE_ID,
      );
      if (expectedAud && verified.aud !== expectedAud) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_INVALID_AUD(
            expectedAud,
            verified.aud,
          ),
        );
        return null;
      }

      return verified;
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_JWT_VERIFY_FAILED,
        error,
        {
          tokenLength: token.length,
          message: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  }

  /**
   * @summary Apple Sign in with Apple 웹훅 처리
   * @description Apple Sign in with Apple Server-to-Server Notifications 처리.
   * 사용자가 Apple ID를 삭제하거나 앱 연결을 해제할 때 호출됩니다.
   * @access Public
   * @route POST /auth/webhook
   * @body AppleSignInWebhookReqDto
   * @response AppleSignInWebhookResDto
   */
  async handleAppleSignInWebhook(
    dto: AppleSignInWebhookReqDto,
  ): Promise<CommonResponse<AppleSignInWebhookResDto>> {
    try {
      // JWT 서명 검증 및 페이로드 추출
      const verifiedPayload = await this.verifyAppleSignInJWT(dto.payload);
      if (!verifiedPayload) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_JWT_VERIFY_FAILED,
        );
        return generateErrorResponse(ERROR_MESSAGE.AUTH.INVALID_TOKEN);
      }

      // events는 JSON 문자열로 인코딩되어 있음
      const events: AppleSignInEvent = JSON.parse(verifiedPayload.events);

      console.log('[Apple Sign In Webhook] Received:', {
        type: events.type,
        sub: events.sub,
        event_time: new Date(events.event_time * 1000),
      });

      switch (events.type) {
        case 'account-delete':
        case 'account-deleted': // Apple 문서: account-delete, 실제 프로덕션: account-deleted
          // Apple 계정 삭제 - 유저의 whenDeleted 업데이트
          const deletedUser = await this.prisma.user.updateMany({
            where: { appleId: events.sub },
            data: {
              whenDeleted: new Date(),
              isDeleted: true,
              refreshToken: null,
            },
          });

          console.log(
            `[Apple Sign In Webhook] Account deleted - appleId: ${events.sub}, affected: ${deletedUser.count}`,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.AUTH.WEBHOOK_PROCESSED,
          );

        case 'consent-revoked':
          // 앱 연결 해제 - 유저의 whenDeleted 업데이트
          const revokedUser = await this.prisma.user.updateMany({
            where: { appleId: events.sub },
            data: {
              whenDeleted: new Date(),
              isDeleted: true,
              refreshToken: null,
            },
          });

          console.log(
            `[Apple Sign In Webhook] Consent revoked - appleId: ${events.sub}, affected: ${revokedUser.count}`,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.AUTH.WEBHOOK_PROCESSED,
          );

        default:
          // email-disabled, email-enabled 등 기타 이벤트
          console.log(
            `[Apple Sign In Webhook] Unhandled event: ${events.type}`,
          );
          return generateSuccessResponse(
            {},
            SUCCESS_MESSAGE.AUTH.WEBHOOK_PROCESSED,
          );
      }
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.AUTH.APPLE_SIGN_IN_WEBHOOK_PROCESS_FAILED,
        error,
        {
          payloadLength: dto.payload?.length,
        },
      );
      return generateErrorResponse(
        `${ERROR_MESSAGE.AUTH.WEBHOOK_PROCESSING_FAILED}: ${error.message}`,
      );
    }
  }
}
