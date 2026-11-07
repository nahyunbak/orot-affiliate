import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Public } from '../decorator/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    //퍼믈릭 decoration 이 되어있을 경우 모든 로직을 bypass 한다. 데코레이터에 인자로 넘긴 값이 프린트된다.
    // string혹은 배열값

    const isPublic = this.reflector.getAllAndOverride<boolean>(Public, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 미들웨어에서 설정한 에러가 있는 경우 처리
    if (request.error) {
      throw new UnauthorizedException(request.error);
    }

    //요청에 user가 있는지 확인한다. ForbiddenException 이 발생할 경우 403 에러 발생
    if (!request.user || request.user.type !== 'access') {
      return false;
    }
    return true;
  }
}
