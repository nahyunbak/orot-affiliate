# 환경변수와 프로젝트 식별자

`.env.example`을 각 위치의 `.env`로 복사하고 프로젝트 소유 값으로 채운다. 루트 설정은 개발 도구, `backend/.env`는 서버, `mobile/.env`는 Expo, `web/.env.local`은 Next.js용이다. 실제 `.env`, 서비스 계정 JSON, Apple 서명 키, Firebase 플랫폼 인증서, EAS 프로젝트 ID는 템플릿에서 제공하지 않는다.

## 공개 값과 비밀 값

- `EXPO_PUBLIC_*`와 `NEXT_PUBLIC_*`는 앱 번들에 포함되는 공개 설정이다. OAuth client ID·상품 ID·광고 unit ID·앱 이름·사이트 URL만 넣는다.
- JWT 서명 키, Firebase private key, 스토어 API private key, 스토리지 비밀 키는 서버 또는 로컬 업로드 도구에서만 읽는다.
- Expo 공개 설정 변경은 번들 또는 네이티브 빌드에 반영해야 한다. 번들 ID·네이티브 OAuth scheme·Firebase 인증서·광고 앱 ID 변경은 네이티브 prebuild/build가 필요하다.
- 서버 `DATABASE_URL`은 개발 DB를 명시한다. 마이그레이션 전 대상 주소를 확인하며 운영 DB를 리셋하지 않는다.

## 설정 단위

| 기능                   | 설정 위치                                      | 미설정 동작                                        |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------- |
| PostgreSQL·JWT         | backend                                        | 서버 실행에 필수. 서로 다른 최소 32자 서명 키 사용 |
| Google·Apple 로그인    | backend + 해당 client                          | 제공자 설정 후 사용                                |
| FCM 푸시               | backend Firebase 계정 + mobile 네이티브 인증서 | 미설정 상태에서는 발송·토큰 등록 불가              |
| IAP 구독               | backend 스토어 인증 + mobile 상품 ID           | 실제 상품 구매는 스토어 설정 후 사용               |
| AdMob                  | mobile 앱 ID·광고 unit ID                      | 개발용 테스트 설정과 운영 설정을 구분              |
| Sentry·Mixpanel·Meta   | 각 앱의 선택 설정                              | 미설정 시 외부 보고 비활성                         |
| 업로드                 | backend 스토리지 설정                          | 스토리지 설정 후 사용                              |
| 약관·개인정보·지원 URL | mobile/web 공개 설정                           | 새 제품 정책·지원 URL로 설정                       |
| 스토어 메타데이터      | root + mobile/fastlane                         | 로컬 생성과 실제 스토어 업로드를 구분              |

각 변수의 정확한 이름·예시는 해당 디렉터리의 `.env.example`이 원본이다. 클라이언트 설정을 서버 비밀 값으로 채우지 않는다. GitHub Actions의 Sentry 연동은 Actions secrets/variables를 사용한다.

## 선택형 Figma 도구

루트 `FIGMA_DESIGN_URL`, `FIGMA_FILE_KEY`, `FIGMA_NODE_ID`로 자신의 디자인을 지정한다. 플러그인 네트워크 도메인은 `figma/figma-plugin/manifest.json`에서 프로젝트 이미지 호스트로 설정한다. 기본값은 외부 네트워크를 사용하지 않는다.

Apple JWS 검증 설정은 [Apple IAP 안내](apple-iap.md)를 따른다. `DELETED_USER_RETENTION_DAYS`는 양의 정수로 설정한 경우에만 탈퇴 계정 자동 영구 삭제를 실행하며, 미설정 시 비활성이다. Docker Compose 사용 시 `POSTGRES_PASSWORD`를 설정하고 `DATABASE_URL`과 일치시킨다.

전체 준비 순서와 기능별 필수 설정·미설정 동작은 루트 [boiler-guide.md](../boiler-guide.md)를 참고한다.

## Inchain(인체인) 테스트넷 기능 추가 설정

| 이름                                        | 위치     | 필수 여부 / 미설정 동작                             | 용도                                                             |
| ------------------------------------------- | -------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                              | Backend  | 필수                                                | 테스트 사용자·암호화 지갑·캠페인·서명 거래를 저장하는 PostgreSQL |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`          | Backend  | 기존 필수, 서로 다르게 설정                         | 기존 템플릿 인증                                                 |
| `WALLET_ENCRYPTION_KEY`                     | Backend  | 지갑 생성/서명에 필수, 32바이트 hex, 미설정 시 실패 | AES-256-GCM 개인키 암호화. DB 이동 시 비밀 관리 경로로 별도 전달 |
| `MAROO_RPC_URL`                             | Backend  | 기본 `https://rpc-testnet.maroo.io`                 | 실제 테스트넷 조회·전송. 서명 전 체인 ID 450815 검사             |
| `TESTER_EMAIL`, `TESTER_PASSWORD`           | Backend  | 데모 집행자 로그인에 필수                           | 기존 tester-login 재사용, seed가 Admin 사용자 생성               |
| `BACKEND_URL`                               | Web 서버 | 로컬 예시 `http://127.0.0.1:4010`                   | 인증·API 프록시 대상                                             |
| `OROT_DEMO_MODE`                            | Web 서버 | 기본 미설정/false → 데모 로그인 503                 | true일 때만 테스트 집행자 자동 로그인. 운영에서는 끔             |
| `OROT_TESTER_EMAIL`, `OROT_TESTER_PASSWORD` | Web 서버 | 데모 로그인에 필수                                  | Backend의 테스터 설정과 일치, 클라이언트에 노출하지 않음         |

지갑 키·JWT 키·테스터 비밀번호를 `NEXT_PUBLIC_` 변수로 만들지 않습니다. `.env`·`.secrets`·`.data`는 Git에서 제외합니다. 현재 테스트용 기본 포트는 Web 4173, Backend 4010, 별도 로컬 DB 55432입니다.
