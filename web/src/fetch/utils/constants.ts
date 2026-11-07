export const queryKeys = {
  payment: {
    getSubscriptionStatus: "query-payment-get-subscription-status",
  },
  user: {
    mypage: "query-user-mypage",
  },
} as const;

export const mutationKeys = {
  auth: {
    anonymousLogin: "mutation-auth-anonymous-login",
    appleCallback: "mutation-auth-apple-callback",
    appleLogin: "mutation-auth-apple-login",
    deleteUser: "mutation-auth-delete-user",
    developerLogin: "mutation-auth-developer-login",
    facebookLogin: "mutation-auth-facebook-login",
    googleLogin: "mutation-auth-google-login",
    handleAppleSignInWebhook: "mutation-auth-handle-apple-sign-in-webhook",
    refreshAccessToken: "mutation-auth-refresh-access-token",
    testerLogin: "mutation-auth-tester-login",
    verifyBearerToken: "mutation-auth-verify-bearer-token",
  },
  fcm: {
    createFcm: "mutation-fcm-create-fcm",
  },
  payment: {
    cancelSubscription: "mutation-payment-cancel-subscription",
    handleAppleWebhook: "mutation-payment-handle-apple-webhook",
    handleGoogleWebhook: "mutation-payment-handle-google-webhook",
    restorePurchase: "mutation-payment-restore-purchase",
    verifyAppleReceipt: "mutation-payment-verify-apple-receipt",
    verifyGoogleReceipt: "mutation-payment-verify-google-receipt",
  },
  upload: {
    uploadFile: "mutation-upload-upload-file",
  },
  user: {
    updateUserInfo: "mutation-user-update-user-info",
  },
} as const;

export type QueryKey =
  | (typeof queryKeys.payment)[keyof typeof queryKeys.payment]
  | (typeof queryKeys.user)[keyof typeof queryKeys.user];

export type MutationKey =
  | (typeof mutationKeys.auth)[keyof typeof mutationKeys.auth]
  | (typeof mutationKeys.fcm)[keyof typeof mutationKeys.fcm]
  | (typeof mutationKeys.payment)[keyof typeof mutationKeys.payment]
  | (typeof mutationKeys.upload)[keyof typeof mutationKeys.upload]
  | (typeof mutationKeys.user)[keyof typeof mutationKeys.user];
