import { Reflector } from '@nestjs/core';

const AdminOrSelf = Reflector.createDecorator();

export { AdminOrSelf };
