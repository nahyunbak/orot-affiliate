import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FcmController } from './fcm.controller';
import { FcmService } from './fcm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MixpanelModule } from '@/mixpanel/mixpanel.module';

@Module({
  imports: [PrismaModule, ConfigModule, MixpanelModule],
  controllers: [FcmController],
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}
