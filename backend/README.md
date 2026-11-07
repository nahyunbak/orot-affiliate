# 공통 NestJS 백엔드

PostgreSQL·Prisma와 인증, 계정, FCM, 구독, 업로드를 제공한다. API 원본은 Service JSDoc·DTO·Prisma schema이며, 계약은 [공통 정책](../POLICIES.md), 프로젝트 설정은 [보일러플레이트 가이드](../boiler-guide.md)를 참고한다.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# 자신의 개발 DB와 서로 다른 JWT 서명 키를 설정한 뒤 실행
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm generate-api
pnpm dev
```

기본 포트는 4000, Swagger 문서는 `/api`다. API 경로에 `/api` 공통 prefix는 없으며 Swagger와 구분한다. 웹은 자체 `/api/backend` 프록시에서 이 서버로 전달한다.

선택 외부 연동의 키를 입력하지 않아도 서버는 기동하지만, 해당 기능은 설정 완료 후 사용할 수 있다. `DELETED_USER_RETENTION_DAYS`를 설정하지 않으면 탈퇴 계정의 자동 영구 삭제는 비활성이다.

```sh
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

테스트는 서비스 경계를 모의 호출하며 실제 OAuth, 결제, FCM을 호출하지 않는다. UI/API 통합 확인은 별도 개발 DB에서 수행한다. 초기 migration은 빈 DB용이며 reset 명령은 로컬 개발용 호환 명령이며 검증·설치 과정에서는 실행하지 않는다.
