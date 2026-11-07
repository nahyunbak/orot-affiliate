import { ApiProperty } from '@nestjs/swagger';
import { PlatformEnum } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsTimeZone,
  ValidateNested,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AuthOnboardingReqDto {
  @ApiProperty({ required: false, description: '알림 허용 여부' })
  @IsOptional()
  @IsBoolean()
  alarmAllowed?: boolean;

  @ApiProperty({ required: false, example: 'Asia/Seoul' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class RefreshTokenReqDto {
  @ApiProperty({
    required: true,
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '리프레시 토큰',
  })
  @IsString({ message: '리프레시 토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '리프레시 토큰은 필수 입력 항목입니다.' })
  refreshToken: string;
}

export class GoogleLoginReqDto {
  @ApiProperty({
    required: false,
    example: 'ABC123',
    description: '추천인 코드',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(11)
  referralCode?: string;

  @ApiProperty({ required: false, type: AuthOnboardingReqDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthOnboardingReqDto)
  onboarding?: AuthOnboardingReqDto;

  @ApiProperty({
    required: true,
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAi...',
    description: 'Google ID 토큰',
  })
  @IsString({ message: 'ID 토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: 'ID 토큰은 필수 입력 항목입니다.' })
  idToken: string;

  @ApiProperty({
    required: false,
    example: PlatformEnum.IOS,
    enum: PlatformEnum,
    description: '사용자의 초기 플랫폼',
  })
  @IsEnum(PlatformEnum, { message: '유효한 플랫폼을 선택해주세요.' })
  @IsOptional()
  initialPlatform?: PlatformEnum;

  @ApiProperty({
    required: false,
    example: 'guest-1706000000000@example.invalid',
    description: 'anonymous 계정 연동 시 현재 anonymous 이메일',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  @Transform(({ value }) => value?.toLowerCase())
  @IsOptional()
  anonymousEmail?: string;

  @ApiProperty({
    required: false,
    description:
      '익명 계정 소유 증명용 access JWT. anonymousEmail 전달 시 필수.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  anonymousAccessToken?: string;
}

export class FacebookLoginReqDto {
  @ApiProperty({
    required: false,
    example: 'ABC123',
    description: '추천인 코드',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(11)
  referralCode?: string;

  @ApiProperty({ required: false, type: AuthOnboardingReqDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthOnboardingReqDto)
  onboarding?: AuthOnboardingReqDto;

  @ApiProperty({
    required: true,
    example: 'EAABsbCS1iHgBOZC1ZCjE4dN...',
    description: 'Facebook Access 토큰',
  })
  @IsString({ message: 'Access 토큰은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: 'Access 토큰은 필수 입력 항목입니다.' })
  accessToken: string;

  @ApiProperty({
    required: false,
    example: PlatformEnum.IOS,
    enum: PlatformEnum,
    description: '사용자의 초기 플랫폼',
  })
  @IsEnum(PlatformEnum, { message: '유효한 플랫폼을 선택해주세요.' })
  @IsOptional()
  initialPlatform?: PlatformEnum;
}

export class AppleLoginReqDto {
  @ApiProperty({
    required: false,
    example: 'ABC123',
    description: '추천인 코드',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(11)
  referralCode?: string;

  @ApiProperty({ required: false, type: AuthOnboardingReqDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthOnboardingReqDto)
  onboarding?: AuthOnboardingReqDto;

  @ApiProperty({
    required: false,
    description:
      'Apple OAuth 요청에 전달한 원본 nonce. Authorization Code 교환 시 필수.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  nonce?: string;

  @ApiProperty({
    required: false,
    example: 'eyJraWQiOiJlWGF1bm1MIiwiYWxnIjoiUlMyNTYifQ...',
    description: 'Apple Identity 토큰 (iOS용)',
  })
  @IsString({ message: 'Identity 토큰은 문자열이어야 합니다.' })
  @IsOptional()
  identityToken?: string;

  @ApiProperty({
    required: false,
    example: '4a1b2c3d4e5f6g7h8i9j0k',
    description: 'Apple Authorization Code (Android용)',
  })
  @IsString({ message: 'Authorization Code는 문자열이어야 합니다.' })
  @IsOptional()
  authorizationCode?: string;

  @ApiProperty({
    required: false,
    example: '000123.abc456def789ghi.1234',
    description: 'Apple User ID',
  })
  @IsString({ message: 'User ID는 문자열이어야 합니다.' })
  @IsOptional()
  user?: string;

  @ApiProperty({
    required: false,
    example: PlatformEnum.IOS,
    enum: PlatformEnum,
    description: '사용자의 초기 플랫폼',
  })
  @IsEnum(PlatformEnum, { message: '유효한 플랫폼을 선택해주세요.' })
  @IsOptional()
  initialPlatform?: PlatformEnum;

  @ApiProperty({
    required: false,
    example: 'guest-1706000000000@example.invalid',
    description: 'anonymous 계정 연동 시 현재 anonymous 이메일',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  @Transform(({ value }) => value?.toLowerCase())
  @IsOptional()
  anonymousEmail?: string;

  @ApiProperty({
    required: false,
    description:
      '익명 계정 소유 증명용 access JWT. anonymousEmail 전달 시 필수.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  anonymousAccessToken?: string;
}

export class TesterLoginReqDto {
  @ApiProperty({
    required: true,
    example: 'tester@example.invalid',
    description: '테스터 이메일',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @ApiProperty({
    required: true,
    example: 'configured-password',
    description: '테스터 비밀번호',
  })
  @IsString({ message: '비밀번호는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '비밀번호는 필수 입력 항목입니다.' })
  password: string;
}

export class AppleSignInWebhookReqDto {
  @ApiProperty({
    required: true,
    example: 'eyJhbGciOiJFUzI1NiIsImtpZCI6IldXRjg...',
    description:
      'Apple Sign in with Apple Server-to-Server Notification JWS Payload',
  })
  @IsString({ message: 'Payload는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: 'Payload는 필수 입력 항목입니다.' })
  payload: string;
}

export class AnonymousLoginReqDto {
  @ApiProperty({
    required: false,
    example: PlatformEnum.IOS,
    enum: PlatformEnum,
    description: '사용자의 초기 플랫폼',
  })
  @IsEnum(PlatformEnum, { message: '유효한 플랫폼을 선택해주세요.' })
  @IsOptional()
  initialPlatform?: PlatformEnum;

  @ApiProperty({
    required: false,
    example: 'fcm_token_example_string',
    description: '호환용 기기 토큰. 로그인 또는 계정 복구에 사용하지 않음',
  })
  @IsString({ message: 'FCM 토큰은 문자열이어야 합니다.' })
  @IsOptional()
  fcmToken?: string;
}

export class AnonymousSyncReqDto {
  @ApiProperty({
    required: true,
    example: 'guest-1706000000000@example.invalid',
    description: '현재 anonymous 계정의 이메일',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  @Transform(({ value }) => value?.toLowerCase())
  anonymousEmail: string;
}
