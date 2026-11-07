import { envVariableKeys } from '@/common/constants/env';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { limitDatabaseConnections } from './connection-limits';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: limitDatabaseConnections(
            configService.get<string>(envVariableKeys.DATABASE_URL),
            Number(configService.get('DATABASE_CONNECTION_LIMIT') || 2),
          ),
        },
      },
      log: ['warn', 'error'],
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
