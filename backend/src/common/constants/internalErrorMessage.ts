// Backend internal log message constants
// These messages are for server logs and Sentry events, not API responses.

export const INTERNAL_ERROR_MESSAGE = {
  AUTH: {
    NEW_USER_DISCORD_NOTIFICATION_FAILED:
      '신규 사용자 Discord 알림 전송에 실패했습니다.',
    WITHDRAWN_USER_DELETE_FAILED: '탈퇴 유저 삭제에 실패했습니다.',
    GOOGLE_OAUTH_CLIENT_ID_MISSING:
      'Google OAuth 클라이언트 ID 설정이 누락되었습니다.',
    GOOGLE_ID_TOKEN_VERIFY_FAILED: 'Google ID 토큰 검증에 실패했습니다.',
    GOOGLE_VERIFIED_PAYLOAD_MISSING:
      'Google 로그인 검증 결과 페이로드가 없습니다.',
    GOOGLE_ID_MISSING: 'Google 로그인 검증 결과 googleId가 없습니다.',
    GOOGLE_EMAIL_MISSING: 'Google 로그인 검증 결과 이메일이 없습니다.',
    APPLE_ID_TOKEN_VERIFY_FAILED: 'Apple ID 토큰 검증에 실패했습니다.',
    APPLE_TOKEN_EXCHANGE_ID_TOKEN_VERIFY_FAILED:
      'Apple 토큰 교환 후 ID 토큰 검증에 실패했습니다.',
    APPLE_LOGIN_CREDENTIAL_MISSING: 'Apple 로그인 인증 정보가 누락되었습니다.',
    APPLE_EMAIL_MISSING: 'Apple 로그인 검증 결과 이메일이 없습니다.',
    APPLE_TOKEN_EXCHANGE_FAILED: 'Apple 토큰 교환에 실패했습니다.',
    APPLE_SIGN_IN_WEBHOOK_INVALID_JWT_FORMAT:
      'Apple Sign In 웹훅 JWT 형식이 올바르지 않습니다.',
    APPLE_SIGN_IN_WEBHOOK_KID_MISSING:
      'Apple Sign In 웹훅 JWT 헤더에 kid가 없습니다.',
    APPLE_SIGN_IN_WEBHOOK_INVALID_AUD: (expected: string, actual: string) =>
      `Apple Sign In 웹훅 aud 값이 올바르지 않습니다. expected=${expected}, actual=${actual}`,
    APPLE_SIGN_IN_WEBHOOK_JWT_VERIFY_FAILED:
      'Apple Sign In 웹훅 JWT 검증에 실패했습니다.',
    APPLE_SIGN_IN_WEBHOOK_PROCESS_FAILED:
      'Apple Sign In 웹훅 처리에 실패했습니다.',
  },

  DISCORD: {
    WEBHOOK_FAILED: (channelName: string, status: number, statusText: string) =>
      `Discord ${channelName} 웹훅 요청이 실패했습니다. status=${status} ${statusText}`,
    NOTIFICATION_SEND_FAILED: (channelName: string) =>
      `Discord ${channelName} 알림 전송에 실패했습니다.`,
  },

  MIXPANEL: {
    TRACK_REQUEST_REJECTED: (eventName: string, reason: string) =>
      `Mixpanel 이벤트 전송이 거절되었습니다. event=${eventName}, reason=${reason}`,
    TRACK_REQUEST_FAILED: (eventName: string) =>
      `Mixpanel 이벤트 전송에 실패했습니다. event=${eventName}`,
    EXPORT_CONFIG_MISSING:
      'Mixpanel 통계 조회 설정이 누락되어 일간 리포트를 생성할 수 없습니다.',
    EXPORT_REQUEST_FAILED: 'Mixpanel raw export 조회에 실패했습니다.',
    DAILY_ANALYTICS_REPORT_FAILED:
      'Mixpanel 일간 통계 리포트 생성에 실패했습니다.',
  },

  FCM: {
    INVALID_TOKEN_DEACTIVATED: (code: string, tokenLength: number) =>
      `유효하지 않은 FCM 토큰을 비활성화했습니다. code=${code}, tokenLength=${tokenLength}`,
    INVALID_TOKEN_DEACTIVATE_FAILED:
      '유효하지 않은 FCM 토큰 비활성화에 실패했습니다.',
    SEND_PUSH_FAILED: '푸시 전송에 실패했습니다.',
  },

  PAYMENT: {
    APPLE_RECEIPT_VERIFY_FAILED: 'Apple 영수증 검증에 실패했습니다.',
    GOOGLE_RECEIPT_VERIFY_FAILED: 'Google 영수증 검증에 실패했습니다.',
    RESTORE_PURCHASE_FAILED: '구매 복원에 실패했습니다.',
    RESTORE_GOOGLE_PURCHASE_TOKEN_FAILED:
      'Google 구매 토큰 복원에 실패했습니다.',
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING:
      'Google Play 서비스 계정 키 파일을 찾을 수 없습니다.',
    APPLE_WEBHOOK_PROCESS_FAILED: 'Apple 웹훅 처리에 실패했습니다.',
    GOOGLE_WEBHOOK_PROCESS_FAILED: 'Google 웹훅 처리에 실패했습니다.',
    DISCORD_NOTIFICATION_SEND_FAILED: 'Discord 결제 알림 전송에 실패했습니다.',
    GOOGLE_SUBSCRIPTION_DETAILS_FETCH_FAILED:
      'Google 구독 상세 정보 조회에 실패했습니다.',
  },

  UPLOAD: {
    FILE_UPLOAD_FAILED: '파일 업로드에 실패했습니다.',
  },

  LOGGER: {
    FALLBACK_ERROR: 'Nest Logger 에러가 발생했습니다.',
  },
} as const;
