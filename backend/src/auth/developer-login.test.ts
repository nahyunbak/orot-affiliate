import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TesterLoginReqDto } from './dto/req.dto';

function fixture(mode: string | undefined) {
  const service = Object.create(AuthService.prototype) as AuthService;
  let calls = 0;
  const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh' };
  Object.assign(service, {
    configService: {
      get: (key: string) =>
        key === 'NODE_ENV'
          ? mode
          : key === 'TESTER_EMAIL'
            ? 'tester@example.invalid'
            : 'configured-password',
    },
    testerLogin: async (dto: TesterLoginReqDto) => {
      calls += 1;
      assert.deepEqual(dto, {
        email: 'tester@example.invalid',
        password: 'configured-password',
      });
      return tokens;
    },
  });
  return { service, tokens, calls: () => calls };
}

test('dev·development에서만 기존 테스터 계정의 세션을 재사용한다', async () => {
  for (const mode of ['dev', 'development']) {
    const { service, tokens, calls } = fixture(mode);
    assert.equal(await service.developerLogin(), tokens);
    assert.equal(calls(), 1);
  }
});

test('운영·테스트·미설정 환경에서는 계정 조회나 생성 전에 거부한다', async () => {
  for (const mode of ['production', 'test', undefined, '', 'Development']) {
    const { service, calls } = fixture(mode);
    await assert.rejects(service.developerLogin(), ForbiddenException);
    assert.equal(calls(), 0);
  }
});
