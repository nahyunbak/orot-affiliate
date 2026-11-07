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
  MyPageResDto,
  UpdateUserInfoReqDto,
} from "./types";

export const userAPI = {
  mypage: async (accessToken: string): Promise<MyPageResDto> => {
    return fetchWithAuth(`/user/mypage`, {
      method: "GET",
      headers: getBaseHeader(accessToken),
      ...getNoCache(queryKeys.user.mypage),
    });
  },

  updateUserInfo: async (
    data: UpdateUserInfoReqDto,
    accessToken: string,
  ): Promise<SingleMessageDto> => {
    return fetchWithAuth(`/user/update-info`, {
      method: "PATCH",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },
};
