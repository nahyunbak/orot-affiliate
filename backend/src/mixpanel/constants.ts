import type {
  MixpanelDailyMetricDefinition,
  MixpanelDailyMetricKey,
} from './utils/types';

export type {
  MixpanelDailyAnalyticsSummary,
  MixpanelDailyMetric,
  MixpanelDailyMetricDefinition,
  MixpanelDailyMetricKey,
  MixpanelExportConfig,
  MixpanelPaymentProperties,
  MixpanelProperties,
  MixpanelPropertyValue,
  MixpanelRawExportEvent,
  MixpanelRetentionMetric,
  MixpanelServerEventName,
  MixpanelTrackEventParams,
  MixpanelTrackResponse,
} from './utils/types';

export const MIXPANEL_SERVER_EVENTS = {
  APP_OPEN: 'App Open',
  ONBOARDING_START: 'Onboarding Start',
  ONBOARDING_COMPLETE: 'Onboarding Complete',
  CORE_FEATURE_FIRST_USE: 'Core Feature First Use',
  SIGN_UP: 'Sign Up',
  SUBSCRIPTION_VIEW: 'Subscription View',
  NOTIFICATION_OPEN: 'Notification Open',
  NOTIFICATION_SENT: 'Notification Sent',
  SUBSCRIPTION_ACTIVATED: 'Subscription Activated',
  SUBSCRIPTION_RENEWED: 'Subscription Renewed',
  SUBSCRIPTION_CANCELLED: 'Subscription Cancelled',
  SUBSCRIPTION_AUTO_RENEW_ENABLED: 'Subscription Auto Renew Enabled',
  SUBSCRIPTION_GRACE_PERIOD_ENTERED: 'Subscription Grace Period Entered',
  SUBSCRIPTION_ACCOUNT_HOLD_ENTERED: 'Subscription Account Hold Entered',
  SUBSCRIPTION_PAUSED: 'Subscription Paused',
  SUBSCRIPTION_RECOVERED: 'Subscription Recovered',
  SUBSCRIPTION_EXPIRED: 'Subscription Expired',
  SUBSCRIPTION_REFUNDED: 'Subscription Refunded',
} as const;

export const MIXPANEL_DAILY_REPORT_SECTIONS: Array<{
  title: string;
  metricKeys: MixpanelDailyMetricKey[];
}> = [
  {
    title: '👥 유저',
    metricKeys: [
      'appOpen',
      'onboardingStart',
      'onboardingComplete',
      'signUp',
      'coreFeatureFirstUse',
    ],
  },
  {
    title: '💰 결제',
    metricKeys: ['subscriptionView', 'subscriptionActivated'],
  },
];

export const MIXPANEL_DAILY_METRIC_DEFINITIONS: MixpanelDailyMetricDefinition[] =
  [
    {
      key: 'appOpen',
      label: '앱 실행',
      eventName: MIXPANEL_SERVER_EVENTS.APP_OPEN,
    },
    {
      key: 'onboardingStart',
      label: '온보딩 시작',
      eventName: MIXPANEL_SERVER_EVENTS.ONBOARDING_START,
    },
    {
      key: 'onboardingComplete',
      label: '온보딩 완료',
      eventName: MIXPANEL_SERVER_EVENTS.ONBOARDING_COMPLETE,
    },
    {
      key: 'signUp',
      label: '가입 완료',
      eventName: MIXPANEL_SERVER_EVENTS.SIGN_UP,
    },
    {
      key: 'coreFeatureFirstUse',
      label: '핵심 기능 첫 사용',
      eventName: MIXPANEL_SERVER_EVENTS.CORE_FEATURE_FIRST_USE,
    },
    {
      key: 'subscriptionView',
      label: '결제 화면 진입',
      eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_VIEW,
    },
    {
      key: 'subscriptionActivated',
      label: '구독 시작',
      eventName: MIXPANEL_SERVER_EVENTS.SUBSCRIPTION_ACTIVATED,
    },
    {
      key: 'notificationSent',
      label: '알림 발송',
      eventName: MIXPANEL_SERVER_EVENTS.NOTIFICATION_SENT,
    },
    {
      key: 'notificationOpen',
      label: '알림 클릭 복귀',
      eventName: MIXPANEL_SERVER_EVENTS.NOTIFICATION_OPEN,
    },
  ];
