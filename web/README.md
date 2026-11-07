# 웹 샘플

Next.js 16 App Router·Tailwind 4 기반의 최소 계정 화면이다. 데이터 서버는 NestJS·Prisma만 사용한다. 새로운 의존성은 추가하지 않았다.

## 실행

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

개발/실행 포트는 **3005**다. `BACKEND_URL`은 실행 중인 NestJS 서버 주소이며 기본값은 `http://localhost:4000`이다. PostgreSQL에 웹이 직접 연결하지 않는다. OAuth 값이 비어 있어도 화면은 시작하며 해당 버튼 실행 시 설정되지 않았다는 번역 메시지를 보여 준다. 게스트 로그인은 실행 중인 Backend가 필요하다.

## 화면과 플랫폼 경계

- Google/Apple/게스트 로그인 및 게스트 소셜 계정 연결, 현재 프로필 조회·이름/언어 수정, 프로필 이미지 업로드, 구독 상태, 로그아웃·계정 삭제.
- 프로필·계정·업로드는 생성된 Query/Mutation 훅을 재사용한다. 생성 API 파일은 직접 수정하지 않는다.
- 인증만 원본 웹의 전송 경계를 재사용한다. `/api/auth/*`가 NestJS 토큰 응답에서 refresh token을 분리해 HttpOnly·SameSite=Strict 쿠키에 저장한다. Access token은 메모리에만 보관한다. 새로고침 시 Backend `/auth/refresh`로 복구한다.
- Query key에 토큰을 넣지 않는다. 로그인/로그아웃/계정 전환은 진행 조회를 취소하고 캐시를 비운다. 전송 전후 계정 revision 검증으로 이전 계정의 늦은 응답을 폐기한다. 같은 브라우저의 다른 탭에는 BroadcastChannel로 세션 변경을 전달한다.
- 구매·복원, AdMob·ATT는 모바일 앱 전용이다. 웹은 서버의 `isPremium`만 표시하며 웹 결제를 흉내내지 않는다. Sentry·Meta의 네이티브 설정과 스토어 자동화는 Mobile 범위다. 원본 웹의 Mixpanel 익명 페이지 조회는 선택적 환경변수로 유지하며 localhost/DNT/GPC에서는 보내지 않는다.
- 이미지 업로드는 JPG/PNG/WebP, 최대 5MB다. 프록시도 본문 크기를 제한한다. Backend의 MIME·권한·저장소 검증은 별도로 유지해야 한다.

## Backend·생성기 계약

| 동작        | 메서드·경로                                 | 계약                                                                |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------- |
| 게스트      | POST `/auth/anonymous`                      | `{ initialPlatform: 'WEB' }` → `{ accessToken, refreshToken }`      |
| Google      | POST `/auth/google`                         | `{ idToken, initialPlatform: 'WEB' }` → 동일 토큰 응답              |
| Apple       | POST `/auth/apple`                          | `{ identityToken, initialPlatform: 'WEB' }` → 동일 토큰 응답        |
| 갱신        | POST `/auth/refresh`                        | `{ refreshToken }` → 회전된 토큰 응답                               |
| 프로필      | GET `/user/mypage`                          | `id,email,name,profile_image,language,role,auth_provider,isPremium` |
| 프로필 변경 | PATCH `/user/update-info`                   | `{ name?, language?, profile_image? }`                              |
| 업로드      | POST `/upload/upload?kind=profile&name=...` | multipart `file` → `{ success, data: { url } }`                     |
| 탈퇴        | DELETE `/auth/withdraw`                     | 생성된 `useDeleteUserMutation`                                      |

Google 토큰 서명·audience 검증은 Backend가 수행해야 한다. Apple 웹 Service ID를 Backend의 허용 audience에 포함해야 하며 웹 경계에서도 서명·nonce·state·c_hash를 검증한다. Google provider 콘솔에는 웹 origin을, Apple에는 `APPLE_REDIRECT_URI`를 등록한다. Apple은 제공자 정책에 맞는 HTTPS 도메인이 필요하므로 localhost에서 실로그인 성공을 가정하지 않는다.

위 경로는 source 생성 클라이언트를 기준으로 한다. Backend 재생성 후 `name`/`profile_image` DTO 및 업로드 경로가 바뀌면 이 화면과 허용 목록을 함께 맞춘다. 생성 파일은 원본 서비스와 함께 갱신한다.

## 환경변수

| 이름                                               | 적용 대상     | 필수/미설정 동작                          |
| -------------------------------------------------- | ------------- | ----------------------------------------- |
| `BACKEND_URL`                                      | 웹 서버       | 기본 `http://localhost:4000`              |
| `GOOGLE_CLIENT_ID`                                 | 웹 서버       | 선택, 미설정 시 Google 로그인 불가 안내   |
| `APPLE_SERVICE_ID`                                 | 웹 서버       | 선택, 미설정 시 Apple 로그인 불가 안내    |
| `APPLE_REDIRECT_URI`                               | 웹 서버       | Apple 사용 시 필수, 현재 웹 origin과 일치 |
| `NEXT_PUBLIC_APP_NAME`                             | 웹 클라이언트 | 기본 Full Template                        |
| `NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_TERMS_URL` | 웹 클라이언트 | 선택, 미설정 링크 숨김                    |
| `NEXT_PUBLIC_MIXPANEL_TOKEN`                       | 웹 클라이언트 | 선택, 미설정 시 분석 전송 없음            |

## 공통 번역

루트 `mobile/i18n/translations.csv`의 `web.*` 키를 공유한다. 웹만 생성한 프로젝트에서는 `web/src/i18n/translations.csv`가 원본이다. `pnpm generate-i18n`으로 locale JSON과 타입을 생성한다. `resources.ts`는 flat key JSON을 i18next에 연결하며 UI 한국어를 컴포넌트에 하드코딩하지 않는다.

## 검증

```bash
node --test tests/*.test.mjs
pnpm lint
pnpm typecheck
pnpm build
```

회귀 테스트는 교차 출처 차단, refresh token 비노출·회전, OAuth state 불일치, 계정 전환 중 늦은 응답 폐기, 401 단일 재시도를 검증한다. PC·모바일 브라우저 QA와 실제 OAuth·스토리지 통신 검증은 별도로 수행한다.

게스트 소셜 연결은 `anonymousEmail`과 현재 메모리의 `anonymousAccessToken`을 함께 전달한다. 웹 경계는 둘 중 하나만 있는 요청을 거부하며 최종 토큰 유효성·소유권 검증은 Backend가 수행한다. 로그인 응답은 raw token DTO와 성공 `CommonResponse` 래퍼 모두에서 refresh token을 분리한다. 추가 번역 키: `web.auth.link` (게스트 계정 연결 / Keep your guest account).
