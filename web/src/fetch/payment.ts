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
  VerifyReceiptDataDto,
  VerifyAppleReceiptReqDto,
  VerifyGoogleReceiptReqDto,
  RestorePurchaseDataDto,
  RestorePurchaseReqDto,
  SubscriptionStatusDataDto,
  CancelSubscriptionDataDto,
  CancelSubscriptionReqDto,
  WebhookResultDataDto,
  AppleWebhookReqDto,
  GoogleWebhookReqDto,
  GetSubscriptionStatusReqDto,
  PaymentDto,
} from "./types";

export const paymentAPI = {
  verifyAppleReceipt: async (
    data: VerifyAppleReceiptReqDto,
    accessToken: string,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> => {
    return fetchWithAuth(`/payment/verify/apple`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  verifyGoogleReceipt: async (
    data: VerifyGoogleReceiptReqDto,
    accessToken: string,
  ): Promise<CommonResponse<VerifyReceiptDataDto>> => {
    return fetchWithAuth(`/payment/verify/google`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  restorePurchase: async (
    data: RestorePurchaseReqDto,
    accessToken: string,
  ): Promise<CommonResponse<RestorePurchaseDataDto>> => {
    return fetchWithAuth(`/payment/restore`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  getSubscriptionStatus: async (
    accessToken: string,
  ): Promise<CommonResponse<SubscriptionStatusDataDto>> => {
    return fetchWithAuth(`/payment/status`, {
      method: "GET",
      headers: getBaseHeader(accessToken),
      ...getNoCache(queryKeys.payment.getSubscriptionStatus),
    });
  },

  cancelSubscription: async (
    data: CancelSubscriptionReqDto,
    accessToken: string,
  ): Promise<CommonResponse<CancelSubscriptionDataDto>> => {
    return fetchWithAuth(`/payment/cancel`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  handleAppleWebhook: async (
    data: AppleWebhookReqDto,
    accessToken: string,
  ): Promise<CommonResponse<WebhookResultDataDto>> => {
    return fetchWithAuth(`/payment/webhook/apple`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },

  handleGoogleWebhook: async (
    data: GoogleWebhookReqDto,
  ): Promise<CommonResponse<WebhookResultDataDto>> => {
    return fetchWithAuth(`/payment/webhook/google`, {
      method: "POST",
      headers: getBaseHeader(),
      body: JSON.stringify(data),
    });
  },
};
