import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

const RBAC = Reflector.createDecorator<UserRole>();

export { RBAC };
