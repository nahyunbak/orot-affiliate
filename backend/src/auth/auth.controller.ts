import { Controller, Post, Body, Delete, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RBAC } from '@/auth/decorator/rbac.decorator';
import { SingleMessageDto } from '@/common/dto/res.dto';
import { UserRole } from '@prisma/client';
import {
  AnonymousLoginReqDto,
  AppleLoginReqDto,
  AppleSignInWebhookReqDto,
  FacebookLoginReqDto,
  GoogleLoginReqDto,
  RefreshTokenReqDto,
  TesterLoginReqDto,
} from './dto/req.dto';
import {
  AppleSignInWebhookResDto,
  AuthTokenResDto,
  CheckUserExistsResDto,
} from './dto/res.dto';
import { Public } from '@/auth/decorator/public.decorator';
import { Payload } from '@/auth/utils/types';
import { Request, Response } from 'express';

@ApiTags('auth - Auth API')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('verify')
  @ApiOperation({
    summary: 'Bearer 토큰 검증',
    description:
      '* 1. Bearer 토큰 검증 및 사용자 정보 반환  * 2. 권한: System (내부 호출)  * 3. 로직 순서  *   - Bearer 토큰에서 실제 토큰 추출  *   - 토큰 타입(access/refresh) 확인  *   - 해당 시크릿으로 토큰 검증  *   - 토큰의 이메일로 사용자 존재 여부 확인  * 4. 사용자 정보 반환  *',
  })
  @ApiResponse({ type: CheckUserExistsResDto })
  verifyBearerToken(@Body() bearerToken: string) {
    return this.authService.verifyBearerToken(bearerToken);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh 토큰으로 Access 토큰 갱신',
    description: 'Refresh 토큰을 검증하고 새로운 Access 토큰을 발급합니다  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  refreshAccessToken(@Body() refreshTokenReqDto: RefreshTokenReqDto) {
    return this.authService.refreshAccessToken(refreshTokenReqDto);
  }

  @RBAC(UserRole.Normal)
  @Delete('withdraw')
  @ApiOperation({
    summary: '회원 탈퇴',
    description:
      '사용자 회원 탈퇴 처리 - 구매 내역이 없으면 즉시 삭제, 있으면 소프트 삭제  *',
  })
  @ApiResponse({ type: SingleMessageDto })
  deleteUser(@Req() req: Request) {
    return this.authService.deleteUser(req?.user as Payload);
  }

  @Public()
  @Post('google')
  @ApiOperation({
    summary: '구글 로그인',
    description: '구글 ID 토큰을 검증하고 사용자 로그인 또는 회원가입 처리  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  googleLogin(@Body() googleLoginReqDto: GoogleLoginReqDto) {
    return this.authService.googleLogin(googleLoginReqDto);
  }

  @Public()
  @Post('facebook')
  @ApiOperation({
    summary: '페이스북 로그인',
    description:
      '페이스북 Access 토큰을 검증하고 사용자 로그인 또는 회원가입 처리  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  facebookLogin(@Body() facebookLoginReqDto: FacebookLoginReqDto) {
    return this.authService.facebookLogin(facebookLoginReqDto);
  }

  @Public()
  @Post('apple')
  @ApiOperation({
    summary: '애플 로그인',
    description:
      '애플 Identity 토큰(iOS) 또는 Authorization Code(Android)를 검증하고 사용자 로그인 또는 회원가입 처리  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  appleLogin(@Body() appleLoginReqDto: AppleLoginReqDto) {
    return this.authService.appleLogin(appleLoginReqDto);
  }

  @Public()
  @Post('developer-login')
  @ApiOperation({
    summary: '개발자 로그인',
    description: '개발 서버에서만 기존 테스터 계정으로 로그인  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  developerLogin() {
    return this.authService.developerLogin();
  }

  @Public()
  @Post('tester-login')
  @ApiOperation({
    summary: '테스터 로그인',
    description: '환경변수로 명시한 테스터 계정으로 로그인  *',
  })
  @ApiResponse({ type: AuthTokenResDto })
  testerLogin(@Body() testerLoginReqDto: TesterLoginReqDto) {
    return this.authService.testerLogin(testerLoginReqDto);
  }

  @Public()
  @Post('anonymous')
  @ApiOperation({
    summary: '비로그인 사용자 생성',
    description:
      '로그인 없이 앱을 사용하는 anonymous 사용자를 생성합니다.  * guest-{timestamp}',
  })
  @ApiResponse({ type: AuthTokenResDto })
  anonymousLogin(@Body() anonymousLoginReqDto: AnonymousLoginReqDto) {
    return this.authService.anonymousLogin(anonymousLoginReqDto);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({
    summary: 'Apple Sign in with Apple 웹훅 처리',
    description:
      'Apple Sign in with Apple Server-to-Server Notifications 처리.  * 사용자가 Apple ID를 삭제하거나 앱 연결을 해제할 때 호출됩니다.  *',
  })
  @ApiResponse({ type: AppleSignInWebhookResDto })
  handleAppleSignInWebhook(
    @Body() appleSignInWebhookReqDto: AppleSignInWebhookReqDto,
  ) {
    return this.authService.handleAppleSignInWebhook(appleSignInWebhookReqDto);
  }

  /**
   * Apple OAuth Callback (Android용)
   * Apple에서 form_post로 전송한 authorization code를 받아 앱으로 redirect
   */
  @Public()
  @Post('apple/callback')
  @ApiOperation({
    summary: 'Apple OAuth Callback',
    description: 'Apple OAuth callback - authorization code를 앱으로 전달',
  })
  appleCallback(
    @Body() body: { code?: string; state?: string; error?: string },
    @Res() res: Response,
  ) {
    const { code, error, state } = body;

    const appScheme = process.env.APP_SCHEME;
    if (
      !appScheme ||
      !/^[a-z][a-z0-9+.-]*$/i.test(appScheme) ||
      /^(https?|javascript|data|file)$/i.test(appScheme)
    ) {
      return res.status(503).json({
        message:
          'Apple 로그인 설정 오류: APP_SCHEME에 유효한 앱 전용 URL 스킴을 설정하세요.',
      });
    }
    const encodedState = encodeURIComponent(state || '');

    if (error) {
      return res.redirect(
        `${appScheme}://apple-auth?error=${encodeURIComponent(error)}&state=${encodedState}`,
      );
    }

    if (code) {
      return res.redirect(
        `${appScheme}://apple-auth?code=${encodeURIComponent(code)}&state=${encodedState}`,
      );
    }

    return res.redirect(
      `${appScheme}://apple-auth?error=no_code&state=${encodedState}`,
    );
  }
}
