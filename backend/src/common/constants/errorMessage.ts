// Backend message constants
// These values are intentionally owned in code and reported as-is to Sentry.

export const ERROR_MESSAGE = {
  AUTH: {
    REFERRAL_CODE_NOT_FOUND: '존재하지 않는 추천인 코드입니다.',
    EMAIL_ALREADY_EXISTS: '이미 등록된 이메일이에요.',
    INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호가 올바르지 않아요.',
    USER_NOT_FOUND: '존재하지 않는 사용자에요.',
    EXPIRED_ACCESS_TOKEN: '만료된 액세스 토큰이에요.',
    USER_DELETED: '탈퇴한 사용자에요.',
    NO_EMAIL: '이메일이 없어요.',
    INVALID_TOKEN: '유효하지 않은 토큰이에요.',
    TOKEN_VERIFICATION_FAILED: '토큰 검증에 실패했어요.',
    WEBHOOK_PROCESSING_FAILED: '웹훅 처리 중 오류가 발생했습니다.',
    GOOGLE_LOGIN_NOT_CONFIGURED: 'Google 로그인 설정이 아직 준비되지 않았어요.',
    APPLE_LOGIN_NOT_CONFIGURED: 'Apple 로그인 설정이 아직 준비되지 않았어요.',
  },

  COMMON: {
    INVALID_REQUEST: '유효하지 않은 요청이에요.',
  },

  UPLOAD: {
    INVALID_FILE: '유효한 파일이 아닙니다.',
    FILE_TOO_LARGE: '파일 크기는 200MB를 초과할 수 없습니다.',
    FAILED: '파일 업로드 중 오류가 발생했습니다.',
  },

  FCM: {
    DEV_ONLY_ENDPOINT: '개발 환경에서만 사용할 수 있어요.',
  },

  PAYMENT: {
    INVALID_PRODUCT_ID: '허용되지 않은 구독 상품입니다.',
    INVALID_JWS_FORMAT: '잘못된 JWS 형식입니다.',
    INVALID_BUNDLE_ID: '잘못된 Bundle ID입니다.',
    APPLE_VERIFY_FAILED: 'Apple 영수증 검증에 실패했습니다.',
    GOOGLE_VERIFY_FAILED: 'Google 영수증 검증에 실패했습니다.',
    NO_SUBSCRIPTION_INFO: '유효한 구독 정보를 찾을 수 없습니다.',
    PAYMENT_NOT_COMPLETED: '결제가 완료되지 않았습니다.',
    UNSUPPORTED_PLATFORM: '지원하지 않는 플랫폼입니다.',
    RESTORE_NO_PURCHASE: '복원할 구매 내역이 없습니다.',
    RESTORE_FAILED: '구매 복원 중 오류가 발생했습니다.',
    SUBSCRIPTION_NOT_FOUND: '구독 정보를 찾을 수 없습니다.',
    SUBSCRIPTION_EXPIRED: '만료된 구독입니다. 새로운 구독을 진행해주세요.',
    APPLE_RECEIPT_REQUIRED: 'Apple 영수증 데이터가 필요합니다.',
    GOOGLE_TOKEN_REQUIRED: 'Google Play 구매 토큰이 필요합니다.',
    RESTORE_ALREADY_SAVED: '이미 결제가 저장되어 있습니다.',
    WEBHOOK_INVALID_PAYLOAD: '웹훅 페이로드가 유효하지 않습니다.',
    WEBHOOK_PROCESSING_FAILED: '웹훅 처리 중 오류가 발생했습니다.',
  },
};
