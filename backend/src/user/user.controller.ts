import { Controller, Get, Body, Patch, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RBAC } from '@/auth/decorator/rbac.decorator';
import { SingleMessageDto } from '@/common/dto/res.dto';
import { UpdateUserInfoReqDto } from './dto/req.dto';
import { MyPageResDto } from './dto/res.dto';
import { UserRole } from '@prisma/client';
import { Payload } from '@/auth/utils/types';
import { Request } from 'express';

@ApiTags('user - User API')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @RBAC(UserRole.Normal)
  @Get('mypage')
  @ApiOperation({
    summary: '내 프로필 조회',
    description: '현재 계정의 기본 프로필과 활성 구독 여부를 반환  *',
  })
  @ApiResponse({ type: MyPageResDto })
  mypage(@Req() req: Request) {
    return this.userService.mypage(req?.user as Payload);
  }

  @RBAC(UserRole.Normal)
  @Patch('update-info')
  @ApiOperation({
    summary: '내 프로필 수정',
    description: '현재 인증 계정의 기본 프로필을 수정  *',
  })
  @ApiResponse({ type: SingleMessageDto })
  updateUserInfo(
    @Body() updateUserInfoReqDto: UpdateUserInfoReqDto,
    @Req() req: Request,
  ) {
    return this.userService.updateUserInfo(
      updateUserInfoReqDto,
      req?.user as Payload,
    );
  }
}
