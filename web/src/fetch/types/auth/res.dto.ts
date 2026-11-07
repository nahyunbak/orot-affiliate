import { ProviderTypeEnum, UserRole } from "../prisma-types";

export interface AuthTokenResDto {
  accessToken: string;
  refreshToken: string;
  message?: string;
}

export interface LoginResDto {
  accessToken: string;
  refreshToken: string;
  message: string;
}
export interface CheckUserExistsResDto {
  auth_provider: ProviderTypeEnum;
  email: string;
  role: UserRole;
  isDeleted: boolean;
  refreshToken: string;
  id: number;
}

// Methods that use SingleMessageDto: sendVerificationEmail, verifyEmail, verifyPhoneNumber, deleteUser, changePassword

export interface AppleSignInWebhookResDto {
  message?: string;
}
