import {
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';

// 신뢰 루트는 운영자가 Apple PKI에서 내려받은 공개 인증서만 설정한다.
// https://www.apple.com/certificateauthority/
export function createAppleVerifier(config: ConfigService): SignedDataVerifier {
  const environment = config.get<string>('APPLE_IAP_ENVIRONMENT');
  const bundleId = config.get<string>('BUNDLE_ID')?.trim();
  const paths = config
    .get<string>('APPLE_IAP_ROOT_CA_PATHS')
    ?.split(',')
    .map((p) => p.trim());
  const appId = config.get<string>('APPLE_IAP_APP_APPLE_ID')?.trim();
  if (
    (environment !== Environment.SANDBOX &&
      environment !== Environment.PRODUCTION) ||
    !bundleId ||
    !paths?.length ||
    paths.some((p) => !p) ||
    (environment === Environment.PRODUCTION && !appId) ||
    (appId &&
      (!/^\d+$/.test(appId) ||
        !Number.isSafeInteger(Number(appId)) ||
        Number(appId) <= 0))
  ) {
    throw new Error('Apple IAP verification is not configured correctly');
  }
  return new SignedDataVerifier(
    paths.map((path) => readFileSync(path)),
    true,
    environment,
    bundleId,
    appId ? Number(appId) : undefined,
  );
}
