import { ApiProperty } from '@nestjs/swagger';
import { DeviceEnum } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFcmReqDto {
  @ApiProperty({
    required: true,
    example: 'fcm_token_example_string',
    description: 'FCM 토큰',
  })
  @IsString({ message: 'FCM 토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: 'FCM 토큰은 필수 입력 항목입니다.' })
  fcmToken: string;

  @ApiProperty({
    required: true,
    example: DeviceEnum.ios,
    enum: DeviceEnum,
    description: '디바이스 타입 (ios, android)',
  })
  @IsEnum(DeviceEnum, { message: '유효한 디바이스 타입을 선택해주세요.' })
  @IsNotEmpty({ message: '디바이스 타입은 필수 항목입니다.' })
  deviceType: DeviceEnum;

  @ApiProperty({
    required: true,
    example: 'iPhone 15 Pro',
    description: '디바이스 모델',
  })
  @IsString({ message: '디바이스 모델은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '디바이스 모델은 필수 입력 항목입니다.' })
  @MaxLength(100, { message: '디바이스 모델은 100자를 초과할 수 없습니다.' })
  deviceModel: string;

  @ApiProperty({
    required: true,
    example: 'iOS 17.1',
    description: 'OS 버전',
  })
  @IsString({ message: 'OS 버전은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: 'OS 버전은 필수 입력 항목입니다.' })
  @MaxLength(50, { message: 'OS 버전은 50자를 초과할 수 없습니다.' })
  osVersion: string;

  @ApiProperty({
    required: true,
    example: '1.2.3',
    description: '앱 버전',
  })
  @IsString({ message: '앱 버전은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '앱 버전은 필수 입력 항목입니다.' })
  @MaxLength(20, { message: '앱 버전은 20자를 초과할 수 없습니다.' })
  appVersion: string;

  @ApiProperty({
    required: false,
    example: true,
    description: '활성 상태',
    default: true,
  })
  @IsBoolean({ message: '활성 상태는 boolean이어야 합니다.' })
  @IsOptional()
  isActive?: boolean;
}

export class ConfigureDevTestPushReqDto {
  @ApiProperty({
    required: false,
    example: true,
    default: true,
    description: '개발용 테스트 푸시 반복 발송 활성화 여부 (생략 시 true)',
  })
  @IsBoolean({ message: '활성화 여부는 boolean이어야 합니다.' })
  @IsOptional()
  enabled?: boolean;
}
