// guards/admin-or-self.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class OnlySelfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body;
    const params = request.params;

    // user_id가 body에 있는 경우
    if (body?.user_id) {
      return user.id === body.user_id;
    }

    // user_id가 params에 있는 경우
    if (params?.user_id) {
      return user.id === params.user_id;
    }

    return false;
  }
}
