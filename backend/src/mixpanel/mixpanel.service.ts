import { envVariableKeys } from '@/common/constants/env';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import dayjs, { Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  MIXPANEL_DAILY_METRIC_DEFINITIONS,
  MIXPANEL_SERVER_EVENTS,
} from './constants';
import type {
  MixpanelDailyAnalyticsSummary,
  MixpanelDailyMetric,
  MixpanelDailyMetricKey,
  MixpanelExportConfig,
  MixpanelProperties,
  MixpanelPropertyValue,
  MixpanelRawExportEvent,
  MixpanelServerEventName,
  MixpanelTrackEventParams,
  MixpanelTrackResponse,
} from './utils/types';

dayjs.extend(utc);
dayjs.extend(timezone);

const MIXPANEL_TRACK_URL = 'https://api.mixpanel.com/track';
const MIXPANEL_REQUEST_TIMEOUT_MS = 3000;
const MIXPANEL_EXPORT_BASE_URL = 'https://data.mixpanel.com/api/2.0/export';
const MIXPANEL_EXPORT_REQUEST_TIMEOUT_MS = 30000;
const MIXPANEL_DAILY_REPORT_TIMEZONE = 'Asia/Seoul';
const MIXPANEL_TRACK_DISABLED_NODE_ENV_VALUES = new Set(['dev', 'development']);

function normalizePropertyValue(
  value: MixpanelPropertyValue | undefined,
): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizePropertyValue(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).reduce<Record<string, unknown>>(
      (acc, [key, item]) => {
        const normalized = normalizePropertyValue(item);

        if (normalized !== undefined) {
          acc[key] = normalized;
        }

        return acc;
      },
      {},
    );
  }

  return value;
}

function normalizeProperties(properties?: MixpanelProperties) {
  return Object.entries(properties ?? {}).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      const normalized = normalizePropertyValue(value);

      if (normalized !== undefined) {
        acc[key] = normalized;
      }

      return acc;
    },
    {},
  );
}

function parseMixpanelEventTimeMs(
  properties: Record<string, unknown> | undefined,
): number | null {
  const time = properties?.time;

  if (typeof time === 'number' && Number.isFinite(time)) {
    return time > 9999999999 ? time : time * 1000;
  }

  if (typeof time === 'string' && time.trim()) {
    const numericTime = Number(time);

    if (Number.isFinite(numericTime)) {
      return numericTime > 9999999999 ? numericTime : numericTime * 1000;
    }

    const parsedTime = Date.parse(time);

    if (Number.isFinite(parsedTime)) {
      return parsedTime;
    }
  }

  return null;
}

function getMixpanelDistinctId(
  properties: Record<string, unknown> | undefined,
): string | null {
  const distinctId =
    properties?.distinct_id ??
    properties?.$distinct_id ??
    properties?.distinctId;

  if (distinctId === undefined || distinctId === null) {
    return null;
  }

  return String(distinctId);
}

function calculatePercentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function calculateAverage(totalCount: number, uniqueUserCount: number) {
  if (uniqueUserCount <= 0) {
    return 0;
  }

  return Math.round((totalCount / uniqueUserCount) * 10) / 10;
}

@Injectable()
export class MixpanelService {
  private readonly logger = new Logger(MixpanelService.name);

  constructor(private readonly configService: ConfigService) {}

  async trackEvent(params: MixpanelTrackEventParams): Promise<void> {
    if (this.isTrackDisabledEnvironment()) {
      return;
    }

    const token = this.configService
      .get<string>(envVariableKeys.MIXPANEL_PROJECT_TOKEN)
      ?.trim();

    if (!token) {
      return;
    }

    const insertId = params.insertId ?? randomUUID();
    const eventTime = params.time ?? new Date();

    try {
      const response = await axios.post<MixpanelTrackResponse>(
        MIXPANEL_TRACK_URL,
        [
          {
            event: params.eventName,
            properties: {
              token,
              distinct_id: String(params.distinctId),
              time: Math.floor(eventTime.getTime() / 1000),
              $insert_id: insertId,
              source: 'server',
              ...normalizeProperties(params.properties),
            },
          },
        ],
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          params: {
            ip: 0,
            verbose: 1,
          },
          timeout: MIXPANEL_REQUEST_TIMEOUT_MS,
        },
      );

      if (response.data.status !== 1) {
        this.logger.error(
          INTERNAL_ERROR_MESSAGE.MIXPANEL.TRACK_REQUEST_REJECTED(
            params.eventName,
            response.data.error ?? 'unknown',
          ),
        );
      }
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.MIXPANEL.TRACK_REQUEST_FAILED(params.eventName),
        error,
        {
          eventName: params.eventName,
          distinctId: String(params.distinctId),
          insertId,
        },
      );
    }
  }

  private isTrackDisabledEnvironment() {
    const nodeEnv =
      this.configService.get<string>(envVariableKeys.NODE_ENV) ??
      process.env.NODE_ENV ??
      '';

    return MIXPANEL_TRACK_DISABLED_NODE_ENV_VALUES.has(nodeEnv.toLowerCase());
  }

  async getDailyAnalyticsSummary(params?: {
    reportDate?: string;
    timezone?: string;
  }): Promise<MixpanelDailyAnalyticsSummary | null> {
    const exportConfig = this.getExportConfig();

    if (!exportConfig) {
      this.logger.warn(INTERNAL_ERROR_MESSAGE.MIXPANEL.EXPORT_CONFIG_MISSING);
      return null;
    }

    const timezoneName = params?.timezone ?? MIXPANEL_DAILY_REPORT_TIMEZONE;
    const reportDate =
      params?.reportDate ??
      dayjs().tz(timezoneName).subtract(1, 'day').format('YYYY-MM-DD');
    const reportStartAt = dayjs.tz(`${reportDate} 00:00:00`, timezoneName);
    const reportEndAt = reportStartAt.add(1, 'day');
    const reportEventNames = [
      ...new Set(
        MIXPANEL_DAILY_METRIC_DEFINITIONS.map(
          (definition) => definition.eventName,
        ),
      ),
    ];

    const dailyEvents = await this.exportRawEvents(exportConfig, {
      eventNames: reportEventNames,
      startAt: reportStartAt,
      endAt: reportEndAt,
    });
    const metrics = this.buildDailyMetrics(dailyEvents);
    const appOpenEvents = dailyEvents.filter(
      (event) => event.event === MIXPANEL_SERVER_EVENTS.APP_OPEN,
    );
    const repeatAppOpenUserCount =
      this.countRepeatedDistinctUsers(appOpenEvents);
    const notificationReturnRate = calculatePercentage(
      metrics.notificationOpen.uniqueUserCount,
      metrics.notificationSent.uniqueUserCount,
    );
    const retentionStartAt = reportStartAt.subtract(7, 'day');
    const retentionAppOpenEvents = await this.exportRawEvents(exportConfig, {
      eventNames: [MIXPANEL_SERVER_EVENTS.APP_OPEN],
      startAt: retentionStartAt,
      endAt: reportEndAt,
    });
    const usersByDate = this.buildAppOpenUsersByDate(
      retentionAppOpenEvents,
      timezoneName,
    );
    const todayUsers = usersByDate.get(reportDate) ?? new Set<string>();
    const d1BaseDate = reportStartAt.subtract(1, 'day').format('YYYY-MM-DD');
    const d7BaseDate = reportStartAt.subtract(7, 'day').format('YYYY-MM-DD');

    return {
      reportDate,
      timezone: timezoneName,
      generatedAt: new Date(),
      metrics,
      appOpenUserCount: metrics.appOpen.uniqueUserCount,
      subscriptionStartUserCount: metrics.subscriptionActivated.uniqueUserCount,
      repeatAppOpenUserCount,
      notificationReturnRate,
      d1Retention: this.buildRetentionMetric(
        usersByDate.get(d1BaseDate) ?? new Set<string>(),
        todayUsers,
      ),
      d7Retention: this.buildRetentionMetric(
        usersByDate.get(d7BaseDate) ?? new Set<string>(),
        todayUsers,
      ),
    };
  }

  private getExportConfig(): MixpanelExportConfig | null {
    const projectId = this.configService
      .get<string>(envVariableKeys.MIXPANEL_PROJECT_ID)
      ?.trim();
    const serviceAccountUsername = this.configService
      .get<string>(envVariableKeys.MIXPANEL_SERVICE_ACCOUNT_USERNAME)
      ?.trim();
    const serviceAccountSecret = this.configService
      .get<string>(envVariableKeys.MIXPANEL_SERVICE_ACCOUNT_SECRET)
      ?.trim();

    if (!projectId || !serviceAccountUsername || !serviceAccountSecret) {
      return null;
    }

    return {
      projectId,
      serviceAccountUsername,
      serviceAccountSecret,
    };
  }

  private async exportRawEvents(
    config: MixpanelExportConfig,
    params: {
      eventNames: MixpanelServerEventName[];
      startAt: Dayjs;
      endAt: Dayjs;
    },
  ): Promise<MixpanelRawExportEvent[]> {
    const fromDate = params.startAt.utc().format('YYYY-MM-DD');
    const toDate = params.endAt
      .subtract(1, 'millisecond')
      .utc()
      .format('YYYY-MM-DD');
    const startTimeMs = params.startAt.valueOf();
    const endTimeMs = params.endAt.valueOf();
    const eventNames = [...new Set(params.eventNames)];

    try {
      const response = await axios.get<string>(MIXPANEL_EXPORT_BASE_URL, {
        auth: {
          username: config.serviceAccountUsername,
          password: config.serviceAccountSecret,
        },
        params: {
          project_id: config.projectId,
          from_date: fromDate,
          to_date: toDate,
          event: JSON.stringify(eventNames),
          time_in_ms: true,
        },
        responseType: 'text',
        transformResponse: [(data) => data],
        timeout: MIXPANEL_EXPORT_REQUEST_TIMEOUT_MS,
      });

      return this.parseRawExportResponse(response.data).filter((event) => {
        const eventTimeMs = parseMixpanelEventTimeMs(event.properties);
        return (
          eventTimeMs !== null &&
          eventTimeMs >= startTimeMs &&
          eventTimeMs < endTimeMs
        );
      });
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.MIXPANEL.EXPORT_REQUEST_FAILED,
        error,
        {
          eventNames,
          fromDate,
          toDate,
          projectId: config.projectId,
        },
      );
      throw error;
    }
  }

  private parseRawExportResponse(
    responseBody: string,
  ): MixpanelRawExportEvent[] {
    if (!responseBody.trim()) {
      return [];
    }

    return responseBody
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as MixpanelRawExportEvent];
        } catch (error) {
          this.logger.warn('Mixpanel raw export line parse failed', {
            error,
          });
          return [];
        }
      });
  }

  private buildDailyMetrics(
    events: MixpanelRawExportEvent[],
  ): Record<MixpanelDailyMetricKey, MixpanelDailyMetric> {
    const counters = new Map<
      MixpanelDailyMetricKey,
      { totalCount: number; userIds: Set<string> }
    >();
    const definitionByEventName = new Map<
      MixpanelServerEventName,
      (typeof MIXPANEL_DAILY_METRIC_DEFINITIONS)[number]
    >();

    for (const definition of MIXPANEL_DAILY_METRIC_DEFINITIONS) {
      counters.set(definition.key, {
        totalCount: 0,
        userIds: new Set<string>(),
      });
      definitionByEventName.set(definition.eventName, definition);
    }

    for (const event of events) {
      const definition = definitionByEventName.get(
        event.event as MixpanelServerEventName,
      );

      if (!definition) {
        continue;
      }

      const counter = counters.get(definition.key);

      if (!counter) {
        continue;
      }

      counter.totalCount += 1;

      const distinctId = getMixpanelDistinctId(event.properties);

      if (distinctId) {
        counter.userIds.add(distinctId);
      }
    }

    return MIXPANEL_DAILY_METRIC_DEFINITIONS.reduce(
      (acc, definition) => {
        const counter = counters.get(definition.key);
        const totalCount = counter?.totalCount ?? 0;
        const uniqueUserCount = counter?.userIds.size ?? 0;

        acc[definition.key] = {
          key: definition.key,
          label: definition.label,
          eventName: definition.eventName,
          totalCount,
          uniqueUserCount,
          averagePerUser: calculateAverage(totalCount, uniqueUserCount),
        };

        return acc;
      },
      {} as Record<MixpanelDailyMetricKey, MixpanelDailyMetric>,
    );
  }

  private countRepeatedDistinctUsers(events: MixpanelRawExportEvent[]) {
    const eventCountsByUserId = new Map<string, number>();

    for (const event of events) {
      const distinctId = getMixpanelDistinctId(event.properties);

      if (!distinctId) {
        continue;
      }

      eventCountsByUserId.set(
        distinctId,
        (eventCountsByUserId.get(distinctId) ?? 0) + 1,
      );
    }

    return [...eventCountsByUserId.values()].filter((count) => count >= 2)
      .length;
  }

  private buildAppOpenUsersByDate(
    events: MixpanelRawExportEvent[],
    timezoneName: string,
  ) {
    const usersByDate = new Map<string, Set<string>>();

    for (const event of events) {
      if (event.event !== MIXPANEL_SERVER_EVENTS.APP_OPEN) {
        continue;
      }

      const distinctId = getMixpanelDistinctId(event.properties);
      const eventTimeMs = parseMixpanelEventTimeMs(event.properties);

      if (!distinctId || eventTimeMs === null) {
        continue;
      }

      const localDate = dayjs(eventTimeMs)
        .tz(timezoneName)
        .format('YYYY-MM-DD');
      const userIds = usersByDate.get(localDate) ?? new Set<string>();

      userIds.add(distinctId);
      usersByDate.set(localDate, userIds);
    }

    return usersByDate;
  }

  private buildRetentionMetric(
    baseUsers: Set<string>,
    retainedUsers: Set<string>,
  ) {
    const retainedUserCount = [...baseUsers].filter((userId) =>
      retainedUsers.has(userId),
    ).length;

    return {
      baseUserCount: baseUsers.size,
      retainedUserCount,
      rate: calculatePercentage(retainedUserCount, baseUsers.size),
    };
  }
}
