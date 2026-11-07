const test = require('node:test');
require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { checkEvidence } = require('../src/affiliate/types.ts');
const { seal, unseal } = require('../src/affiliate/vault.ts');
const { ChainGateway } = require('../src/affiliate/chain.ts');
const { AffiliateService } = require('../src/affiliate/affiliate.service.ts');
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
      { ...posts[0], caption: `${settings.keywords[0]} #광고아님` },
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

const activeCampaignId = 'maroo-hackathon-november';
const oldCampaignId = 'dave-november';
const activeCampaign = {
  id: activeCampaignId,
  settings,
  contractAddress: '0x' + '1'.repeat(40),
  policyTx: 'policy',
};

function serviceWith(database) {
  const service = Object.create(AffiliateService.prototype);
  service.prisma = database;
  service.config = { get: () => undefined };
  service.chain = {
    execute: async () => assert.fail('허용되지 않은 체인 전송'),
    provider: {
      getBalance: async () => 0n,
      getBlockNumber: async () => 1,
    },
  };
  return service;
}

test('이전 캠페인 참여자는 승인·지급·반려·재검수할 수 없음', async () => {
  for (const [action, status, argument] of [
    ['approve', 'pending', true],
    ['pay', 'approved'],
    ['reject', 'pending', '원본 확인 필요'],
    ['reopen', 'rejected'],
  ]) {
    const row = { id: 's1', campaignId: oldCampaignId, status };
    const before = structuredClone(row);
    const service = serviceWith({
      affiliateCampaign: { findUniqueOrThrow: async () => activeCampaign },
      campaignParticipant: {
        findUniqueOrThrow: async () => row,
        updateMany: async ({ where, data }) => {
          if (
            !Object.entries(where).every(([key, value]) => row[key] === value)
          )
            return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
    });
    service.workspace = async () => ({});
    await assert.rejects(() => service[action]('s1', argument), {
      name: 'BadRequestException',
    });
    assert.deepEqual(row, before, action);
  }
});

test('과거 미확정 지급은 소유 캠페인의 보상액으로 복구', async () => {
  const rows = [
    { id: 's1', campaignId: oldCampaignId, status: 'paying' },
    { id: 'maroo-s1', campaignId: activeCampaignId, status: 'paying' },
    {
      id: 's5',
      campaignId: oldCampaignId,
      status: 'paid',
      payoutTx: 'original-payout',
      paidAmount: 321,
      paidAt: new Date(0),
    },
  ];
  const oldPaid = structuredClone(rows[2]);
  const service = serviceWith({
    affiliateCampaign: {
      findUniqueOrThrow: async ({ where }) => ({
        id: where.id,
        settings: {
          ...settings,
          reward: where.id === oldCampaignId ? 321 : 500,
        },
      }),
    },
    campaignParticipant: {
      findMany: async ({ where }) =>
        rows.filter((row) => where.status.in.includes(row.status)),
      update: async ({ where, data }) =>
        Object.assign(
          rows.find((row) => row.id === where.id),
          data,
        ),
    },
    chainOperation: {
      findUnique: async ({ where }) => ({ txHash: where.operationKey }),
    },
  });
  service.chain.provider.getTransactionReceipt = async () => ({ status: 1 });
  await service.reconcile();
  assert.equal(rows[0].paidAmount, 321);
  assert.equal(rows[1].paidAmount, 500);
  assert.equal(rows[0].payoutTx, 's1:pay');
  assert.equal(rows[1].payoutTx, 'maroo-s1:pay');
  assert.deepEqual(rows[2], oldPaid);
});

test('마루 시드는 기존 캠페인·모든 참여 이력을 보존하고 기존 지갑을 재사용', async (t) => {
  const { seed } = require('../scripts/setup-testnet.ts');
  t.mock.method(console, 'log', () => {});
  const wallets = ['operator', 's1', 's2', 's3', 's4', 's5'].map((id) => ({
    id,
    address: id,
    encryptedKey: `preserved-${id}`,
  }));
  const campaigns = [
    {
      id: oldCampaignId,
      settings: { ...settings, title: '데이브 커피', reward: 321 },
      contractAddress: 'old-contract',
      deploymentTx: 'old-deployment',
      policyTx: 'old-policy',
      fundingTx: 'old-funding',
    },
  ];
  const participants = [
    'pending',
    'rejected',
    'approved',
    'failed',
    'paid',
  ].map((status, index) => ({
    id: `s${index + 1}`,
    campaignId: oldCampaignId,
    walletId: `s${index + 1}`,
    evidence: { caption: '기존 커피 증빙' },
    status,
    reason: '기존 사유',
    approvalTx: `approval-${index}`,
    payoutTx: index === 4 ? 'paid-s5' : null,
    paidAmount: index === 4 ? 321 : null,
    paidAt: index === 4 ? new Date(0) : null,
  }));
  const history = structuredClone({ wallets, campaigns, participants });
  const upsert =
    (rows) =>
    async ({ where, create, update }) => {
      assert.deepEqual(update, {});
      assert.ok(
        where.id === activeCampaignId || /^maroo-s[1-5]$/.test(where.id),
      );
      const existing = rows.find((row) => row.id === where.id);
      if (existing) return existing;
      rows.push(structuredClone(create));
      return create;
    };
  const database = {
    testWallet: {
      findUnique: async ({ where }) =>
        wallets.find((wallet) => wallet.id === where.id),
      findMany: async () => wallets,
      create: async () =>
        assert.fail('기존 지갑이 있으면 새 지갑을 만들지 않음'),
    },
    user: { upsert: async () => assert.fail('기존 사용자를 변경하지 않음') },
    affiliateCampaign: { upsert: upsert(campaigns) },
    campaignParticipant: { upsert: upsert(participants) },
  };
  await seed(database);
  assert.deepEqual(wallets, history.wallets);
  assert.deepEqual(campaigns[0], history.campaigns[0]);
  assert.deepEqual(participants.slice(0, 5), history.participants);
  assert.equal(campaigns[1].id, activeCampaignId);
  assert.deepEqual(campaigns[1].settings, settings);
  assert.equal(settings.title, '마루(Maroo) · 해커톤');
  assert.deepEqual(settings.keywords, ['#마루해커톤', '#광고']);
  for (const [index, row] of participants.slice(5).entries()) {
    assert.equal(row.id, `maroo-s${index + 1}`);
    assert.equal(row.walletId, `s${index + 1}`);
    assert.equal(row.campaignId, activeCampaignId);
    assert.equal(row.status, 'pending');
    assert.equal(row.evidence.walletId, undefined);
    assert.equal(row.payoutTx, undefined);
  }
  participants[5].status = 'approved';
  participants[5].approvalTx = 'new-approval';
  const afterFirstSeed = structuredClone({ wallets, campaigns, participants });
  await seed(database);
  assert.deepEqual({ wallets, campaigns, participants }, afterFirstSeed);
});

test('워크스페이스는 새 참여자 ID만 반환하며 완료된 과거 지급은 유지', async () => {
  const rows = [
    {
      id: 's5',
      campaignId: oldCampaignId,
      status: 'paid',
      payoutTx: 'old-paid',
    },
    ...posts.map((post) => ({
      id: post.id,
      campaignId: activeCampaignId,
      evidence: post,
      status: 'pending',
      wallet: { address: post.walletId, userId: post.walletId },
    })),
  ];
  const before = structuredClone(rows);
  const service = serviceWith({
    affiliateCampaign: {
      findUniqueOrThrow: async ({ where }) => {
        assert.equal(where.id, activeCampaignId);
        return activeCampaign;
      },
    },
    campaignParticipant: {
      findMany: async ({ where }) =>
        rows.filter((row) =>
          where.status
            ? where.status.in.includes(row.status)
            : row.campaignId === where.campaignId,
        ),
    },
    testWallet: { findUniqueOrThrow: async () => ({ address: 'operator' }) },
    $queryRaw: async () => [{ roleLimit: 2, databaseLimit: 2 }],
  });
  const workspace = await service.workspace();
  assert.equal(workspace.campaign.id, activeCampaignId);
  assert.deepEqual(
    workspace.participants.map((row) => row.id),
    ['maroo-s1', 'maroo-s2', 'maroo-s3', 'maroo-s4', 'maroo-s5'],
  );
  assert.ok(workspace.participants.every((row) => row.status === 'pending'));
  assert.deepEqual(rows, before);
});

test('마루 참여자의 승인·지급은 새 작업 키와 컨트랙트만 사용', async (t) => {
  t.mock.method(Date, 'now', () => now);
  const row = {
    id: 'maroo-s1',
    campaignId: activeCampaignId,
    evidence: posts[0],
    status: 'pending',
    wallet: { address: '0x' + '2'.repeat(40) },
  };
  const calls = [];
  const service = serviceWith({
    affiliateCampaign: { findUniqueOrThrow: async () => activeCampaign },
    campaignParticipant: {
      findUniqueOrThrow: async () => row,
      updateMany: async ({ where, data }) => {
        assert.equal(where.campaignId, activeCampaignId);
        assert.equal(where.id, row.id);
        assert.equal(where.status, row.status);
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ data }) => Object.assign(row, data),
    },
  });
  service.workspace = async () => row;
  service.chain.execute = async (key, transaction) => {
    calls.push(key);
    assert.equal(transaction.to, activeCampaign.contractAddress);
    return { status: 'confirmed', txHash: key };
  };
  await service.approve(row.id, true);
  assert.equal(row.status, 'approved');
  await service.pay(row.id);
  assert.equal(row.status, 'paid');
  assert.equal(row.paidAmount, settings.reward);
  await assert.rejects(() => service.pay(row.id));
  assert.deepEqual(calls, ['maroo-s1:approve', 'maroo-s1:pay']);
});

test('마루 참여자는 반려 후 재검수 가능', async () => {
  const row = {
    id: 'maroo-s2',
    campaignId: activeCampaignId,
    status: 'pending',
  };
  const service = serviceWith({
    campaignParticipant: {
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, {
          id: row.id,
          campaignId: activeCampaignId,
          status: row.status,
        });
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  });
  service.workspace = async () => row;
  await service.reject(row.id, '  광고 표시 누락  ');
  assert.equal(row.status, 'rejected');
  assert.equal(row.reason, '광고 표시 누락');
  await service.reopen(row.id);
  assert.equal(row.status, 'pending');
  assert.equal(row.reason, null);
});
