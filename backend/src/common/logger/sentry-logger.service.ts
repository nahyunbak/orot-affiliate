import { ConsoleLogger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { toSentryContextValue } from '@/common/utils/sentry';

type UnknownRecord = Record<string, unknown>;

const NEST_EXCEPTION_CONTEXTS = new Set([
  'ExceptionHandler',
  'ExceptionsHandler',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function getLoggerContext(optionalParams: unknown[]): string | undefined {
  const lastParam = optionalParams[optionalParams.length - 1];
  return typeof lastParam === 'string' ? lastParam : undefined;
}

function findLoggedError(values: unknown[]): Error | undefined {
  for (const value of values) {
    if (value instanceof Error) {
      return value;
    }

    if (isRecord(value) && value.error instanceof Error) {
      return value.error;
    }
  }

  return undefined;
}

function buildFallbackError(message: unknown): Error {
  if (typeof message === 'string') {
    return new Error(message);
  }

  return new Error(INTERNAL_ERROR_MESSAGE.LOGGER.FALLBACK_ERROR);
}

export class SentryLogger extends ConsoleLogger {
  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    this.captureErrorLog(message, optionalParams);
  }

  private captureErrorLog(message: unknown, optionalParams: unknown[]): void {
    if (!Sentry.isEnabled()) {
      return;
    }

    const loggerContext = getLoggerContext(optionalParams);

    if (loggerContext && NEST_EXCEPTION_CONTEXTS.has(loggerContext)) {
      return;
    }

    const error = findLoggedError([message, ...optionalParams]);

    Sentry.withScope((scope) => {
      scope.setLevel('error');

      if (loggerContext) {
        scope.setTag('logger.context', loggerContext);
      }

      scope.setContext(
        'logger',
        toSentryContextValue({
          message,
          optionalParams,
          hasOriginalError: Boolean(error),
        }),
      );

      Sentry.captureException(error ?? buildFallbackError(message));
    });
  }
}
