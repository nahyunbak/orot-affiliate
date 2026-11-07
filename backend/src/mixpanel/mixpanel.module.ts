import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MixpanelService } from './mixpanel.service';

@Module({
  imports: [ConfigModule],
  providers: [MixpanelService],
  exports: [MixpanelService],
})
export class MixpanelModule {}
