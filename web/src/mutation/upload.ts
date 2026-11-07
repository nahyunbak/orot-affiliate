// 이 파일은 API client에서 자동 생성됩니다. 직접 수정하지 마세요.
// 재생성: pnpm generate-api
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { mutationKeys } from "../fetch/utils/constants";
import { authHook } from "../zustand/auth";
import { uploadAPI } from "../fetch/upload";
import { CommonResponse, UploadResDto } from "../fetch/types";

export function useUploadFileMutation(
  options?: UseMutationOptions<
    CommonResponse<UploadResDto>,
    unknown,
    { file: File; params: { kind: string; name: string } }
  >,
) {
  const { accessToken } = authHook.useAccessToken();

  return useMutation<
    CommonResponse<UploadResDto>,
    unknown,
    { file: File; params: { kind: string; name: string } }
  >({
    mutationKey: [mutationKeys.upload.uploadFile],
    mutationFn: ({ file, params }) =>
      uploadAPI.uploadFile(file, params, accessToken),
    ...options,
  });
}
