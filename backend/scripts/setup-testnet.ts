import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  Wallet,
  Contract,
  ContractFactory,
  AbiCoder,
  Interface,
  parseEther,
  formatEther,
  sha256,
  toUtf8Bytes,
} from 'ethers';
import { seal, unseal } from '../src/affiliate/vault';
import { createProvider, PCL_ADDRESS } from '../src/affiliate/chain';
import { CampaignSettings, PostEvidence } from '../src/affiliate/types';

const prisma = new PrismaClient();
const provider = createProvider();
const fixture = JSON.parse(readFileSync('fixtures/campaign.json', 'utf8')) as {
  settings: CampaignSettings;
  posts: (PostEvidence & { id: string })[];
};
const campaignId = 'dave-november';
async function seed() {
  const people = [
    { id: 'operator', name: '데이브 캠페인 집행자' },
    ...fixture.posts.map((p) => ({ id: p.id, name: p.name })),
  ];
  for (const person of people) {
    if (await prisma.testWallet.findUnique({ where: { id: person.id } }))
      continue;
    const email =
      person.id === 'operator'
        ? process.env.TESTER_EMAIL
        : `${person.id}@orot.example.invalid`;
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        nickName: person.name,
        referral_code: `orot-${person.id}`,
        auth_provider: 'local',
        initialPlatform: 'WEB',
        language: 'ko',
        timezone: 'Asia/Seoul',
        role: person.id === 'operator' ? 'Admin' : 'Normal',
      },
      update: {},
    });
    const wallet = Wallet.createRandom();
    await prisma.testWallet.create({
      data: {
        id: person.id,
        userId: user.id,
        address: wallet.address,
        encryptedKey: seal(wallet.privateKey),
        role: person.id === 'operator' ? 'operator' : 'influencer',
      },
    });
  }
  await prisma.affiliateCampaign.upsert({
    where: { id: campaignId },
    create: { id: campaignId, settings: fixture.settings as never },
    update: {},
  });
  for (const { id, ...evidence } of fixture.posts) {
    await prisma.campaignParticipant.upsert({
      where: { id },
      create: {
        id,
        campaignId,
        walletId: id,
        evidence: evidence as never,
        status: 'pending',
      },
      update: {},
    });
  }
  console.log(
    JSON.stringify({
      wallets: await prisma.testWallet.findMany({
        select: { id: true, address: true, userId: true, role: true },
        orderBy: { id: 'asc' },
      }),
    }),
  );
}
async function setup() {
  await seed();
  if (process.argv.includes('--seed-only')) return;
  if ((await provider.getNetwork()).chainId !== 450815n)
    throw new Error('Wrong chain');
  const stored = await prisma.testWallet.findUniqueOrThrow({
    where: { id: 'operator' },
  });
  const signer = new Wallet(unseal(stored.encryptedKey), provider);
  const balance = await provider.getBalance(signer.address);
  console.log(
    JSON.stringify({ operator: signer.address, balance: formatEther(balance) }),
  );
  if (balance < parseEther('100')) {
    const response = await fetch(
      'https://faucet.maroo.io/api/agent/sendToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: signer.address,
          chain: 'MAROO_TESTNET',
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    const data = (await response.json()) as {
      txHash?: string;
      message?: string;
    };
    if (!response.ok || !data.txHash)
      throw new Error(
        `Faucet returned ${response.status}: ${data.message || 'verify balance before retrying'}`,
      );
    console.log(JSON.stringify({ faucetTx: data.txHash }));
    await provider.waitForTransaction(data.txHash, 1, 60000);
  }
  let campaign = await prisma.affiliateCampaign.findUniqueOrThrow({
    where: { id: campaignId },
  });
  const settings = campaign.settings as unknown as CampaignSettings;
  const artifact = JSON.parse(
    readFileSync('chain-artifacts/escrow.json', 'utf8'),
  );
  const pcl = new Contract(
    PCL_ADDRESS,
    JSON.parse(readFileSync('chain-artifacts/pcl.json', 'utf8')),
    signer,
  );
  if (!campaign.contractAddress) {
    const implementation = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer,
    ).deploy();
    await implementation.waitForDeployment();
    const ruleHash = sha256(
      toUtf8Bytes(
        JSON.stringify([
          settings.title,
          settings.start,
          settings.end,
          settings.keywords,
          settings.likes,
          settings.comments,
          settings.views,
          settings.reward,
        ]),
      ),
    );
    const initializer = new Interface(artifact.abi).encodeFunctionData(
      'initialize',
      [
        signer.address,
        ruleHash,
        Math.floor(Date.parse(settings.start + 'T00:00:00+09:00') / 1000),
        Math.floor(Date.parse(settings.end + 'T23:59:59+09:00') / 1000),
        parseEther(String(settings.reward)),
        settings.likes,
        settings.comments,
        settings.views,
      ],
    );
    const initData = AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'bytes'],
      [await implementation.getAddress(), signer.address, initializer],
    );
    const tx = await pcl.deployPclProxy(1, 0, initData);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return pcl.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event?.name === 'PclProxyDeployed');
    if (!event) throw new Error('PCL proxy event missing');
    campaign = await prisma.affiliateCampaign.update({
      where: { id: campaignId },
      data: { contractAddress: event.args.proxy, deploymentTx: tx.hash },
    });
    console.log(
      JSON.stringify({
        contractAddress: campaign.contractAddress,
        deploymentTx: tx.hash,
      }),
    );
  }
  if (!campaign.policyTx) {
    await pcl.policyTemplate('VOLUME_POLICY');
    const policy = AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(string[] tokens,tuple(uint256 minLimit,uint256 maxLimit)[] limits)',
      ],
      [
        {
          tokens: ['atokrw'],
          limits: [
            { minLimit: 0, maxLimit: parseEther(String(settings.reward)) },
          ],
        },
      ],
    );
    const tx = await pcl.changeContractPolicies({
      _contract: campaign.contractAddress,
      admin: signer.address,
      policies: [
        {
          templateId: 'VOLUME_POLICY',
          policy,
          selector: new Interface(artifact.abi).getFunction('pay')!.selector,
        },
      ],
    });
    await tx.wait();
    campaign = await prisma.affiliateCampaign.update({
      where: { id: campaignId },
      data: { policyTx: tx.hash },
    });
    console.log(JSON.stringify({ policyTx: tx.hash }));
  }
  if (!campaign.fundingTx) {
    const tx = await signer.sendTransaction({
      to: campaign.contractAddress,
      value: parseEther(String(settings.reward * fixture.posts.length)),
    });
    await tx.wait();
    campaign = await prisma.affiliateCampaign.update({
      where: { id: campaignId },
      data: { fundingTx: tx.hash },
    });
    console.log(JSON.stringify({ fundingTx: tx.hash }));
  }
  mkdirSync('.data', { recursive: true });
  writeFileSync(
    '.data/testnet-evidence.json',
    JSON.stringify(
      {
        chainId: 450815,
        operator: signer.address,
        contract: campaign.contractAddress,
        deploymentTx: campaign.deploymentTx,
        policyTx: campaign.policyTx,
        fundingTx: campaign.fundingTx,
      },
      null,
      2,
    ),
  );
  console.log(
    'Test wallets saved on server; PCL escrow funded. Private keys were not printed.',
  );
}
setup()
  .catch(() => {
    console.error(
      'Testnet setup did not complete. Inspect public chain/DB state before retrying; credentials are not logged.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    provider.destroy();
    await prisma.$disconnect();
  });
