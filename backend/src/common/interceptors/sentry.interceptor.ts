import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Request } from 'express';
import { catchError, throwError } from 'rxjs';
import {
  sanitizeSentryValue,
  toSentryContextValue,
  truncateSentryString,
} from '@/common/utils/sentry';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function shouldCaptureHttpException(error: HttpException): boolean {
  return error instanceof HttpException;
}

function buildRequestContext(request: Request) {
  return {
    method: request.method,
    url: request.originalUrl || request.url,
    params: sanitizeSentryValue(request.params),
    query: sanitizeSentryValue(request.query),
    body: sanitizeSentryValue(request.body),
    user: sanitizeSentryValue((request as Request & { user?: unknown }).user),
    file: sanitizeSentryValue(
      request.file
        ? {
            fieldname: request.file.fieldname,
            originalname: request.file.originalname,
            mimetype: request.file.mimetype,
            size: request.file.size,
          }
        : undefined,
    ),
    files: sanitizeSentryValue(
      Array.isArray(request.files)
        ? request.files.map((file) => ({
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          }))
        : request.files,
    ),
  };
}

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (
          !Sentry.isEnabled() ||
          !(error instanceof HttpException) ||
          !shouldCaptureHttpException(error)
        ) {
          return throwError(() => error);
        }

        Sentry.withScope((scope) => {
          scope.setTag('nest.layer', 'interceptor');
          scope.setTag('error.handled', 'http_exception');

          if (context.getType() === 'http') {
            const request = context.switchToHttp().getRequest<Request>();

            if (request) {
              scope.setContext('request', buildRequestContext(request));
            }
          }

          if (isRecord(error)) {
            const errorRecord = error as UnknownRecord;

            if (typeof errorRecord.name === 'string') {
              scope.setTag('error.name', errorRecord.name);
            }

            if (typeof errorRecord.status === 'number') {
              scope.setTag('http.status_code', String(errorRecord.status));
            }

            if (typeof errorRecord.model === 'string') {
              scope.setExtra('model', errorRecord.model);
            }

            if (errorRecord.usage !== undefined) {
              scope.setContext(
                'usage',
                toSentryContextValue(errorRecord.usage),
              );
            }

            if (typeof errorRecord.content === 'string') {
              scope.setExtra(
                'response_content',
                truncateSentryString(errorRecord.content),
              );
            }
          }

          scope.setTag('http.status_code', String(error.getStatus()));
          scope.setContext(
            'exception_response',
            toSentryContextValue(error.getResponse()),
          );

          Sentry.captureException(error);
        });

        return throwError(() => error);
      }),
    );
  }
}
