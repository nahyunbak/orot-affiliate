import { BadRequestException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldCaptureHttpException } from './sentry.interceptor';

test('그 외 HTTP 예외는 기존처럼 Sentry 수집 대상으로 유지한다', () => {
  assert.equal(
    shouldCaptureHttpException(
      new BadRequestException({
        message: '예상하지 못한 잘못된 요청',
        errorCode: 'UNEXPECTED_BAD_REQUEST',
      }),
    ),
    true,
  );
  assert.equal(
    shouldCaptureHttpException(new BadRequestException('오류')),
    true,
  );
});
