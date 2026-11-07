import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RBAC } from '@/auth/decorator/rbac.decorator';
import { CommonResponse } from '@/common/dto/res.dto';
import {
  AppleWebhookReqDto,
  CancelSubscriptionReqDto,
  GoogleWebhookReqDto,
  RestorePurchaseReqDto,
  VerifyAppleReceiptReqDto,
  VerifyGoogleReceiptReqDto,
} from './dto/req.dto';
import {
  CancelSubscriptionDataDto,
  RestorePurchaseDataDto,
  SubscriptionStatusDataDto,
  VerifyReceiptDataDto,
  WebhookResultDataDto,
} from './dto/res.dto';
import { UserRole } from '@prisma/client';
import { Public } from '@/auth/decorator/public.decorator';
import { Payload } from '@/auth/utils/types';
import { Request } from 'express';

@ApiTags('payment - Payment API')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @RBAC(UserRole.Normal)
  @Post('verify/apple')
  @ApiOperation({
    summary: 'Apple 영수증 검증',
    description:
      'Apple App Store 영수증을 검증하고 구독을 활성화합니다 (StoreKit 2 JWS 지원)  *',
  })
  @ApiResponse({ type: CommonResponse<VerifyReceiptDataDto> })
  verifyAppleReceipt(
    @Body() verifyAppleReceiptReqDto: VerifyAppleReceiptReqDto,
    @Req() req: Request,
  ) {
    return this.paymentService.verifyAppleReceipt(
      verifyAppleReceiptReqDto,
      req?.user as Payload,
    );
  }

  @RBAC(UserRole.Normal)
  @Post('verify/google')
  @ApiOperation({
    summary: 'Google 영수증 검증',
    description: 'Google Play 영수증을 검증하고 구독을 활성화합니다  *',
  })
  @ApiResponse({ type: CommonResponse<VerifyReceiptDataDto> })
  verifyGoogleReceipt(
    @Body() verifyGoogleReceiptReqDto: VerifyGoogleReceiptReqDto,
    @Req() req: Request,
  ) {
    return this.paymentService.verifyGoogleReceipt(
      verifyGoogleReceiptReqDto,
      req?.user as Payload,
    );
  }

  @RBAC(UserRole.Normal)
  @Post('restore')
  @ApiOperation({
    summary: '구매 복원',
    description:
      '사용자의 이전 구매를 복원합니다 (Apple/Google). 여러 구매 토큰/영수증을 받아서 가장 적합한 것을 선택합니다.  *',
  })
  @ApiResponse({ type: CommonResponse<RestorePurchaseDataDto> })
  restorePurchase(
    @Body() restorePurchaseReqDto: RestorePurchaseReqDto,
    @Req() req: Request,
  ) {
    return this.paymentService.restorePurchase(
      restorePurchaseReqDto,
      req?.user as Payload,
    );
  }

  @RBAC(UserRole.Normal)
  @Get('status')
  @ApiOperation({
    summary: '구독 상태 조회',
    description: '사용자의 현재 구독 상태를 조회합니다  *',
  })
  @ApiResponse({ type: CommonResponse<SubscriptionStatusDataDto> })
  getSubscriptionStatus(@Req() req: Request) {
    return this.paymentService.getSubscriptionStatus(req?.user as Payload);
  }

  @RBAC(UserRole.Normal)
  @Post('cancel')
  @ApiOperation({
    summary: '구독 취소',
    description:
      '구독을 취소합니다 (상태만 변경, 실제 환불은 스토어에서 처리)  *',
  })
  @ApiResponse({ type: CommonResponse<CancelSubscriptionDataDto> })
  cancelSubscription(
    @Body() cancelSubscriptionReqDto: CancelSubscriptionReqDto,
    @Req() req: Request,
  ) {
    return this.paymentService.cancelSubscription(
      cancelSubscriptionReqDto,
      req?.user as Payload,
    );
  }

  @Public()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // 웹훅은 추가 필드 허용
      transform: true,
    }),
  )
  @Post('webhook/apple')
  @ApiOperation({
    summary: 'Apple 웹훅 처리',
    description: 'Apple App Store Server Notifications V2 웹훅을 처리합니다  *',
  })
  @ApiResponse({ type: CommonResponse<WebhookResultDataDto> })
  handleAppleWebhook(@Body() appleWebhookReqDto: AppleWebhookReqDto) {
    return this.paymentService.handleAppleWebhook(appleWebhookReqDto);
  }

  @Public()
  @Post('webhook/google')
  @ApiOperation({
    summary: 'Google 웹훅 처리',
    description:
      'Google Play Real-time Developer Notifications 웹훅을 처리합니다  *',
  })
  @ApiResponse({ type: CommonResponse<WebhookResultDataDto> })
  handleGoogleWebhook(@Body() googleWebhookReqDto: GoogleWebhookReqDto) {
    return this.paymentService.handleGoogleWebhook(googleWebhookReqDto);
  }
}
