import { Reflector } from '@nestjs/core';

const OnlySelf = Reflector.createDecorator();

export { OnlySelf };
