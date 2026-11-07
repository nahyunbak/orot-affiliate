import { LanguageEnum } from "../prisma-types";

export interface UpdateUserInfoReqDto {
  nickName?: string;
  profile_image?: string | null;
  language?: LanguageEnum;
  alarmAllowed?: boolean;
  timezone?: string;
}
