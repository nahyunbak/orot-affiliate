// Backend message constants
// These values are intentionally owned in code and reported as-is to Sentry.

export const SUCCESS_MESSAGE = {
  AUTH: {
    LOGIN_SUCCESS: '로그인이 완료되었어요.',
    WITHDRAWAL: '회원 탈퇴가 완료되었어요.',
    WEBHOOK_PROCESSED: '웹훅이 성공적으로 처리되었습니다.',
  },

  USER: {
    UPDATE_SUCCESS: '사용자 정보가 업데이트되었어요.',
  },

  UPLOAD: {
    FILE_UPLOADED: '파일이 업로드되었어요.',
  },

  PAYMENT: {
    SUBSCRIPTION_ACTIVATED: '구독이 성공적으로 활성화되었습니다.',
    SUBSCRIPTIONS_RESTORED: '개의 구독이 복원되었습니다.',
    SUBSCRIPTION_CANCELLED:
      '구독이 취소되었습니다. 다음 갱신일까지 서비스를 이용할 수 있습니다.',
    WEBHOOK_PROCESSED: '웹훅이 성공적으로 처리되었습니다.',
    SUBSCRIPTION_RENEWED: '구독이 갱신되었습니다.',
    SUBSCRIPTION_EXPIRED: '구독이 만료되었습니다.',
    SUBSCRIPTION_REFUNDED: '구독이 환불되었습니다.',
    SUBSCRIPTION_PAUSED: '구독이 일시정지되었습니다.',
    SUBSCRIPTION_RESUMED: '구독이 재개되었습니다.',
    GRACE_PERIOD_ENTERED: '결제 유예 기간이 시작되었습니다.',
    ACCOUNT_HOLD_ENTERED: '계정 보류 상태가 시작되었습니다.',
  },
};
