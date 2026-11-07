import { DeviceEnum } from "../prisma-types";

export interface FcmTokenResDto {
  id: number;
  fcmToken: string;
  deviceType: DeviceEnum;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  isActive: boolean;
  lastActiveAt: Date;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DevTestPushBroadcastResDto {
  enabled: boolean;
  targetUserCount: number;
  targetTokenCount: number;
  successCount: number;
  failureCount: number;
}
