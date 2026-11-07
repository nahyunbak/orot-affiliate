// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { userAPI } from "../fetch/user";
import { MyPageResDto } from "../fetch/types";

export function mypageQueryOptions(accessToken: string) {
  return {
    queryKey: [queryKeys.user.mypage],
    queryFn: () => userAPI.mypage(accessToken),
  };
}

export function useMypage(
  options?: Omit<UseQueryOptions<MyPageResDto>, "queryKey" | "queryFn">,
) {
  const { accessToken } = authHook.useAccessToken();
  return useQuery<MyPageResDto>({
    ...mypageQueryOptions(accessToken),
    ...options,
    enabled: !!accessToken && (options?.enabled ?? true),
  });
}
