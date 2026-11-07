export interface SubscriptionNotificationData {
  userId: number | null;
  paymentUUID: string | null;
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  platform: string;
  purchaseDate: Date;
  expiryDate: Date;
  isTrialPeriod?: boolean;
  price?: number;
  currency?: string;
}

export interface NewUserNotificationData {
  userId: number;
  email: string;
  authProvider: string;
  initialPlatform?: string | null;
  nickName?: string | null;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export interface DiscordWebhookParams {
  webhookUrl?: string;
  channelName: string;
  missingConfigKey: string;
  content?: string;
  embeds?: DiscordEmbed[];
}
