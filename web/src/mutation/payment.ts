// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { mutationKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { paymentAPI } from "../fetch/payment";
import {
  CommonResponse,
  VerifyReceiptDataDto,
  VerifyAppleReceiptReqDto,
  VerifyGoogleReceiptReqDto,
  RestorePurchaseDataDto,
  RestorePurchaseReqDto,
  CancelSubscriptionDataDto,
  CancelSubscriptionReqDto,
  WebhookResultDataDto,
  AppleWebhookReqDto,
  GoogleWebhookReqDto,
} from "../fetch/types";

export function useVerifyAppleReceiptMutation(
  options?: UseMutationOptions<
    CommonResponse<VerifyReceiptDataDto>,
    unknown,
    VerifyAppleReceiptReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<VerifyReceiptDataDto>,
    unknown,
    VerifyAppleReceiptReqDto
  >({
    mutationKey: [mutationKeys.payment.verifyAppleReceipt],
    mutationFn: (data) => paymentAPI.verifyAppleReceipt(data, accessToken),
    ...options,
  });
}

export function useVerifyGoogleReceiptMutation(
  options?: UseMutationOptions<
    CommonResponse<VerifyReceiptDataDto>,
    unknown,
    VerifyGoogleReceiptReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<VerifyReceiptDataDto>,
    unknown,
    VerifyGoogleReceiptReqDto
  >({
    mutationKey: [mutationKeys.payment.verifyGoogleReceipt],
    mutationFn: (data) => paymentAPI.verifyGoogleReceipt(data, accessToken),
    ...options,
  });
}

export function useRestorePurchaseMutation(
  options?: UseMutationOptions<
    CommonResponse<RestorePurchaseDataDto>,
    unknown,
    RestorePurchaseReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<RestorePurchaseDataDto>,
    unknown,
    RestorePurchaseReqDto
  >({
    mutationKey: [mutationKeys.payment.restorePurchase],
    mutationFn: (data) => paymentAPI.restorePurchase(data, accessToken),
    ...options,
  });
}

export function useCancelSubscriptionMutation(
  options?: UseMutationOptions<
    CommonResponse<CancelSubscriptionDataDto>,
    unknown,
    CancelSubscriptionReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<CancelSubscriptionDataDto>,
    unknown,
    CancelSubscriptionReqDto
  >({
    mutationKey: [mutationKeys.payment.cancelSubscription],
    mutationFn: (data) => paymentAPI.cancelSubscription(data, accessToken),
    ...options,
  });
}

export function useHandleAppleWebhookMutation(
  options?: UseMutationOptions<
    CommonResponse<WebhookResultDataDto>,
    unknown,
    AppleWebhookReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<WebhookResultDataDto>,
    unknown,
    AppleWebhookReqDto
  >({
    mutationKey: [mutationKeys.payment.handleAppleWebhook],
    mutationFn: (data) => paymentAPI.handleAppleWebhook(data, accessToken),
    ...options,
  });
}

export function useHandleGoogleWebhookMutation(
  options?: UseMutationOptions<
    CommonResponse<WebhookResultDataDto>,
    unknown,
    GoogleWebhookReqDto
  >,
) {
  return useMutation<
    CommonResponse<WebhookResultDataDto>,
    unknown,
    GoogleWebhookReqDto
  >({
    mutationKey: [mutationKeys.payment.handleGoogleWebhook],
    mutationFn: paymentAPI.handleGoogleWebhook,
    ...options,
  });
}
