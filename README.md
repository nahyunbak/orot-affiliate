# Inchain(인체인) — Instagram 피드 검수와 Maroo 테스트넷 정산

인스타그램처럼 게시물을 보면서 집행기간·필수 키워드·인게이지 조건을 검수하고, 승인한 크리에이터의 실제 테스트 지갑으로 보상을 지급하는 해커톤 웹앱입니다.

**게시물·사진·성과 수치는 목업이고, 사용자 계정·지갑·서버 저장·PCL 정책·승인·지급은 실제입니다.** 실제 인스타그램 계정이나 Instagram API를 만들거나 연결하지 않았습니다.

제품 범위, 사용자 흐름, 데이터·API 계약과 남은 결정 사항은 [Inchain PRD](docs/PRD.md)에서 확인할 수 있습니다.

## 브랜드

**Inchain(인체인)**은 Influencer와 Chain의 연결을 담은 이름입니다. 슬로건은 **“브랜드와 인플루언서를 잇다”**이며, 두 연결 고리 심볼은 브랜드와 인플루언서의 협업을 표현합니다. 화면과 브라우저 아이콘은 같은 SVG 원본을 사용합니다.

## 기반과 구성

`nahyunbak/full-template` 공식 main의 `5ed47edd63c6f21ff55592ad204f0a65f48b8532`에서 `--targets web --data nest`로 생성했습니다. 기존 공통 버튼, 인증, RBAC, 서버 프록시, TanStack Query, Zustand, T3 env, 번역 생성 구조를 사용합니다. 추가 SDK `ethers`는 사용자 승인 후 설치했습니다.

- `web/`: Next.js App Router, React, Tailwind. PC는 피드+검수 패널, 모바일은 피드+검수 바텀시트.
- `backend/`: NestJS, Prisma, PostgreSQL. 실제 테스트 사용자와 AES-256-GCM 암호화 지갑 보관.
- `contracts/`: 캠페인 예산 예약·승인·중복 지급 차단을 담당하는 Solidity 컨트랙트.
- `backend/fixtures/`: Instagram API 대신 사용하는 명시적인 데모 증빙.
- `backend/chain-artifacts/`: 검증한 컨트랙트 ABI·bytecode, 공식 Maroo contracts 0.1.0의 PCL ABI 부분집합(MIT).
- `backend/src/affiliate/`: 승인·반려·재검수·지급 API 및 실제 테스트넷 서명.
- `web/src/query/affiliate-custom.ts`: 65초 거래 응답 대기·인증 갱신·주기 조회를 위한 custom 전송/쿼리 경계. UI에서 직접 API를 호출하지 않습니다.

이전 정적 HTML·데모 지갑 코드와 중복 검증 코드는 제거했습니다. 현재 앱은 서버 연결 실패를 가짜 성공이나 데모 지급으로 대체하지 않습니다.

## 실행

Node.js 20.19+, pnpm 10.13.1, PostgreSQL이 필요합니다.

```sh
pnpm install
pnpm --dir backend install
pnpm --dir packages/client-backup install
pnpm --dir web install
cp backend/.env.example backend/.env
cp web/.env.example web/.env.local
```

로컬 설정 파일에 자신의 **개발용 DB**와 독립적인 JWT 비밀 값, 32바이트 hex 형식 지갑 암호화 키를 설정합니다. 이번 작업에서 만든 로컬 설정과 키는 `.env`·`.secrets`에만 있으며 Git에 포함되지 않습니다.

```sh
pnpm --dir backend exec prisma generate
pnpm --dir backend exec prisma migrate deploy
pnpm --dir backend setup:testnet
pnpm dev:backend
# 별도 터미널
pnpm start
```

웹: <http://127.0.0.1:4173>, 백엔드: <http://127.0.0.1:4010>. 현재 로컬 PostgreSQL은 기존 DB와 분리된 55432 포트의 새 클러스터입니다. DB 파일·비밀 파일은 `backend/.data`·`backend/.secrets`에 저장하고 Git에서 제외합니다. 운영 데모 API는 `https://orot-api.doneit.agency`의 기존 EC2에서 실행합니다.

`setup:testnet`은 기존 캠페인 이력을 보존한 새 `maroo-hackathon-november` 캠페인과 `maroo-s1`~`maroo-s5` 참여 기록을 만들며 기존 계정/지갑을 재사용하고, 필요한 경우 공식 faucet에서 집행자 자금을 받은 뒤 PCL 프록시 배포·정책 연결·예산 예치를 수행합니다. faucet 오류 때는 잔액을 먼저 확인하며 무조건 반복 호출하지 않습니다. 실제 마루 테스트넷에 쓰는 명령입니다.

## 기존 커피 캠페인의 보존된 테스트넷 기록

- 체인 ID: **450815**
- 실제 사용자: 집행자 1명 + 인플루언서 5명.
- [정산 프록시](https://explorer-testnet.maroo.io/address/0xfbd8b82f610c3a1161FeEa5faEa33C086CD2eAd1)
- [PCL 건당 지급 한도 설정](https://explorer-testnet.maroo.io/tx/0x2036a0e95930bbaaec6ac9bee4bd0f36f535bdb869f771afcd4cff22d23c3614)
- [2,500 tOKRW 예치](https://explorer-testnet.maroo.io/tx/0xde0da395b36b452291cbcadd24dc511590424eac737d7648f3a533f03a278cc4)
- [하린 승인 거래](https://explorer-testnet.maroo.io/tx/0xe3d4ff55f23f37d130309de094b58237ef30c2c9f4bb4ae91f8f92896685caee)
- [하린에게 500 tOKRW 지급](https://explorer-testnet.maroo.io/tx/0xa5878f221d25bad066dc11fea7bbac29552c25825f40d79e16d2a4c2bb7c0b6d)

지급 영수증 status=1과 수신 지갑 잔액의 500 tOKRW 증가를 각각 조회해 확인했습니다. tOKRW는 실제 원화 가치가 없는 테스트 토큰입니다.

## 검증

```sh
pnpm test                         # 조건, 암호화, 중단된 거래 복구
pnpm typecheck                    # 웹 및 백엔드
pnpm lint                         # 웹 ESLint
pnpm --dir backend exec eslint src/affiliate src/app.module.ts
pnpm --dir backend build
pnpm --dir web build
forge test -vv                    # Solidity 단위 테스트
pnpm --dir backend verify:testnet # 실제 API·테스트넷 통합 검증
```

로컬 구버전 Foundry 대신 공식 v1.9.0과 Solidity 0.8.24로 컨트랙트 테스트 15개를 검증했습니다. 실제 통합 검증은 새 참여자 maroo-s5를 지급 대상으로 사용하며 이미 지급됐다면 다시 송금하지 않습니다. 브라우저 QA와 실제 거래 증거는 [검증 기록](docs/QA.md)에 있습니다.

## 현재 범위와 제약

- 현재 활성 캠페인은 마루 해커톤이며 이전 커피 캠페인 이력을 보존합니다. 기존 5명의 테스트 지갑을 재사용합니다. 배포된 지급 기준은 고정이며 화면에서 사후 변경하지 않습니다.
- 실제 게시 여부·팔로워/조회수 진위·소셜 계정 소유권을 자동 검증하지 않습니다. 집행자의 판단을 신뢰합니다.
- 실제 테스트넷 잔액과 거래 상태는 서버 조회 결과이며, 가짜 트랜잭션 해시나 가짜 성공 상태를 생성하지 않습니다.
- 서명된 거래를 전송 전에 저장해 같은 요청의 중복 송금을 막습니다. 현재 검증 범위는 단일 백엔드 인스턴스입니다. 수평 확장 전에는 집행자 nonce 할당에 DB 잠금이 필요합니다.
- 기간 만료 후 미지급 승인은 만료됩니다. 예산 예약이 무기한 지급 보장을 뜻하지 않습니다.
- 데모 집행자 로그인은 테스트 전용입니다. 외부 운영 배포에는 `OROT_DEMO_MODE=false`와 실제 운영자 로그인·접근 통제가 필요합니다.
- UI는 한국어를 기준으로 검증했습니다. 브랜드 문구를 제외한 캠페인 번역 행은 영어에서도 한국어를 폴백으로 사용하며 영문 번역은 하지 않았습니다.

실제 거래 관련 정책과 비밀 값의 경계는 [POLICIES.md](POLICIES.md), 추가 환경변수는 [환경변수 안내](docs/environment.md)를 참고하세요.
