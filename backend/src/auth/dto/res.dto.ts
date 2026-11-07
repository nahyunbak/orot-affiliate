import { ProviderTypeEnum, UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class AuthTokenResDto {
  @IsString()
  // AccessToken
  accessToken: string;

  @IsString()
  // RefreshToken
  refreshToken: string;

  @IsString()
  @IsOptional()
  // Message
  message?: string;
}

export class LoginResDto {
  @IsString()
  // AccessToken
  accessToken: string;

  @IsString()
  // RefreshToken
  refreshToken: string;

  @IsString()
  // Message
  message: string;
}
export class CheckUserExistsResDto {
  @IsEnum(ProviderTypeEnum)
  // AuthProvider
  auth_provider: ProviderTypeEnum;

  @IsString()
  // Email
  email: string;

  @IsEnum(UserRole)
  // Role
  role: UserRole;

  @IsBoolean()
  // IsDeleted
  isDeleted: boolean;

  @IsString()
  // RefreshToken
  refreshToken: string;

  @IsNumber()
  @IsNotEmpty()
  // Id
  id: number;
}

// Methods that use SingleMessageDto: sendVerificationEmail, verifyEmail, verifyPhoneNumber, deleteUser, changePassword

export class AppleSignInWebhookResDto {
  @IsString()
  @IsOptional()
  message?: string;
}
