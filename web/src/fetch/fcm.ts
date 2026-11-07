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
  FcmTokenResDto,
  CreateFcmReqDto,
  ConfigureDevTestPushReqDto,
  DevTestPushBroadcastResDto,
} from "./types";

export const fcmAPI = {
  createFcm: async (
    data: CreateFcmReqDto,
    accessToken: string,
  ): Promise<CommonResponse<FcmTokenResDto>> => {
    return fetchWithAuth(`/fcm/create`, {
      method: "POST",
      headers: getBaseHeader(accessToken),
      body: JSON.stringify(data),
    });
  },
};
