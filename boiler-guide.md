# 보일러플레이트 시작 가이드

새 앱을 만들 때 이 문서 순서대로 프로젝트 식별자와 `.env`를 채운다. 실제 키·인증서·계정은 커밋하지 않는다. 아래 선택 연동은 사용하려는 기능에만 설정한다.

## 1. 설치와 기본 실행

Node.js와 `corepack pnpm` 10.13.1을 사용한다. 루트와 선택한 앱 폴더에서 `corepack pnpm install --frozen-lockfile`을 실행한다. 새 프로젝트 생성은 [README](README.md#새-프로젝트-생성)의 `pnpm scaffold`를 따른다.

| 원본                                 | 복사 위치        | 용도                                |
| ------------------------------------ | ---------------- | ----------------------------------- |
| [루트 설정](.env.example)            | `.env`           | Figma·스토어 메타데이터·개발 도구   |
| [Backend 설정](backend/.env.example) | `backend/.env`   | DB·인증·결제·서버 연동              |
| [Mobile 설정](mobile/.env.example)   | `mobile/.env`    | Expo 빌드·네이티브 SDK·공개 앱 설정 |
| [Web 설정](web/.env.example)         | `web/.env.local` | 서버 API 프록시·공개 웹 설정        |

각 `.env.example`이 전체 변수 목록의 원본이다. `EXPO_PUBLIC_*`와 `NEXT_PUBLIC_*`는 배포물에 포함되는 공개 값이다. 서버 비밀 키를 넣지 않는다.

### 반드시 채울 값

| 변수                                                                                  | 위치         | 값과 기본 동작                                                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                        | Backend      | 본인 개발 PostgreSQL 연결 문자열. 미설정 시 부팅 거부                    |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`                                                    | Backend      | 서로 다른 32자 이상 난수. `pnpm generate-jwt`로 생성하고 서버에만 저장   |
| `NODE_ENV`, `PORT`                                                                    | Backend      | 개발은 `development`, 기본 예시는 4000                                   |
| `BACKEND_URL`                                                                         | Web 서버     | 예: `http://localhost:4000`. 비밀 설정이며 공개 접두사를 붙이지 않음     |
| `EXPO_PUBLIC_API_URL`                                                                 | Mobile       | 실제 기기에서 접근 가능한 개발 서버 주소. localhost는 기기 자신을 가리킴 |
| `EXPO_APP_NAME`, `EXPO_APP_SLUG`, `EXPO_APP_VERSION`                                  | Mobile 빌드  | 새 앱의 이름·Expo slug·버전                                              |
| `EXPO_PUBLIC_APP_SCHEME`, `EXPO_PUBLIC_BUNDLE_ID`, `EXPO_PUBLIC_ANDROID_PACKAGE_NAME` | Mobile       | 새 앱의 스킴·iOS bundle ID·Android package. 스토어/OAuth와 일치시킴      |
| `BUNDLE_ID`, `APP_SCHEME`                                                             | Backend·루트 | 모바일 식별자와 일치. Apple 검증·Android Apple callback에서 사용         |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_PASSWORD`                  | Backend      | Docker Compose를 쓸 때만 설정. `DATABASE_URL`과 일치                     |

빈 개발 DB를 준비한 뒤 `pnpm -C backend exec prisma generate`, `pnpm -C backend prisma-migrate`, `pnpm -C backend generate-api`, `pnpm generate-i18n`을 실행한다. 이후 `pnpm -C backend dev`, `pnpm -C web dev`, `pnpm -C mobile start`를 별도 터미널에서 실행한다. DB 리셋은 설치 절차가 아니며 실행하지 않는다.

## 2. 로그인과 푸시

| 기능   | 설정할 변수/파일                                                                                                                                                                                                                                                     | 미설정 동작                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Google | Backend `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`; Mobile `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`(선택), `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`; Web `GOOGLE_CLIENT_ID` | 제공자 로그인 거부/설정 안내. 게스트 경로는 별도                                 |
| Apple  | Backend `BUNDLE_ID`, `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_REDIRECT_URI`, `APP_SCHEME`; Mobile `EXPO_PUBLIC_APPLE_SERVICE_ID`, `EXPO_PUBLIC_APPLE_REDIRECT_URI`; Web `APPLE_SERVICE_ID`, `APPLE_REDIRECT_URI`             | 설정 없는 경로는 실패. iOS identityToken과 Android authorizationCode 경로를 구분 |
| FCM    | Backend `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`; Mobile `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICES_PLIST`                                                                                                                               | 미설정 플랫폼의 푸시는 비활성                                                    |

`mobile/certificate/google-services.json`, `GoogleService-Info.plist`는 빈 자리표시자다. 본인 Firebase 프로젝트에서 받은 파일로 교체하고 경로를 위 환경변수에 지정한다. 빈 파일은 정상 인증서로 간주하지 않는다. 로그인 후 OS 권한·FCM 토큰 등록/갱신을 별도 확인한다.

## 3. 구독·결제와 스토어

- Backend `IAP_PRODUCT_IDS`에 허용 상품을 쉼표로 적는다. 미설정 시 임의 상품을 승인하지 않는다.
- Mobile `EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID`, `EXPO_PUBLIC_ANDROID_SUBSCRIPTION_PRODUCT_ID` 및 필요 시 `*_YEARLY_PRODUCT_ID`, `*_MONTHLY_PRODUCT_ID`를 본인 상품/base plan과 맞춘다.
- Apple JWS는 `APPLE_IAP_ENVIRONMENT`, `APPLE_IAP_ROOT_CA_PATHS`, `BUNDLE_ID`가 필요하고 Production은 `APPLE_IAP_APP_APPLE_ID`도 필요하다. legacy 영수증은 `APPLE_SHARED_SECRET`을 사용한다. [Apple IAP 안내](docs/apple-iap.md)를 따른다.
- Google 검증은 Backend `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`에 본인 서비스 계정 파일 경로를 지정한다. 웹훅 예시는 [Google RTDN](backend/docs/google-webhook-example.md)을 참고한다.
- EAS: `EXPO_EAS_PROJECT_ID`, `APPLE_ID`, `APPLE_TEAM_ID`를 설정한다. App Store Connect의 `APP_STORE_CONNECT_TEAM_ID`는 Developer Team ID와 다른 설정이다.
- Fastlane/메타데이터: `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY_PATH`, `APP_BUNDLE_ID`, `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH`를 사용한다. 도구별 호환 변수 `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY_PATH`는 루트 예시에 있다.
- `mobile/certificate/google-play-key.json`의 `{}`는 제출 가능한 키가 아니다. 본인 키로 교체해야 EAS 제출이 가능하다. [가격 배수 참고](docs/iap-pricing.md)는 실제 판매 가격을 확정하지 않는다.

실제 구매·복원·서버 알림은 스토어 sandbox 계정으로 검증한다. 템플릿 설치 과정에서 제출·과금·배포를 실행하지 않는다.

## 4. 선택 연동

| 기능               | 변수                                                                                                                                          | 미설정 시                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Sentry             | Backend `SENTRY_DSN`, Mobile `EXPO_PUBLIC_SENTRY_DSN`                                                                                         | 외부 오류 전송 비활성                                           |
| Mixpanel           | Backend `MIXPANEL_PROJECT_TOKEN`, Mobile/Web `EXPO_PUBLIC_MIXPANEL_TOKEN`/`NEXT_PUBLIC_MIXPANEL_TOKEN`                                        | 외부 이벤트 전송 비활성                                         |
| Mixpanel 조회      | Backend `MIXPANEL_PROJECT_ID`, `MIXPANEL_SERVICE_ACCOUNT_USERNAME`, `MIXPANEL_SERVICE_ACCOUNT_SECRET`                                         | 조회 연동 비활성                                                |
| Meta               | Mobile `EXPO_PUBLIC_FACEBOOK_APP_ID`, `EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN`                                                                     | 설치 어트리뷰션 비활성                                          |
| AdMob              | Mobile `EXPO_PUBLIC_ADMOB_APP_ID_IOS/ANDROID`, `EXPO_PUBLIC_ADMOB_BANNER_ID_IOS/ANDROID`, `EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID_IOS/ANDROID` | 광고 비활성. 보상 광고에는 앱 ID와 광고 unit ID 모두 필요       |
| S3/R2              | Backend `AWS_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `CLOUDFLARE_R2_DOMAIN`                               | 업로드 거부                                                     |
| Discord            | Backend `DISCORD_WEBHOOK_PURCHASE`, `DISCORD_WEBHOOK_NEW_USER`, `DISCORD_WEBHOOK_ANALYTICS`                                                   | 알림 비활성                                                     |
| 계정 보존          | Backend `DELETED_USER_RETENTION_DAYS`                                                                                                         | 미설정이면 자동 영구 삭제 OFF. 양의 정수 설정 시 해당 기간 사용 |
| 개발 테스트 계정   | Backend `TESTER_EMAIL`, `TESTER_PASSWORD`                                                                                                     | 테스트 로그인 불가. 운영 계정을 입력하지 않음                   |
| Sentry 이슈 동기화 | 루트/Actions `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECTS`                                                                             | 동기화 미동작. 토큰은 Actions secret 사용                       |

## 5. 공통 화면·약관·자산

웰컴·온보딩·메인·마이페이지·설정·FAQ·구독 화면은 새 앱의 시작 골격이다. 공통 컴포넌트와 코치마크를 재사용하고 제품 콘텐츠를 채운다. `mobile/assets/terms/`의 약관·개인정보처리방침은 초안 자리표시자이며 공개 전 실제 서비스 내용으로 작성한다.

공통 연락처 `EXPO_PUBLIC_DEVELOPER_EMAIL`은 선택이며 기본 빈 문자열이다. 공개 링크는 Mobile `EXPO_PUBLIC_SUPPORT_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`, Web `NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_TERMS_URL`, 메타데이터용 루트 `SUPPORT_URL`, `PRIVACY_POLICY_URL`, `TERMS_OF_SERVICE_URL`, `MARKETING_URL`, `DEVELOPER_EMAIL`에 설정한다. 빈 링크는 노출하지 않는다.

교체할 mock PNG는 원본 크기를 유지한다: `app-icon.png` 512×512, `splash-ios.png` 1125×2436, `logo-white.png` 898×327, `logo-white-android.png` 1024×1024. 제품 로고가 아닌 단순 사각형이다.

## 6. Figma·API 생성·배포

`FIGMA_FILE_KEY`는 **파일 전체** 식별자이고 `FIGMA_NODE_ID`는 그 파일 안의 페이지·프레임·컴포넌트 등 특정 노드를 가리킨다. 페이지 하나로 고정된 값이 아니다. `FIGMA_DESIGN_URL`은 사람이 열어 볼 원본 링크이며, 화면 여러 개는 `figma/screens-map.json`에 각 `nodeId`·`slug`를 기록한다. `FIGMA_NODE_ID`는 초기 예시 항목용이다. Figma를 쓰지 않으면 비워 둔다.

API는 Service JSDoc·DTO·Prisma schema를 수정한 뒤 `pnpm -C backend generate-api`로 Backend controller와 클라이언트를 생성한다. 중간 작업용 `CLEANUP_PLAN.md`·`BACKEND_CONTRACT.md` 대신 이 문서, [정책](POLICIES.md), [생성기 안내](scripts/README.md)를 유지한다.

CodeDeploy의 `backend/appspec.yml`, `backend/codepipeline/`은 복원되어 있다. `orot-affiliate`를 실제 배포 디렉터리/PM2 프로세스 이름으로 치환하고 `/home/ubuntu/<앱>/backend/.env.production`을 서버에서 준비한다. Scaffold는 slug를 자동 치환한다. 원본 hook 순서는 stop → install/migrate → start → health check이며 `/health`를 확인한다. 배포 아티팩트에는 미리 빌드한 `dist`를 포함해야 한다. 스크립트는 문법만 검증하며 실제 실행은 배포 시 별도로 수행한다.
