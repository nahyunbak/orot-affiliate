import { ApiProperty } from '@nestjs/swagger';
import { DeviceEnum } from '@prisma/client';

export class FcmTokenResDto {
  @ApiProperty({ description: 'FCM 토큰 ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'FCM 토큰',
    example: 'fcm_token_example_string',
  })
  fcmToken: string;

  @ApiProperty({
    description: '디바이스 타입',
    enum: DeviceEnum,
    example: DeviceEnum.ios,
  })
  deviceType: DeviceEnum;

  @ApiProperty({ description: '디바이스 모델', example: 'iPhone 15 Pro' })
  deviceModel: string;

  @ApiProperty({ description: 'OS 버전', example: 'iOS 17.1' })
  osVersion: string;

  @ApiProperty({ description: '앱 버전', example: '1.2.3' })
  appVersion: string;

  @ApiProperty({ description: '활성 상태', example: true })
  isActive: boolean;

  @ApiProperty({
    description: '마지막 활성 시간',
    example: '2024-01-01T00:00:00.000Z',
  })
  lastActiveAt: Date;

  @ApiProperty({ description: '사용자 ID', example: 1 })
  userId: number;

  @ApiProperty({ description: '생성일시', example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시', example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}

export class DevTestPushBroadcastResDto {
  @ApiProperty({
    description: '개발용 테스트 푸시 반복 발송 활성화 여부',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: '대상 사용자 수',
    example: 12,
  })
  targetUserCount: number;

  @ApiProperty({
    description: '대상 활성 FCM 토큰 수',
    example: 18,
  })
  targetTokenCount: number;

  @ApiProperty({
    description: '푸시 전송 성공 수',
    example: 17,
  })
  successCount: number;

  @ApiProperty({
    description: '푸시 전송 실패 수',
    example: 1,
  })
  failureCount: number;
}
