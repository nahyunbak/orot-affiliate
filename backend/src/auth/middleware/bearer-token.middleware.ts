import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { envVariableKeys } from '@/common/constants/env';
import { Payload } from '../utils/types';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
// Request 인터페이스 확장

@Injectable()
export class BearerTokenMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const _token = req.headers['authorization']; // basic or bearer token

      if (!_token) {
        next();
        return;
      }

      const parsedToken = _token.replace('Bearer ', '');
      const decoded = await this.jwtService.decode(parsedToken);
      if (
        !decoded ||
        (decoded.type !== 'refresh' && decoded.type !== 'access')
      ) {
        throw new UnauthorizedException('Invalid token');
      }
      const tokenType = decoded.type;

      const payload = await this.jwtService.verifyAsync(parsedToken, {
        secret: this.configService.get<string>(
          tokenType === 'refresh'
            ? envVariableKeys.JWT_REFRESH_SECRET
            : envVariableKeys.JWT_SECRET,
        ),
      });

      const account = await this.prisma.user.findFirst({
        where: { id: payload.id, email: payload.email, isDeleted: false },
        select: { id: true },
      });
      if (!account)
        throw new UnauthorizedException(ERROR_MESSAGE.AUTH.USER_DELETED);
      req.user = payload as Payload;

      next();
    } catch (error) {
      // 토큰 만료 에러를 request 객체에 저장
      if (error.name === 'TokenExpiredError') {
        req.error = ERROR_MESSAGE.AUTH.EXPIRED_ACCESS_TOKEN;
      } else if (error.name === 'JsonWebTokenError') {
        req.error = ERROR_MESSAGE.AUTH.INVALID_TOKEN;
      } else {
        req.error = ERROR_MESSAGE.AUTH.TOKEN_VERIFICATION_FAILED;
      }

      // Public 엔드포인트를 위해 next() 호출
      // AuthGuard에서 req.error를 체크하여 적절히 처리
      next();
    }
  }
}
