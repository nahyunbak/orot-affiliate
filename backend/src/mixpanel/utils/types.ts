import { PaymentPlatformEnum, PurchaseStatusEnum } from '@prisma/client';
import type { MIXPANEL_SERVER_EVENTS } from '../constants';

export type MixpanelServerEventName =
  (typeof MIXPANEL_SERVER_EVENTS)[keyof typeof MIXPANEL_SERVER_EVENTS];

export type MixpanelPropertyValue =
  | string
  | number
  | boolean
  | null
  | Date
  | MixpanelPropertyValue[]
  | { [key: string]: MixpanelPropertyValue | undefined };

export type MixpanelProperties = Record<
  string,
  MixpanelPropertyValue | undefined
>;

export interface MixpanelTrackEventParams {
  eventName: MixpanelServerEventName;
  distinctId: string | number;
  properties?: MixpanelProperties;
  insertId?: string;
  time?: Date;
}

export interface MixpanelPaymentProperties extends MixpanelProperties {
  user_id?: number | null;
  payment_id: number;
  platform: PaymentPlatformEnum;
  product_id: string;
  status: PurchaseStatusEnum;
  transaction_id: string;
  original_transaction_id: string;
  promotion_code?: string | null;
  event_type?: string;
  price?: number;
  currency?: string;
}

export type MixpanelDailyMetricKey =
  | 'appOpen'
  | 'onboardingStart'
  | 'onboardingComplete'
  | 'signUp'
  | 'coreFeatureFirstUse'
  | 'subscriptionView'
  | 'subscriptionActivated'
  | 'notificationSent'
  | 'notificationOpen';

export interface MixpanelDailyMetricDefinition {
  key: MixpanelDailyMetricKey;
  label: string;
  eventName: MixpanelServerEventName;
}

export interface MixpanelDailyMetric {
  key: MixpanelDailyMetricKey;
  label: string;
  eventName: MixpanelServerEventName;
  totalCount: number;
  uniqueUserCount: number;
  averagePerUser: number;
}

export interface MixpanelRetentionMetric {
  baseUserCount: number;
  retainedUserCount: number;
  rate: number | null;
}

export interface MixpanelDailyAnalyticsSummary {
  reportDate: string;
  timezone: string;
  generatedAt: Date;
  metrics: Record<MixpanelDailyMetricKey, MixpanelDailyMetric>;
  appOpenUserCount: number;
  subscriptionStartUserCount: number;
  repeatAppOpenUserCount: number;
  notificationReturnRate: number | null;
  d1Retention: MixpanelRetentionMetric;
  d7Retention: MixpanelRetentionMetric;
}

export interface MixpanelTrackResponse {
  status: 0 | 1;
  error?: string;
}

export interface MixpanelExportConfig {
  projectId: string;
  serviceAccountUsername: string;
  serviceAccountSecret: string;
}

export interface MixpanelRawExportEvent {
  event?: string;
  properties?: Record<string, unknown>;
}
