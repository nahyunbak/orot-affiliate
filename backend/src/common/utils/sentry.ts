import * as Sentry from '@sentry/nestjs';
import { envVariableKeys } from '@/common/constants/env';

type UnknownRecord = Record<string, unknown>;

const DSN_PLACEHOLDER = 'your-sentry-dsn';
const REDACTED_VALUE = '[REDACTED]';
const TRUNCATED_SUFFIX = '...[truncated]';
const DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_NON_PRODUCTION_TRACES_SAMPLE_RATE = 1;
const SENSITIVE_FIELD_NAMES = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'identitytoken',
  'purchasetoken',
  'fcmtoken',
  'clientsecret',
  'privatekey',
  'secret',
  'apikey',
  'base64',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isSensitiveFieldName(key: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(key.replace(/[_-]/g, '').toLowerCase());
}

export function truncateSentryString(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}${TRUNCATED_SUFFIX}`;
}

export function sanitizeSentryValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateSentryString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer length=${value.length}]`;
  }

  if (value instanceof Error) {
    return serializeErrorForSentry(value, depth, seen);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (depth >= 3) {
      return `[Array length=${value.length}]`;
    }

    return value
      .slice(0, 20)
      .map((item) => sanitizeSentryValue(item, depth + 1, seen));
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (depth >= 3) {
      return `[Object keys=${Object.keys(value).length}]`;
    }

    return Object.entries(value).reduce<UnknownRecord>(
      (result, [key, item]) => {
        result[key] = isSensitiveFieldName(key)
          ? REDACTED_VALUE
          : sanitizeSentryValue(item, depth + 1, seen);
        return result;
      },
      {},
    );
  }

  return String(value);
}

export function serializeErrorForSentry(
  error: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (error instanceof Error) {
    if (seen.has(error)) {
      return '[Circular]';
    }

    seen.add(error);

    const serializedError: UnknownRecord = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      serializedError.stack = error.stack;
    }

    Object.entries(error as unknown as UnknownRecord).forEach(
      ([key, value]) => {
        if (!(key in serializedError)) {
          serializedError[key] = sanitizeSentryValue(value, depth + 1, seen);
        }
      },
    );

    return serializedError;
  }

  return sanitizeSentryValue(error);
}

export function toSentryContextValue(value: unknown): UnknownRecord {
  const sanitized = sanitizeSentryValue(value);

  return isRecord(sanitized) ? sanitized : { value: sanitized };
}

export function sanitizeSentryConsoleBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category !== 'console') {
    return breadcrumb;
  }

  return {
    ...breadcrumb,
    data: breadcrumb.data
      ? (sanitizeSentryValue(breadcrumb.data) as Record<string, unknown>)
      : breadcrumb.data,
  };
}

export function sanitizeSentryConsoleEvent(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // 실패한 채팅 요청도 외부 오류 수집기에 본문이 남지 않도록 한다.
  const requestContext = event.contexts?.request;
  const requestUrl = event.request?.url ?? requestContext?.url;
  if (
    typeof requestUrl === 'string' &&
    /\/lounge\/message\/?(?:\?|$)/.test(requestUrl)
  ) {
    event = {
      ...event,
      ...(event.request
        ? { request: { ...event.request, data: REDACTED_VALUE } }
        : {}),
      ...(requestContext
        ? {
            contexts: {
              ...event.contexts,
              request: { ...requestContext, body: REDACTED_VALUE },
            },
          }
        : {}),
    };
  }
  if (event.logger !== 'console' || !event.extra) {
    return event;
  }

  return {
    ...event,
    extra: sanitizeSentryValue(event.extra) as Record<string, unknown>,
  };
}

export function getSentryDsn(): string {
  return process.env[envVariableKeys.SENTRY_DSN]?.trim() ?? '';
}

export function hasUsableSentryDsn(): boolean {
  const dsn = getSentryDsn();

  return Boolean(dsn && !dsn.includes(DSN_PLACEHOLDER));
}

function getSentryEnvironment(): string | undefined {
  return process.env.NODE_ENV?.trim() || undefined;
}

function getSentryTracesSampleRate(): number {
  return process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE
    : DEFAULT_NON_PRODUCTION_TRACES_SAMPLE_RATE;
}

export function initSentry(): boolean {
  if (!hasUsableSentryDsn()) {
    return false;
  }

  Sentry.init({
    dsn: getSentryDsn(),
    environment: getSentryEnvironment(),
    tracesSampleRate: getSentryTracesSampleRate(),
    integrations: [
      Sentry.httpIntegration(),
      Sentry.extraErrorDataIntegration({ depth: 5 }),
      Sentry.consoleIntegration({
        levels: ['log', 'info', 'warn', 'error'],
      }),
      Sentry.captureConsoleIntegration({
        levels: ['error'],
        handled: true,
      }),
    ],
    normalizeDepth: 6,
    sendDefaultPii: false,
    beforeBreadcrumb: sanitizeSentryConsoleBreadcrumb,
    beforeSend: sanitizeSentryConsoleEvent,
  });

  return true;
}
