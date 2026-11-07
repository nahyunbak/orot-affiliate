import { envVariableKeys } from '@/common/constants/env';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { MIXPANEL_DAILY_REPORT_SECTIONS } from '@/mixpanel/constants';
import type {
  MixpanelDailyAnalyticsSummary,
  MixpanelDailyMetric,
  MixpanelDailyMetricKey,
} from '@/mixpanel/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DiscordEmbed,
  DiscordWebhookParams,
  NewUserNotificationData,
  SubscriptionNotificationData,
} from './utils/types';

const numberFormatter = new Intl.NumberFormat('ko-KR');
const percentFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const CORE_FEATURE_METRIC_KEYS = new Set<MixpanelDailyMetricKey>([]);
const NEW_USER_NOTIFICATION_DISABLED_NODE_ENVS = new Set([
  'dev',
  'development',
]);

function calculatePercentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function formatCount(count: number) {
  return numberFormatter.format(count);
}

function formatAverage(count: number) {
  return Number.isInteger(count) ? formatCount(count) : count.toFixed(1);
}

function formatPercentage(rate: number | null) {
  return rate === null ? 'N/A' : `${percentFormatter.format(rate)}%`;
}

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);
  private readonly purchaseWebhookUrl: string | undefined;
  private readonly newUserWebhookUrl: string | undefined;
  private readonly analyticsWebhookUrl: string | undefined;

  constructor(private configService: ConfigService) {
    this.purchaseWebhookUrl =
      this.getOptionalConfigValue(envVariableKeys.DISCORD_WEBHOOK_PURCHASE) ??
      this.getOptionalConfigValue('DDISCORD_WEBHOOK_PURCHASE');
    this.newUserWebhookUrl = this.getOptionalConfigValue(
      envVariableKeys.DISCORD_WEBHOOK_NEW_USER,
    );
    this.analyticsWebhookUrl = this.getOptionalConfigValue(
      envVariableKeys.DISCORD_WEBHOOK_ANALYTICS,
    );
  }

  /**
   * Discord 채널에 구독 활성화 알림 전송
   */
  async sendSubscriptionActivatedNotification(
    data: SubscriptionNotificationData,
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: '🎉 새 구독 활성화',
      color: 0x85c101, // primary-main 색상
      fields: [
        {
          name: '플랫폼',
          value: data.platform,
          inline: true,
        },
        {
          name: '상품 ID',
          value: data.productId,
          inline: true,
        },
        {
          name: '사용자 ID',
          value: data.userId?.toString() || 'N/A',
          inline: true,
        },
        {
          name: 'Transaction ID',
          value: data.transactionId,
          inline: false,
        },
        {
          name: 'Original Transaction ID',
          value: data.originalTransactionId,
          inline: false,
        },
        {
          name: '구매일',
          value: data.purchaseDate.toISOString(),
          inline: true,
        },
        {
          name: '만료일',
          value: data.expiryDate.toISOString(),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Application Payment System',
      },
    };

    // 무료 체험 여부 추가
    if (data.isTrialPeriod) {
      embed.fields?.push({
        name: '무료 체험',
        value: '✅ Yes',
        inline: true,
      });
    }

    // 가격 정보 추가
    if (data.price !== undefined && data.currency) {
      embed.fields?.push({
        name: '가격',
        value: `${data.price} ${data.currency}`,
        inline: true,
      });
    }

    await this.sendWebhook({
      webhookUrl: this.purchaseWebhookUrl,
      channelName: 'purchase',
      missingConfigKey: envVariableKeys.DISCORD_WEBHOOK_PURCHASE,
      embeds: [embed],
    });
  }

  /**
   * Discord 채널에 신규 사용자 생성 알림 전송
   */
  async sendNewUserNotification(data: NewUserNotificationData): Promise<void> {
    const nodeEnv =
      this.configService.get<string>(envVariableKeys.NODE_ENV) ??
      process.env.NODE_ENV ??
      '';

    if (NEW_USER_NOTIFICATION_DISABLED_NODE_ENVS.has(nodeEnv.toLowerCase())) {
      return;
    }

    const embed: DiscordEmbed = {
      title: '🆕 신규 사용자 생성',
      color: 0x4b8cf7,
      fields: [
        {
          name: '사용자 ID',
          value: data.userId.toString(),
          inline: true,
        },
        {
          name: '가입 방식',
          value: data.authProvider,
          inline: true,
        },
        {
          name: '초기 플랫폼',
          value: data.initialPlatform || 'N/A',
          inline: true,
        },
        {
          name: '이메일',
          value: data.email,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Application User System',
      },
    };

    if (data.nickName) {
      embed.fields?.push({
        name: '닉네임',
        value: data.nickName,
        inline: true,
      });
    }

    await this.sendWebhook({
      webhookUrl: this.newUserWebhookUrl,
      channelName: 'new user',
      missingConfigKey: envVariableKeys.DISCORD_WEBHOOK_NEW_USER,
      embeds: [embed],
    });
  }

  /**
   * Discord 채널에 일간 Mixpanel 통계 리포트 전송
   */
  async sendAnalyticsSummaryNotification(
    summary: MixpanelDailyAnalyticsSummary,
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: '📊 Application 일간 Mixpanel 지표',
      description: [
        `기준일: ${summary.reportDate}`,
        `기준 시간대: ${summary.timezone}`,
      ].join('\n'),
      color: 0x4b8cf7,
      fields: [
        ...MIXPANEL_DAILY_REPORT_SECTIONS.map((section) => ({
          name: section.title,
          value: section.metricKeys
            .map((metricKey) =>
              this.formatDailyMetricLine(summary.metrics[metricKey], summary),
            )
            .join('\n'),
          inline: false,
        })),
        {
          name: '↩️ 리텐션/복귀',
          value: this.formatRetentionSection(summary),
          inline: false,
        },
      ],
      timestamp: summary.generatedAt.toISOString(),
      footer: {
        text: 'Application Analytics',
      },
    };

    await this.sendWebhook({
      webhookUrl: this.analyticsWebhookUrl,
      channelName: 'analytics',
      missingConfigKey: envVariableKeys.DISCORD_WEBHOOK_ANALYTICS,
      embeds: [embed],
    });
  }

  /**
   * Discord webhook으로 메시지 전송
   */
  private async sendWebhook(params: DiscordWebhookParams): Promise<void> {
    const { webhookUrl, channelName, missingConfigKey, ...payload } = params;

    if (!webhookUrl) {
      this.logger.warn(
        `${channelName} Discord webhook URL is not configured (${missingConfigKey})`,
      );
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.DISCORD.WEBHOOK_FAILED(
            channelName,
            response.status,
            response.statusText,
          ),
          new Error(
            INTERNAL_ERROR_MESSAGE.DISCORD.WEBHOOK_FAILED(
              channelName,
              response.status,
              response.statusText,
            ),
          ),
          {
            channelName,
            status: response.status,
            statusText: response.statusText,
            missingConfigKey,
          },
        );
      } else {
        this.logger.log(
          `Discord ${channelName} notification sent successfully`,
        );
      }
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.DISCORD.NOTIFICATION_SEND_FAILED(channelName),
        error,
        {
          channelName,
          missingConfigKey,
        },
      );
    }
  }

  private getOptionalConfigValue(key: string): string | undefined {
    const value = this.configService.get<string>(key)?.trim();
    return value ? value : undefined;
  }

  private formatDailyMetricLine(
    metric: MixpanelDailyMetric,
    summary: MixpanelDailyAnalyticsSummary,
  ) {
    const segments = [`${formatCount(metric.uniqueUserCount)}명`];

    if (metric.totalCount !== metric.uniqueUserCount) {
      segments.push(`총 ${formatCount(metric.totalCount)}회`);
    }

    if (metric.averagePerUser > 1) {
      segments.push(`평균 ${formatAverage(metric.averagePerUser)}회`);
    }

    if (metric.key !== 'appOpen') {
      segments.push(
        `앱 실행 대비 ${formatPercentage(
          calculatePercentage(metric.uniqueUserCount, summary.appOpenUserCount),
        )}`,
      );
    }

    if (CORE_FEATURE_METRIC_KEYS.has(metric.key)) {
      segments.push(
        `구독 시작자 대비 ${formatPercentage(
          calculatePercentage(
            metric.uniqueUserCount,
            summary.subscriptionStartUserCount,
          ),
        )}`,
      );
    }

    return `• ${metric.label}: ${segments.join(' / ')}`;
  }

  private formatRetentionSection(summary: MixpanelDailyAnalyticsSummary) {
    return [
      `• D1 앱 실행 리텐션: ${formatCount(
        summary.d1Retention.retainedUserCount,
      )}/${formatCount(summary.d1Retention.baseUserCount)}명 (${formatPercentage(
        summary.d1Retention.rate,
      )})`,
      `• D7 앱 실행 리텐션: ${formatCount(
        summary.d7Retention.retainedUserCount,
      )}/${formatCount(summary.d7Retention.baseUserCount)}명 (${formatPercentage(
        summary.d7Retention.rate,
      )})`,
      `• 하루 2회 이상 앱 실행: ${formatCount(
        summary.repeatAppOpenUserCount,
      )}명`,
      `• 알림 클릭 복귀율: ${formatPercentage(summary.notificationReturnRate)}`,
    ].join('\n');
  }
}
