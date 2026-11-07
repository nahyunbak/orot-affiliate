import { ApiProperty } from '@nestjs/swagger';
import {
  LanguageEnum,
  PlatformEnum,
  ProviderTypeEnum,
  UserRole,
} from '@prisma/client';
export class MyPageResDto {
  @ApiProperty()
  id: number;
  @ApiProperty()
  email: string;
  @ApiProperty()
  nickName: string;
  @ApiProperty()
  referral_code: string;
  @ApiProperty({ nullable: true })
  profile_image: string | null;
  @ApiProperty({ enum: LanguageEnum })
  language: LanguageEnum;
  @ApiProperty({ enum: UserRole })
  role: UserRole;
  @ApiProperty({ enum: ProviderTypeEnum })
  auth_provider: ProviderTypeEnum;
  @ApiProperty()
  paymentUUID: string;
  @ApiProperty({ enum: PlatformEnum })
  initialPlatform: PlatformEnum;
  @ApiProperty()
  alarmAllowed: boolean;
  @ApiProperty()
  timezone: string;
  @ApiProperty()
  isPremium: boolean;
}
