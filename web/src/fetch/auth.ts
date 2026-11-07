// 이 파일은 backend controller에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { fetchWithAuth, getBaseHeader, toSearchParams } from "./constants";
import {
  getNoCache,
  getNoStoreRevalidate,
  getRefetchWithCache,
} from "./utils/next";
import { queryKeys, mutationKeys } from "./utils/constants";
import {
  CommonResponse,
  SingleMessageDto,
  CheckUserExistsResDto,
  AuthTokenResDto,
  RefreshTokenReqDto,
  GoogleLoginReqDto,
  FacebookLoginReqDto,
  AppleLoginReqDto,
  TesterLoginReqDto,
  AnonymousLoginReqDto,
  AppleSignInWebhookResDto,
  AppleSignInWebhookReqDto,
  AuthOnboardingReqDto,
  AnonymousSyncReqDto,
  LoginResDto,
} from "./types";

export const authAPI = {
  verifyBearerToken: async (
    data: string,
    accessToken: string,
  ): Promise<CheckUserExistsResDto> => {
    return fetchWithAuth(`/auth/verify`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  refreshAccessToken: async (
    data: RefreshTokenReqDto,
  ): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/refresh`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  deleteUser: async (accessToken: string): Promise<SingleMessageDto> => {
    return fetchWithAuth(`/auth/withdraw`, {
      method: "DELETE",
      headers: getBaseHeader(accessToken),
    });
  },

  googleLogin: async (data: GoogleLoginReqDto): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/google`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  facebookLogin: async (
    data: FacebookLoginReqDto,
  ): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/facebook`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  appleLogin: async (data: AppleLoginReqDto): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/apple`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  developerLogin: async (): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/developer-login`, {
      method: "POST",
      headers: getBaseHeader(),
    });
  },

  testerLogin: async (data: TesterLoginReqDto): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/tester-login`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  anonymousLogin: async (
    data: AnonymousLoginReqDto,
  ): Promise<AuthTokenResDto> => {
    return fetchWithAuth(`/auth/anonymous`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  handleAppleSignInWebhook: async (
    data: AppleSignInWebhookReqDto,
  ): Promise<AppleSignInWebhookResDto> => {
    return fetchWithAuth(`/auth/webhook`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },

  appleCallback: async (): Promise<unknown> => {
    return fetchWithAuth(`/auth/apple/callback`, {
      method: "POST",
      headers: getBaseHeader(),
    });
  },
};
