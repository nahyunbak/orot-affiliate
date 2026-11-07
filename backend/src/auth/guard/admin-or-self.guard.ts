// guards/admin-or-self.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminOrSelfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body;
    const query = request.query;

    // user_id가 body에 있는 경우
    if (body?.user_id) {
      return user.role >= UserRole.Admin || user.id === body.user_id;
    }

    if (query?.user_id) {
      return user.role >= UserRole.Admin || user.id === query.user_id;
    }

    return false;
  }
}
