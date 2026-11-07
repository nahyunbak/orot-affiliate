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
  UploadResDto,
  CreateUploadDto,
  UpdateUploadDto,
} from "./types";

export const uploadAPI = {
  uploadFile: async (
    file: File,
    params: { kind: string; name: string },
    accessToken: string,
  ): Promise<CommonResponse<UploadResDto>> => {
    const queryString = toSearchParams(params);
    const formData = new FormData();
    formData.append("file", file);

    return fetchWithAuth(`/upload/upload?${queryString}`, {
      method: "POST",
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
      body: formData,
    });
  },
};
