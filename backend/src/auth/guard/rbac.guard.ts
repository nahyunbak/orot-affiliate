import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC } from '../decorator/rbac.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class RBACGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest(); // .user안에 들어 있는, JWt로 파싱된것.

    //퍼믈릭 decoration 이 되어있을 경우 모든 로직을 bypass 한다. 데코레이터에 인자로 넘긴 값이 프린트된다.
    // string혹은 배열값
    const role = this.reflector.get(RBAC, context.getHandler()); //기준점

    //Role Enum 값이 있을 경우 해당 값이 있는지 확인한다. > 그럴 경우 그냥 퍼블릭인거로.
    if (!Object.values(UserRole).includes(role)) {
      return true;
    }

    //요청에 user가 있는지 확인한다. ForbiddenException 이 발생할 경우 403 에러 발생
    if (!request.user || request.user.type !== 'access') {
      return false;
    }

    const roles = Object.values(UserRole);
    const roleIndex = roles.indexOf(role);
    const requestRoleIndex = roles.indexOf(request.user.role);
    return requestRoleIndex >= roleIndex;
  }
}
