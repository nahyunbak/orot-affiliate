import { PlatformEnum } from "../prisma-types";

export interface AuthOnboardingReqDto {
  alarmAllowed?: boolean;
  timezone?: string;
}

export interface RefreshTokenReqDto {
  refreshToken: string;
}

export interface GoogleLoginReqDto {
  referralCode?: string;
  onboarding?: AuthOnboardingReqDto;
  idToken: string;
  initialPlatform?: PlatformEnum;
  anonymousEmail?: string;
  anonymousAccessToken?: string;
}

export interface FacebookLoginReqDto {
  referralCode?: string;
  onboarding?: AuthOnboardingReqDto;
  accessToken: string;
  initialPlatform?: PlatformEnum;
}

export interface AppleLoginReqDto {
  referralCode?: string;
  onboarding?: AuthOnboardingReqDto;
  nonce?: string;
  identityToken?: string;
  authorizationCode?: string;
  user?: string;
  initialPlatform?: PlatformEnum;
  anonymousEmail?: string;
  anonymousAccessToken?: string;
}

export interface TesterLoginReqDto {
  email: string;
  password: string;
}

export interface AppleSignInWebhookReqDto {
  payload: string;
}

export interface AnonymousLoginReqDto {
  initialPlatform?: PlatformEnum;
  fcmToken?: string;
}

export interface AnonymousSyncReqDto {
  anonymousEmail: string;
}
