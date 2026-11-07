import { Controller, Post, Body, Req } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RBAC } from '@/auth/decorator/rbac.decorator';
import { CommonResponse } from '@/common/dto/res.dto';
import { CreateFcmReqDto } from './dto/req.dto';
import { FcmTokenResDto } from './dto/res.dto';
import { UserRole } from '@prisma/client';
import { Payload } from '@/auth/utils/types';
import { Request } from 'express';

@ApiTags('fcm - Fcm API')
@Controller('fcm')
export class FcmController {
  constructor(private readonly fcmService: FcmService) {}

  @RBAC(UserRole.Normal)
  @Post('create')
  @ApiOperation({
    summary: 'FCM 토큰 생성/업데이트',
    description: 'FCM 토큰으로 조회 후 없으면 생성, 있으면 업데이트  *',
  })
  @ApiResponse({ type: CommonResponse<FcmTokenResDto> })
  createFcm(@Body() createFcmReqDto: CreateFcmReqDto, @Req() req: Request) {
    return this.fcmService.createFcm(createFcmReqDto, req?.user as Payload);
  }
}
