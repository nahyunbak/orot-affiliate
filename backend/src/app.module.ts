import { PrismaModule } from './prisma/prisma.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import Joi from 'joi';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guard/auth.guard';
import { RBACGuard } from './auth/guard/rbac.guard';
import { BearerTokenMiddleware } from './auth/middleware/bearer-token.middleware';
import { FcmModule } from './fcm/fcm.module';
import { PaymentModule } from './payment/payment.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';

const optionalString = Joi.string().trim().empty('').optional();
const optionalUri = Joi.string().trim().uri().empty('').optional();
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
      validationSchema: Joi.object({
        // Environment
        NODE_ENV: Joi.string().default('development'),
        PORT: Joi.number().default(4000),

        // Database
        DATABASE_URL: Joi.string().required(),

        // AWS / Cloudflare R2
        AWS_ENDPOINT: optionalString,
        AWS_ACCESS_KEY_ID: optionalString,
        AWS_SECRET_ACCESS_KEY: optionalString,
        AWS_BUCKET_NAME: optionalString,
        CLOUDFLARE_R2_DOMAIN: optionalString,

        // Auth
        HASH_ROUND: Joi.number().default(12),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string()
          .min(32)
          .invalid(Joi.ref('JWT_SECRET'))
          .required(),
        DELETED_USER_RETENTION_DAYS: Joi.number()
          .integer()
          .positive()
          .empty('')
          .optional(),
        IAP_PRODUCT_IDS: optionalString,

        // Google
        GOOGLE_CLIENT_ID: optionalString,
        GOOGLE_ANDROID_CLIENT_ID: optionalString,
        GOOGLE_IOS_CLIENT_ID: optionalString,
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: optionalString,

        // Apple
        APPLE_SHARED_SECRET: optionalString,
        BUNDLE_ID: optionalString,
        APPLE_SERVICE_ID: optionalString,
        APPLE_TEAM_ID: optionalString,
        APPLE_KEY_ID: optionalString,
        APPLE_PRIVATE_KEY: optionalString,
        APPLE_REDIRECT_URI: optionalUri,

        // Firebase (FCM)
        FIREBASE_PROJECT_ID: optionalString,
        FIREBASE_CLIENT_EMAIL: optionalString,
        FIREBASE_PRIVATE_KEY: optionalString,

        // AI

        // Groq

        // Sentry
        SENTRY_DSN: optionalString,

        // Mixpanel
        MIXPANEL_PROJECT_TOKEN: optionalString,
        MIXPANEL_PROJECT_ID: optionalString,
        MIXPANEL_SERVICE_ACCOUNT_USERNAME: optionalString,
        MIXPANEL_SERVICE_ACCOUNT_SECRET: optionalString,

        // Discord
        DISCORD_WEBHOOK_PURCHASE: optionalUri,
        DDISCORD_WEBHOOK_PURCHASE: optionalUri,
        DISCORD_WEBHOOK_NEW_USER: optionalUri,
        DISCORD_WEBHOOK_ANALYTICS: optionalUri,
      }),
    }),
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AffiliateModule,
    AuthModule,
    UploadModule,
    UserModule,
    PaymentModule,
    FcmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RBACGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(BearerTokenMiddleware)
      .exclude(
        { path: 'api/auth/login', method: RequestMethod.POST },
        { path: 'api/auth/signup', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
