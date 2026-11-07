// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { mutationKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { userAPI } from "../fetch/user";
import { SingleMessageDto, UpdateUserInfoReqDto } from "../fetch/types";

export function useUpdateUserInfoMutation(
  options?: UseMutationOptions<SingleMessageDto, unknown, UpdateUserInfoReqDto>,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<SingleMessageDto, unknown, UpdateUserInfoReqDto>({
    mutationKey: [mutationKeys.user.updateUserInfo],
    mutationFn: (data) => userAPI.updateUserInfo(data, accessToken),
    ...options,
  });
}
