import './instrument';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SentryLogger } from './common/logger/sentry-logger.service';
import cookieParser from 'cookie-parser';
// fs 모듈 임포트
// path 모듈 임포트 (경로 조합에 유용)

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // ...(httpsOptions && { httpsOptions }), // httpsOptions가 존재할 때만 객체에 포함
    logger: new SentryLogger(),
  });

  app.useBodyParser('json', { limit: '40mb' });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: '40mb',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //정의하지 않은 값 방지.
      forbidNonWhitelisted: true, //정의하지 않은 값 넣을 경우 에러 발생
      transform: true, // 들어오는 데이터를 DTO 클래스의 인스턴스로 자동 변환
    }),
  );

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('Application API')
    .setDescription('Authentication, account, subscriptions and uploads')
    .setVersion('1.0')
    .addBearerAuth() // JWT 인증을 사용하는 경우
    .addBasicAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // Swagger UI 경로를 '/api'로 설정
  app.use(cookieParser());

  // CORS는 브라우저 보안 정책이므로 네이티브 앱에서는 불필요
  // Swagger UI 사용 시에만 필요한 경우 아래 주석 해제
  // app.enableCors({
  //   origin: true,
  //   credentials: true,
  //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  //   allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  // });

  app.enableShutdownHooks();
  await app.listen(process.env.PORT || 4000);
}
bootstrap();
