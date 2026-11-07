import { DeviceEnum } from "../prisma-types";

export interface CreateFcmReqDto {
  fcmToken: string;
  deviceType: DeviceEnum;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  isActive?: boolean;
}

export interface ConfigureDevTestPushReqDto {
  enabled?: boolean;
}
