const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
Object.assign(process.env, require('dotenv').parse(fs.readFileSync('.env.production')));
execFileSync('/usr/bin/pnpm', ['exec', 'prisma', 'generate'], { stdio: 'inherit', env: process.env });
execFileSync('/usr/bin/pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
const { PrismaClient } = require('@prisma/client');
const { Wallet } = require('ethers');
const { unseal } = require('../dist/affiliate/vault');
const db = new PrismaClient({ log: [] });
async function run() {
  if (fs.existsSync('.seed.json')) {
    const seed = JSON.parse(fs.readFileSync('.seed.json', 'utf8'));
    for (const row of seed.users) await db.user.upsert({ where: { id: row.id }, create: row, update: {} });
    for (const row of seed.wallets) await db.testWallet.upsert({ where: { id: row.id }, create: row, update: {} });
    for (const row of seed.campaigns) await db.affiliateCampaign.upsert({ where: { id: row.id }, create: row, update: {} });
    for (const row of seed.participants) await db.campaignParticipant.upsert({ where: { id: row.id }, create: row, update: {} });
    for (const row of seed.operations) await db.chainOperation.upsert({ where: { id: row.id }, create: row, update: {} });
    await db.$queryRawUnsafe('SELECT setval(pg_get_serial_sequence(\'"User"\',\'id\'), (SELECT MAX(id) FROM "User"), true)');
    fs.unlinkSync('.seed.json');
  }
  const wallets = await db.testWallet.findMany();
  for (const row of wallets) if (new Wallet(unseal(row.encryptedKey)).address !== row.address) throw new Error('Wallet verification failed');
  console.log(JSON.stringify({ event: 'OROT_DATA_VERIFIED', users: await db.user.count(), wallets: wallets.length, participants: await db.campaignParticipant.count() }));
}
run().catch(() => { console.error('Orot data setup failed; private values not logged.'); process.exitCode = 1; }).finally(() => db.$disconnect());
