// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { mutationKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { authAPI } from "../fetch/auth";
import {
  CheckUserExistsResDto,
  AuthTokenResDto,
  RefreshTokenReqDto,
  SingleMessageDto,
  GoogleLoginReqDto,
  FacebookLoginReqDto,
  AppleLoginReqDto,
  TesterLoginReqDto,
  AnonymousLoginReqDto,
  AppleSignInWebhookResDto,
  AppleSignInWebhookReqDto,
} from "../fetch/types";

export function useVerifyBearerTokenMutation(
  options?: UseMutationOptions<CheckUserExistsResDto, unknown, string>,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<CheckUserExistsResDto, unknown, string>({
    mutationKey: [mutationKeys.auth.verifyBearerToken],
    mutationFn: (data) => authAPI.verifyBearerToken(data, accessToken),
    ...options,
  });
}

export function useRefreshAccessTokenMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, RefreshTokenReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, RefreshTokenReqDto>({
    mutationKey: [mutationKeys.auth.refreshAccessToken],
    mutationFn: authAPI.refreshAccessToken,
    ...options,
  });
}

export function useDeleteUserMutation(
  options?: UseMutationOptions<SingleMessageDto, unknown, void>,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<SingleMessageDto, unknown, void>({
    mutationKey: [mutationKeys.auth.deleteUser],
    mutationFn: () => authAPI.deleteUser(accessToken),
    ...options,
  });
}

export function useGoogleLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, GoogleLoginReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, GoogleLoginReqDto>({
    mutationKey: [mutationKeys.auth.googleLogin],
    mutationFn: authAPI.googleLogin,
    ...options,
  });
}

export function useFacebookLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, FacebookLoginReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, FacebookLoginReqDto>({
    mutationKey: [mutationKeys.auth.facebookLogin],
    mutationFn: authAPI.facebookLogin,
    ...options,
  });
}

export function useAppleLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, AppleLoginReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, AppleLoginReqDto>({
    mutationKey: [mutationKeys.auth.appleLogin],
    mutationFn: authAPI.appleLogin,
    ...options,
  });
}

export function useDeveloperLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, void>,
) {
  return useMutation<AuthTokenResDto, unknown, void>({
    mutationKey: [mutationKeys.auth.developerLogin],
    mutationFn: authAPI.developerLogin,
    ...options,
  });
}

export function useTesterLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, TesterLoginReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, TesterLoginReqDto>({
    mutationKey: [mutationKeys.auth.testerLogin],
    mutationFn: authAPI.testerLogin,
    ...options,
  });
}

export function useAnonymousLoginMutation(
  options?: UseMutationOptions<AuthTokenResDto, unknown, AnonymousLoginReqDto>,
) {
  return useMutation<AuthTokenResDto, unknown, AnonymousLoginReqDto>({
    mutationKey: [mutationKeys.auth.anonymousLogin],
    mutationFn: authAPI.anonymousLogin,
    ...options,
  });
}

export function useHandleAppleSignInWebhookMutation(
  options?: UseMutationOptions<
    AppleSignInWebhookResDto,
    unknown,
    AppleSignInWebhookReqDto
  >,
) {
  return useMutation<
    AppleSignInWebhookResDto,
    unknown,
    AppleSignInWebhookReqDto
  >({
    mutationKey: [mutationKeys.auth.handleAppleSignInWebhook],
    mutationFn: authAPI.handleAppleSignInWebhook,
    ...options,
  });
}

export function useAppleCallbackMutation(
  options?: UseMutationOptions<unknown, unknown, void>,
) {
  return useMutation<unknown, unknown, void>({
    mutationKey: [mutationKeys.auth.appleCallback],
    mutationFn: authAPI.appleCallback,
    ...options,
  });
}
