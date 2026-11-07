// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { mutationKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { fcmAPI } from "../fetch/fcm";
import {
  CommonResponse,
  FcmTokenResDto,
  CreateFcmReqDto,
} from "../fetch/types";

export function useCreateFcmMutation(
  options?: UseMutationOptions<
    CommonResponse<FcmTokenResDto>,
    unknown,
    CreateFcmReqDto
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<CommonResponse<FcmTokenResDto>, unknown, CreateFcmReqDto>({
    mutationKey: [mutationKeys.fcm.createFcm],
    mutationFn: (data) => fcmAPI.createFcm(data, accessToken),
    ...options,
  });
}
