require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AuthService } = require('../src/auth/auth.service');
const { UserService } = require('../src/user/user.service');
const {
  GoogleLoginReqDto,
  AppleLoginReqDto,
  FacebookLoginReqDto,
} = require('../src/auth/dto/req.dto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

test('추천인 코드는 실제 활성 회원의 코드만 허용한다', async () => {
  let query;
  const service = Object.assign(Object.create(AuthService.prototype), {
    prisma: {
      user: {
        findFirst: async (args) => {
          query = args;
          return null;
        },
      },
    },
  });
  await assert.rejects(service.checkReferralCode('ABC123'));
  assert.deepEqual(query.where, { referral_code: 'ABC123', isDeleted: false });
  service.prisma.user.findFirst = async () => ({ referral_code: 'ABC123' });
  await assert.doesNotReject(service.checkReferralCode('ABC123'));
});

test('회원가입은 닉네임, 고유 추천 코드, 일반 온보딩을 보존한다', async () => {
  let saved;
  const service = Object.assign(Object.create(AuthService.prototype), {
    prisma: {
      user: {
        create: async ({ data }) => {
          saved = data;
          return { id: 7 };
        },
      },
    },
    generateUniqueReferralCode: async () => 'ABC123',
  });
  await service.createAccount({
    data: {
      email: 'new@example.invalid',
      nickName: 'New user',
      auth_provider: 'google',
    },
    onboarding: { alarmAllowed: false, timezone: 'Asia/Seoul' },
    notifyDiscord: false,
    trackMixpanel: false,
  });
  assert.equal(saved.nickName, 'New user');
  assert.equal(saved.referral_code, 'ABC123');
  assert.equal(saved.alarmAllowed, false);
  assert.equal(saved.timezone, 'Asia/Seoul');
  assert.equal(saved.name, undefined);
});

test('소셜 DTO가 추천 코드와 일반 온보딩을 검증한다', async () => {
  for (const [Dto, credential] of [
    [GoogleLoginReqDto, { idToken: 'verified' }],
    [AppleLoginReqDto, { identityToken: 'verified' }],
    [FacebookLoginReqDto, { accessToken: 'verified' }],
  ]) {
    const errors = await validate(
      plainToInstance(Dto, {
        ...credential,
        referralCode: 123,
        onboarding: { timezone: 'invalid/zone' },
      }),
    );
    assert.ok(errors.some((error) => error.property === 'referralCode'));
    assert.ok(errors.some((error) => error.property === 'onboarding'));
  }
});

test('프로필에서 닉네임과 추천 코드를 노출하고 활성 구독만 프리미엄으로 판정한다', async () => {
  const now = Date.now();
  let profileQuery, paymentQuery;
  const service = new UserService({
    user: {
      findFirst: async (args) => {
        profileQuery = args;
        return { id: 7, nickName: 'Reader', referral_code: 'ABC123' };
      },
    },
    payment: {
      findFirst: async (args) => {
        paymentQuery = args;
        return { id: 1 };
      },
    },
  });
  const profile = await service.mypage({ id: 7 });
  assert.equal(profile.nickName, 'Reader');
  assert.equal(profile.referral_code, 'ABC123');
  assert.equal(profile.isPremium, true);
  assert.equal(profileQuery.select.refreshToken, undefined);
  assert.equal(profileQuery.select.nickName, true);
  assert.equal(profileQuery.select.referral_code, true);
  assert.equal(paymentQuery.where.userId, 7);
  assert.equal(paymentQuery.where.OR[0].status, 'ACTIVE');
  assert.ok(paymentQuery.where.OR[0].expiryDate.gt.getTime() >= now);
  assert.equal(paymentQuery.where.OR[1].status, 'GRACE_PERIOD');
  service.prisma.payment.findFirst = async () => null;
  assert.equal((await service.mypage({ id: 7 })).isPremium, false);
});

test('추천 코드가 충돌하면 다시 발급한다', async () => {
  const codes = [];
  const service = Object.assign(Object.create(AuthService.prototype), {
    prisma: {
      user: {
        count: async ({ where }) => {
          codes.push(where.referral_code);
          return codes.length === 1 ? 1 : 0;
        },
      },
    },
  });
  const code = await service.generateUniqueReferralCode();
  assert.equal(codes.length, 2);
  assert.equal(code, codes[1]);
  assert.match(code, /^[A-F0-9]{6}$/);
});

test('Apple 첫 로그인은 추천인을 검증한 뒤 회원가입과 토큰 발급을 연결한다', async () => {
  const apple = require('apple-signin-auth');
  const original = apple.verifyIdToken;
  const events = [];
  apple.verifyIdToken = async () => ({
    sub: 'verified-apple',
    email: 'apple@example.invalid',
  });
  try {
    const service = Object.assign(Object.create(AuthService.prototype), {
      configService: { get: () => 'configured.bundle' },
      logger: { error() {} },
      prisma: {
        user: {
          findFirst: async ({ where }) => {
            events.push(where);
            return where.referral_code ? { id: 1 } : null;
          },
        },
      },
      createAccount: async (args) => {
        events.push(args);
        return { id: 7, email: args.data.email };
      },
      generateAndSaveTokens: async (user) => ({
        accessToken: `account-${user.id}`,
        refreshToken: 'new-refresh',
      }),
    });
    const onboarding = { alarmAllowed: false, timezone: 'Asia/Seoul' };
    const tokens = await service.appleLogin({
      identityToken: 'verified',
      initialPlatform: 'IOS',
      referralCode: 'ABC123',
      onboarding,
    });
    assert.equal(tokens.accessToken, 'account-7');
    assert.deepEqual(events[0], { referral_code: 'ABC123', isDeleted: false });
    assert.equal(events[2].data.nickName, 'apple');
    assert.deepEqual(events[2].onboarding, onboarding);
  } finally {
    apple.verifyIdToken = original;
  }
});
