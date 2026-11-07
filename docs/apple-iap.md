# Apple 영수증·서버 알림 검증

`@apple/app-store-server-library`의 `SignedDataVerifier`로 StoreKit 2 거래, 구매 복원, Notifications V2와 내부 갱신 정보를 검증한다. JWS payload만 디코딩해서 권한을 부여하지 않는다. 기존 legacy 영수증은 Apple 서버 검증 경로를 유지한다.

## 설정

`backend/.env`에서 아래 값을 설정한다.

| 변수 | 값·용도 | 미설정 동작 |
| --- | --- | --- |
| `BUNDLE_ID` | 자신의 앱 번들 ID | JWS 검증 거부 |
| `APPLE_IAP_ENVIRONMENT` | `Sandbox` 또는 `Production` | JWS 검증 거부. NODE_ENV에서 추정하지 않음 |
| `APPLE_IAP_APP_APPLE_ID` | App Store의 양의 정수 앱 ID | Production에서 필수, Sandbox에서 선택 |
| `APPLE_IAP_ROOT_CA_PATHS` | Apple 공개 Root CA DER 인증서의 절대 경로, 쉼표 구분 | JWS 검증 거부 |
| `IAP_PRODUCT_IDS` | 판매할 상품 ID 허용 목록, 쉼표 구분 | 임의 상품 승인 거부 |
| `APPLE_SHARED_SECRET` | legacy 서버 영수증 검증에 사용하는 앱 설정 | legacy 검증 경로에 필요 |

공개 루트 인증서는 [Apple PKI](https://www.apple.com/certificateauthority/)의 Apple Root Certificates에서 직접 내려받는다. 클라이언트 요청이나 영수증 안의 인증서를 신뢰 루트로 등록하지 않는다. `.p8` 개인 키를 넣는 설정이 아니다. 검증기는 온라인 인증서 폐기 확인(OCSP)을 사용하므로 해당 네트워크 접근이 필요하다.

설정된 bundle ID·환경·앱 ID와 다른 서명 데이터, 손상된 JWS, 신뢰할 수 없는 인증서 체인은 거부한다. 검증 실패 시 기존 미검증 디코딩 경로로 돌아가지 않는다. 사용자 소유권과 상품 허용 목록 검사도 별도로 유지한다.

실제 sandbox 구매·복원·갱신 알림은 자신의 스토어 앱과 테스트 계정으로 확인해야 한다. 단위 테스트는 위조·누락 설정의 거부와 검증된 데이터만 전달되는지를 확인하며 실제 과금을 발생시키지 않는다.

공식 구현·API: [Apple App Store Server Library for Node.js](https://github.com/apple/app-store-server-library-node).
