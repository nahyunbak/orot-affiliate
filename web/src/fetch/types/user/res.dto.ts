import {
  LanguageEnum,
  UserRole,
  ProviderTypeEnum,
  PlatformEnum,
} from "../prisma-types";

export interface MyPageResDto {
  id: number;
  email: string;
  nickName: string;
  referral_code: string;
  profile_image: string | null;
  language: LanguageEnum;
  role: UserRole;
  auth_provider: ProviderTypeEnum;
  paymentUUID: string;
  initialPlatform: PlatformEnum;
  alarmAllowed: boolean;
  timezone: string;
  isPremium: boolean;
}
