const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { checkEvidence } = require('../src/affiliate/types.ts');
const { seal, unseal } = require('../src/affiliate/vault.ts');
const { ChainGateway } = require('../src/affiliate/chain.ts');
const { Wallet } = require('ethers');
const {
  limitDatabaseConnections,
} = require('../src/prisma/connection-limits.ts');
const { settings, posts } = require('../fixtures/campaign.json');
const now = Date.parse('2026-11-07T14:20:00+09:00');
test('세 조건 모두 충족한 증빙은 승인 가능', () =>
  assert.ok(
    Object.values(checkEvidence(posts[0], settings, now)).every(Boolean),
  ));
test('키워드 누락·성과 미달·기간 외 게시를 각각 차단', () => {
  assert.equal(checkEvidence(posts[1], settings, now).keywords, false);
  assert.equal(checkEvidence(posts[2], settings, now).engagement, false);
  assert.equal(checkEvidence(posts[3], settings, now).period, false);
});
test('비슷한 해시태그를 필수 키워드로 인정하지 않음', () =>
  assert.equal(
    checkEvidence(
      { ...posts[0], caption: '#데이브커피 #광고아님' },
      settings,
      now,
    ).keywords,
    false,
  ));
test('미래 게시 시각과 집행기간 밖 지급 차단', () => {
  assert.equal(
    checkEvidence(
      { ...posts[0], postedAt: '2026-11-08T12:00:00+09:00' },
      settings,
      now,
    ).period,
    false,
  );
  assert.equal(
    checkEvidence(posts[0], settings, Date.parse('2026-12-01T00:00:00+09:00'))
      .active,
    false,
  );
});
test('성과 숫자는 정수이고 기준 이상이어야 함', () => {
  for (const likes of [-1, 99.5, NaN])
    assert.equal(
      checkEvidence({ ...posts[0], likes }, settings, now).engagement,
      false,
    );
});
test('AES-GCM으로 암호화한 지갑 키를 정확히 복구', () => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const key = '0x' + randomBytes(32).toString('hex'),
    encrypted = seal(key);
  assert.ok(!encrypted.includes(key));
  assert.equal(unseal(encrypted), key);
});
test('암호문 변경은 인증 오류로 거부', () => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const encrypted = seal('test-only');
  const parts = encrypted.split('.');
  const raw = Buffer.from(parts[2], 'base64');
  raw[0] ^= 1;
  parts[2] = raw.toString('base64');
  assert.throws(() => unseal(parts.join('.')));
});
test('암호화 키가 없거나 다른 키이면 복구 불가', () => {
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const encrypted = seal('test-only');
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  assert.throws(() => unseal(encrypted));
  delete process.env.WALLET_ENCRYPTION_KEY;
  assert.throws(() => seal('test-only'));
});

test('전송 응답이 끊겨도 저장된 동일 서명 거래만 재전송', async () => {
  let record = null,
    creates = 0,
    signatures = 0,
    broadcasts = [];
  const database = {
    chainOperation: {
      findUnique: async () => record,
      findFirst: async () => record,
      create: async ({ data }) => {
        creates++;
        record = { id: 'operation', ...data };
        return record;
      },
      update: async ({ data }) => {
        record = { ...record, ...data };
        return record;
      },
    },
  };
  database.$transaction = async (work) =>
    work({ ...database, $queryRawUnsafe: async () => [] });
  const gateway = new ChainGateway(database);
  const wallet = Wallet.createRandom();
  gateway.signer = async () => ({
    getNonce: async () => 0,
    populateTransaction: async (tx) => ({
      ...tx,
      nonce: 0,
      chainId: 450815,
      gasLimit: 100000,
      maxFeePerGas: 1,
      maxPriorityFeePerGas: 1,
      type: 2,
    }),
    signTransaction: async (tx) => {
      signatures++;
      return wallet.signTransaction(tx);
    },
  });
  gateway.provider.getTransactionReceipt = async () => null;
  gateway.provider.getTransaction = async () => null;
  gateway.provider.broadcastTransaction = async (signed) => {
    broadcasts.push(signed);
    throw new Error('test-only network interruption');
  };
  const transaction = { to: wallet.address, value: 1 };
  try {
    await assert.rejects(() => gateway.execute('test:pay', transaction));
    assert.equal(creates, 1);
    gateway.provider.broadcastTransaction = async (signed) => {
      broadcasts.push(signed);
      return {};
    };
    gateway.provider.waitForTransaction = async () => ({ status: 1 });
    const recovered = await gateway.execute('test:pay', transaction);
    assert.equal(recovered.status, 'confirmed');
    assert.equal(signatures, 1);
    assert.equal(creates, 1);
    assert.equal(broadcasts[0], broadcasts[1]);
  } finally {
    gateway.provider.destroy();
  }
});

test('Prisma pool limits are enforced', () => {
  const url = new URL(
    limitDatabaseConnections(
      'postgresql://test:example@localhost/orot?connection_limit=100',
    ),
  );
  assert.equal(url.searchParams.get('connection_limit'), '2');
  assert.equal(url.searchParams.get('pool_timeout'), '15');
  for (const limit of [0, 6, NaN, 1.5])
    assert.throws(() => limitDatabaseConnections(url.toString(), limit));
});
