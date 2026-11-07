require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { rootCertificates } = require('node:tls');
const {
  SignedDataVerifier,
  Environment,
} = require('@apple/app-store-server-library');
const { createAppleVerifier } = require('../src/payment/apple-verifier');
const { PaymentService } = require('../src/payment/payment.service');
const axios = require('axios').default;
// 공개 CA는 설정 파싱/위조 거부에만 사용한다. Apple 서명 성공은 모의 경계에서 따로 검증한다.
const dir = mkdtempSync(join(tmpdir(), 'apple-verification-'));
const rootPath = join(dir, 'public-root.pem');
writeFileSync(rootPath, rootCertificates[0]);
after(() => rmSync(dir, { recursive: true, force: true }));
const settings = {
  BUNDLE_ID: 'com.example.app',
  APPLE_IAP_ENVIRONMENT: 'Sandbox',
  APPLE_IAP_ROOT_CA_PATHS: rootPath,
  IAP_PRODUCT_IDS: 'example.monthly',
};
const config = (overrides = {}) => ({
  get: (key) => ({ ...settings, ...overrides })[key],
});
const transaction = () => ({
  bundleId: settings.BUNDLE_ID,
  environment: 'Sandbox',
  productId: 'example.monthly',
  transactionId: 'verified-transaction',
  originalTransactionId: 'verified-original',
  purchaseDate: Date.now() - 1000,
  expiresDate: Date.now() + 86400000,
});
const forged = (payload) =>
  `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.forged`;
function service(verifier) {
  return Object.assign(Object.create(PaymentService.prototype), {
    configService: config(),
    appleVerifier: verifier,
    logger: { error() {} },
    saveOrUpdatePayment: async () => assert.fail('unverified payment write'),
    activateSubscription: async () => assert.fail('unverified webhook write'),
    processAppleLegacyInternal: async () =>
      assert.fail('JWS must not fall back to legacy'),
  });
}
test('fail closed on invalid/missing configuration and enable online checks', () => {
  for (const override of [
    { APPLE_IAP_ENVIRONMENT: '' },
    { APPLE_IAP_ENVIRONMENT: 'LocalTesting' },
    { APPLE_IAP_ENVIRONMENT: 'Xcode' },
    { BUNDLE_ID: '' },
    { APPLE_IAP_ROOT_CA_PATHS: '' },
    { APPLE_IAP_ROOT_CA_PATHS: '/missing/root.cer' },
    { APPLE_IAP_ENVIRONMENT: 'Production' },
    { APPLE_IAP_APP_APPLE_ID: '-1' },
    { APPLE_IAP_APP_APPLE_ID: '1.2' },
    { APPLE_IAP_APP_APPLE_ID: '9007199254740992' },
  ])
    assert.throws(() => createAppleVerifier(config(override)));
  const v = createAppleVerifier(
    config({
      APPLE_IAP_ENVIRONMENT: 'Production',
      APPLE_IAP_APP_APPLE_ID: '123',
    }),
  );
  assert.equal(v.environment, Environment.PRODUCTION);
  assert.equal(v.appAppleId, 123);
  assert.equal(v.bundleId, settings.BUNDLE_ID);
  assert.equal(v.enableOnlineChecks, true);
});
test('official verifier rejects unsigned transaction, notification and renewal', async () => {
  const v = createAppleVerifier(config());
  for (const [method, payload] of [
    ['verifyAndDecodeTransaction', transaction()],
    [
      'verifyAndDecodeNotification',
      {
        notificationType: 'TEST',
        data: { bundleId: settings.BUNDLE_ID, environment: 'Sandbox' },
      },
    ],
    [
      'verifyAndDecodeRenewalInfo',
      { environment: 'Sandbox', originalTransactionId: 'verified-original' },
    ],
  ])
    await assert.rejects(v[method](forged(payload)));
});
test('official post-signature checks reject mismatched bundle, environment and production app ID', async () => {
  const v = new SignedDataVerifier(
    [],
    true,
    Environment.PRODUCTION,
    settings.BUNDLE_ID,
    123,
  );
  // 암호 검증 이후의 공식 식별자 검사를 분리한다. 위 테스트는 실제 암호 검증을 사용한다.
  for (const p of [
    { ...transaction(), environment: 'Production', bundleId: 'other.app' },
    transaction(),
  ]) {
    v.verifyJWT = async () => p;
    await assert.rejects(
      v.verifyAndDecodeTransaction('verified-at-crypto-boundary'),
    );
  }
  for (const data of [
    {
      bundleId: settings.BUNDLE_ID,
      environment: 'Production',
      appAppleId: 999,
    },
    { bundleId: 'other.app', environment: 'Production', appAppleId: 123 },
    { bundleId: settings.BUNDLE_ID, environment: 'Sandbox', appAppleId: 123 },
  ]) {
    v.verifyJWT = async () => ({ data });
    await assert.rejects(
      v.verifyAndDecodeNotification('verified-at-crypto-boundary'),
    );
  }
  v.verifyJWT = async () => ({ environment: 'Sandbox' });
  await assert.rejects(
    v.verifyAndDecodeRenewalInfo('verified-at-crypto-boundary'),
  );
});
test('purchase and restore reject forged JWS without saving or legacy fallback', async () => {
  const s = service();
  const jws = forged(transaction());
  await assert.rejects(
    s.verifyAppleReceipt(
      { receiptData: jws, productId: 'example.monthly' },
      { id: 7 },
    ),
  );
  await assert.rejects(s.restoreApplePurchase([jws], { id: 7 }));
  await assert.rejects(
    s.verifyAppleReceipt(
      { receiptData: 'e30.e30.fake', productId: 'example.monthly' },
      { id: 7 },
    ),
  );
});
test('webhook rejects forged outer payload before writes', async () => {
  assert.equal(
    (
      await service().handleAppleWebhook({
        signedPayload: forged({
          notificationType: 'SUBSCRIBED',
          data: { signedTransactionInfo: forged(transaction()) },
        }),
      })
    ).success,
    false,
  );
});
test('purchase and restore use only verified payload and preserve owner options', async () => {
  const verified = transaction();
  const jws = forged({ ...verified, transactionId: 'untrusted' });
  const writes = [];
  const s = service({
    verifyAndDecodeTransaction: async (input) => {
      assert.equal(input, jws);
      return verified;
    },
  });
  s.saveOrUpdatePayment = async (args) => {
    writes.push(args);
    return { payment: { ...args.createData, id: 1 }, status: args.status };
  };
  assert.equal(
    (await s.verifyAppleReceipt({ receiptData: jws }, { id: 7 })).success,
    true,
  );
  assert.equal((await s.restoreApplePurchase([jws], { id: 7 })).success, true);
  assert.equal(writes.length, 2);
  for (const w of writes) {
    assert.equal(w.createData.transactionId, verified.transactionId);
    assert.equal(w.originalTransactionId, verified.originalTransactionId);
    assert.equal(w.user.id, 7);
  }
  assert.equal(writes[1].options.checkUserId, true);
});
function webhookVerifier(overrides = {}) {
  return {
    verifyAndDecodeNotification: async () => ({
      notificationType: 'SUBSCRIBED',
      data: {
        signedTransactionInfo: 'transaction',
        signedRenewalInfo: 'renewal',
      },
    }),
    verifyAndDecodeTransaction: async () => transaction(),
    verifyAndDecodeRenewalInfo: async () => ({
      originalTransactionId: 'verified-original',
      productId: 'example.monthly',
      autoRenewStatus: 1,
    }),
    ...overrides,
  };
}
test('invalid nested transaction or renewal and mismatched renewal cannot write', async () => {
  for (const method of [
    'verifyAndDecodeTransaction',
    'verifyAndDecodeRenewalInfo',
  ]) {
    const s = service(
      webhookVerifier({
        [method]: async () => {
          throw new Error('invalid signature');
        },
      }),
    );
    assert.equal(
      (await s.handleAppleWebhook({ signedPayload: 'notification' })).success,
      false,
    );
  }
  for (const renewal of [
    { originalTransactionId: 'other', productId: 'example.monthly' },
    { originalTransactionId: 'verified-original', productId: 'other' },
  ]) {
    assert.equal(
      (
        await service(
          webhookVerifier({ verifyAndDecodeRenewalInfo: async () => renewal }),
        ).handleAppleWebhook({ signedPayload: 'notification' })
      ).success,
      false,
    );
  }
});
test('webhook awaits all three verifiers and uses only verified transaction', async () => {
  const calls = [];
  const v = webhookVerifier();
  for (const method of Object.keys(v)) {
    const original = v[method];
    v[method] = async (input) => {
      calls.push([method, input]);
      return original(input);
    };
  }
  const s = service(v);
  s.activateSubscription = async (args) => {
    assert.equal(args.transactionId, 'verified-transaction');
    calls.push(['write']);
  };
  assert.equal(
    (await s.handleAppleWebhook({ signedPayload: 'notification' })).success,
    true,
  );
  assert.deepEqual(calls, [
    ['verifyAndDecodeNotification', 'notification'],
    ['verifyAndDecodeTransaction', 'transaction'],
    ['verifyAndDecodeRenewalInfo', 'renewal'],
    ['write'],
  ]);
});
test('verified TEST needs no transaction; forged TEST fails', async () => {
  const s = service({
    verifyAndDecodeNotification: async () => ({ notificationType: 'TEST' }),
  });
  assert.equal(
    (await s.handleAppleWebhook({ signedPayload: 'verified-test' })).success,
    true,
  );
  assert.equal(
    (
      await service().handleAppleWebhook({
        signedPayload: forged({ notificationType: 'TEST' }),
      })
    ).success,
    false,
  );
});
test('incomplete verified subscription cannot reach persistence', async () => {
  for (const override of [
    { transactionId: undefined },
    { expiresDate: undefined },
    { purchaseDate: NaN },
  ])
    await assert.rejects(
      service({
        verifyAndDecodeTransaction: async () => ({
          ...transaction(),
          ...override,
        }),
      }).processAppleJWSInternal(
        { receiptData: 'signed', user: { id: 7 } },
        {},
      ),
    );
});
test('legacy receipts still require Apple server success and persist returned transaction', async () => {
  const originalPost = axios.post;
  try {
    const s = service();
    delete s.processAppleLegacyInternal;
    let status = 0;
    let saved = 0;
    axios.post = async (url) => {
      assert.match(
        url,
        /^https:\/\/(sandbox|buy)\.itunes\.apple\.com\/verifyReceipt$/,
      );
      return {
        data: {
          status,
          latest_receipt_info: [
            {
              transaction_id: 'legacy-verified',
              original_transaction_id: 'legacy-original',
              product_id: 'example.monthly',
              purchase_date_ms: String(Date.now()),
              expires_date_ms: String(Date.now() + 86400000),
              is_trial_period: 'false',
            },
          ],
        },
      };
    };
    s.saveOrUpdatePayment = async (args) => {
      saved++;
      assert.equal(args.createData.transactionId, 'legacy-verified');
      return { payment: { ...args.createData, id: 1 }, status: args.status };
    };
    assert.equal(
      (
        await s.verifyAppleReceipt(
          { receiptData: 'legacy-base64', productId: 'example.monthly' },
          { id: 7 },
        )
      ).success,
      true,
    );
    status = 21003;
    assert.equal(
      (
        await s.verifyAppleReceipt(
          { receiptData: 'legacy-base64', productId: 'example.monthly' },
          { id: 7 },
        )
      ).success,
      false,
    );
    assert.equal(saved, 1);
  } finally {
    axios.post = originalPost;
  }
});

test('real verifier rejects forged nested JWS even after verified outer notification', async () => {
  const real = createAppleVerifier(config());
  for (const kind of ['transaction', 'renewal']) {
    const subject = service(
      webhookVerifier({
        verifyAndDecodeTransaction:
          kind === 'transaction'
            ? () => real.verifyAndDecodeTransaction(forged(transaction()))
            : async () => transaction(),
        verifyAndDecodeRenewalInfo: () =>
          real.verifyAndDecodeRenewalInfo(forged({ environment: 'Sandbox' })),
      }),
    );
    assert.equal(
      (await subject.handleAppleWebhook({ signedPayload: 'verified-outer' }))
        .success,
      false,
    );
  }
});

test('TEST cannot bypass validation with renewal data and no transaction', async () => {
  const subject = service({
    verifyAndDecodeNotification: async () => ({
      notificationType: 'TEST',
      data: { signedRenewalInfo: 'forged' },
    }),
  });
  assert.equal(
    (await subject.handleAppleWebhook({ signedPayload: 'verified-outer' }))
      .success,
    false,
  );
});

test('a supplied non-Apple certificate chain cannot authorize forged data', async () => {
  const { X509Certificate } = require('node:crypto');
  const cert = new X509Certificate(rootCertificates[0]).raw.toString('base64');
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', x5c: [cert, cert, cert] }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(transaction())).toString(
    'base64url',
  );
  await assert.rejects(
    createAppleVerifier(config()).verifyAndDecodeTransaction(
      `${header}.${payload}.forged`,
    ),
  );
});
