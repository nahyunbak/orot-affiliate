import { ApiProperty } from '@nestjs/swagger';
import { LanguageEnum } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { MAX_NICKNAME_LENGTH } from '@/common/constants/general';
export class UpdateUserInfoReqDto {
  @ApiProperty({ required: false, description: '표시 이름' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NICKNAME_LENGTH)
  nickName?: string;
  @ApiProperty({
    required: false,
    nullable: true,
    description: '프로필 이미지 URL',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  profile_image?: string | null;
  @ApiProperty({ required: false, enum: LanguageEnum })
  @IsOptional()
  @IsEnum(LanguageEnum)
  language?: LanguageEnum;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  alarmAllowed?: boolean;
  @ApiProperty({ required: false, example: 'UTC' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
