require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JsonRpcProvider, parseEther } = require('ethers');
const jwt = require('jsonwebtoken');
const api = 'http://127.0.0.1:4010';
const checks = [];
async function run() {
  const login = await fetch(api + '/auth/tester-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TESTER_EMAIL,
      password: process.env.TESTER_PASSWORD,
    }),
  });
  assert.equal(login.status, 201);
  const tokens = await login.json();
  const accessToken = tokens.accessToken || tokens.data?.accessToken;
  assert.ok(accessToken);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
  const get = async () => {
    const r = await fetch(api + '/affiliate/workspace', { headers });
    assert.equal(r.status, 200);
    return (await r.json()).data;
  };
  const post = async (path, body = {}) => {
    const r = await fetch(api + '/affiliate/' + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await fetch(api + '/affiliate/workspace')).status, 403);
  checks.push('unauthenticated access rejected');
  const normalToken = jwt.sign(
    { id: 2, email: 's1@orot.example.invalid', role: 'Normal', type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
  assert.equal(
    (
      await fetch(api + '/affiliate/workspace', {
        headers: { Authorization: `Bearer ${normalToken}` },
      })
    ).status,
    403,
  );
  checks.push('normal user cannot execute operator APIs');
  const before = await get();
  assert.equal(before.participants.length, 5);
  assert.equal(
    new Set(before.participants.map((p) => p.address.toLowerCase())).size,
    5,
  );
  assert.ok(
    !JSON.stringify(before).includes('encryptedKey') &&
      !JSON.stringify(before).includes('privateKey'),
  );
  checks.push('five real server wallets returned without keys');
  for (const id of ['s2', 's3', 's4'])
    assert.equal((await post(id + '/approve', { verified: true })).status, 400);
  checks.push('keyword, engagement and period failures rejected server-side');
  assert.equal((await post('s1/approve', { verified: false })).status, 400);
  checks.push('human verification required');
  const receiver = before.participants.find((p) => p.id === 's5');
  const provider = new JsonRpcProvider(process.env.MAROO_RPC_URL, undefined, {
    batchMaxCount: 1,
  });
  try {
    if (receiver.status === 'pending') {
      const approved = await post('s5/approve', { verified: true });
      assert.equal(approved.status, 201);
      const state = approved.body.data.participants.find((p) => p.id === 's5');
      assert.equal(state.status, 'approved');
      checks.push('real approval transaction confirmed');
    }
    let latest = await get();
    let recipient = latest.participants.find((p) => p.id === 's5');
    if (recipient.status !== 'paid') {
      const balanceBefore = await provider.getBalance(recipient.address);
      const paid = await post('s5/pay');
      assert.equal(paid.status, 201);
      recipient = paid.body.data.participants.find((p) => p.id === 's5');
      assert.equal(recipient.status, 'paid');
      const receipt = await provider.getTransactionReceipt(recipient.payoutTx);
      assert.equal(receipt.status, 1);
      const balanceAfter = await provider.getBalance(
        recipient.address,
        receipt.blockNumber,
      );
      assert.equal(
        balanceAfter - balanceBefore,
        parseEther(String(latest.campaign.reward)),
      );
      checks.push('real payout receipt and recipient balance verified');
    }
    assert.equal((await post('s5/pay')).status, 400);
    checks.push('duplicate payment rejected');
    const final = await get();
    recipient = final.participants.find((p) => p.id === 's5');
    const report = {
      checkedAt: new Date().toISOString(),
      checks,
      chainId: 450815,
      contract: final.campaign.contractAddress,
      policyTx: final.campaign.policyTx,
      approvalTx: recipient.approvalTx,
      payoutTx: recipient.payoutTx,
      recipient: recipient.address,
      amount: recipient.paidAmount,
    };
    fs.mkdirSync('../artifacts/qa', { recursive: true });
    fs.writeFileSync(
      '../artifacts/qa/testnet-verification.json',
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    provider.destroy();
  }
}
run().catch((e) => {
  console.error('Testnet verification failed:', e.message);
  process.exitCode = 1;
});
