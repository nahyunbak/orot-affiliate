// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { paymentAPI } from "../fetch/payment";
import { CommonResponse, SubscriptionStatusDataDto } from "../fetch/types";

export function getSubscriptionStatusQueryOptions(accessToken: string) {
  return {
    queryKey: [queryKeys.payment.getSubscriptionStatus],
    queryFn: () => paymentAPI.getSubscriptionStatus(accessToken),
  };
}

export function useGetSubscriptionStatus(
  options?: Omit<
    UseQueryOptions<CommonResponse<SubscriptionStatusDataDto>>,
    "queryKey" | "queryFn"
  >,
) {
  const { accessToken } = authHook.useAccessToken();
  return useQuery<CommonResponse<SubscriptionStatusDataDto>>({
    ...getSubscriptionStatusQueryOptions(accessToken),
    ...options,
    enabled: !!accessToken && (options?.enabled ?? true),
  });
}
