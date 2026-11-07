import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RBAC } from '../auth/decorator/rbac.decorator';
import { generateSuccessResponse } from '../common/helper/format';
import { AffiliateService } from './affiliate.service';
import {
  ApproveParticipantReqDto,
  RejectParticipantReqDto,
} from './dto/req.dto';

// 테스트 집행자 인증과 기존 RBAC를 통과한 요청만 서버 지갑을 사용할 수 있다.
@ApiTags('affiliate')
@Controller('affiliate')
@RBAC(UserRole.Admin)
export class AffiliateController {
  constructor(private readonly service: AffiliateService) {}
  @RBAC(UserRole.Admin) @Get('workspace') async workspace() {
    return generateSuccessResponse(await this.service.workspace());
  }
  @RBAC(UserRole.Admin) @Post(':id/approve') async approve(
    @Param('id') id: string,
    @Body() body: ApproveParticipantReqDto,
  ) {
    return generateSuccessResponse(
      await this.service.approve(id, body.verified),
    );
  }
  @RBAC(UserRole.Admin) @Post(':id/pay') async pay(@Param('id') id: string) {
    return generateSuccessResponse(await this.service.pay(id));
  }
  @RBAC(UserRole.Admin) @Post(':id/reject') async reject(
    @Param('id') id: string,
    @Body() body: RejectParticipantReqDto,
  ) {
    return generateSuccessResponse(await this.service.reject(id, body.reason));
  }
  @RBAC(UserRole.Admin) @Post(':id/reopen') async reopen(
    @Param('id') id: string,
  ) {
    return generateSuccessResponse(await this.service.reopen(id));
  }
}
