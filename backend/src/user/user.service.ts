import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseStatusEnum } from '@prisma/client';
import { Payload } from '../auth/utils/types';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
import { SUCCESS_MESSAGE } from '@/common/constants/successMessage';
import { SingleMessageDto } from '@/common/dto/res.dto';
import { UpdateUserInfoReqDto } from './dto/req.dto';
import { MyPageResDto } from './dto/res.dto';
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * @summary 내 프로필 조회
   * @description 현재 계정의 기본 프로필과 활성 구독 여부를 반환
   * @access Normal
   * @route GET /user/mypage
   * @response MyPageResDto
   */
  async mypage(user: Payload): Promise<MyPageResDto> {
    const profile = await this.prisma.user.findFirst({
      where: { id: user.id, isDeleted: false },
      select: {
        id: true,
        email: true,
        nickName: true,
        referral_code: true,
        profile_image: true,
        language: true,
        role: true,
        auth_provider: true,
        paymentUUID: true,
        initialPlatform: true,
        alarmAllowed: true,
        timezone: true,
      },
    });
    if (!profile)
      throw new NotFoundException(ERROR_MESSAGE.AUTH.USER_NOT_FOUND);
    const now = new Date();
    const subscription = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        OR: [
          { status: PurchaseStatusEnum.ACTIVE, expiryDate: { gt: now } },
          {
            status: PurchaseStatusEnum.GRACE_PERIOD,
            gracePeriodExpiryDate: { gt: now },
          },
        ],
      },
      select: { id: true },
    });
    return { ...profile, isPremium: Boolean(subscription) };
  }
  /**
   * @summary 내 프로필 수정
   * @description 현재 인증 계정의 기본 프로필을 수정
   * @access Normal
   * @route PATCH /user/update-info
   * @body UpdateUserInfoReqDto
   * @response SingleMessageDto
   */
  async updateUserInfo(
    dto: UpdateUserInfoReqDto,
    user: Payload,
  ): Promise<SingleMessageDto> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.nickName !== undefined) data.nickName = dto.nickName;
    if (dto.profile_image !== undefined) data.profile_image = dto.profile_image;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.alarmAllowed !== undefined) data.alarmAllowed = dto.alarmAllowed;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    await this.prisma.user.update({
      where: { id: user.id, isDeleted: false },
      data,
    });
    return { message: SUCCESS_MESSAGE.USER.UPDATE_SUCCESS };
  }
}
