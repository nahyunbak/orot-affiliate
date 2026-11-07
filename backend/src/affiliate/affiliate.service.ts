import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Interface, formatEther, sha256, toUtf8Bytes } from 'ethers';
import { ChainGateway, ESCROW_ABI, EXPLORER } from './chain';
import {
  ACTIVE_CAMPAIGN_ID,
  CampaignSettings,
  PostEvidence,
  checkEvidence,
} from './types';

@Injectable()
export class AffiliateService implements OnModuleDestroy {
  readonly chain: ChainGateway;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.chain = new ChainGateway(prisma);
  }
  onModuleDestroy() {
    this.chain.provider.destroy();
  }
  private async campaign() {
    return this.prisma.affiliateCampaign.findUniqueOrThrow({
      where: { id: ACTIVE_CAMPAIGN_ID },
    });
  }
  async workspace() {
    await this.reconcile();
    const campaign = await this.campaign();
    const participants = await this.prisma.campaignParticipant.findMany({
      where: { campaignId: campaign.id },
      include: { wallet: { select: { address: true, userId: true } } },
      orderBy: { id: 'asc' },
    });
    const operator = await this.prisma.testWallet.findUniqueOrThrow({
      where: { id: 'operator' },
      select: { address: true },
    });
    const [limits] = await this.prisma.$queryRaw<
      { roleLimit: number; databaseLimit: number }[]
    >`
      SELECT (SELECT rolconnlimit FROM pg_roles WHERE rolname=current_user)::int AS "roleLimit",
      (SELECT datconnlimit FROM pg_database WHERE datname=current_database())::int AS "databaseLimit"
    `;
    let balance: string | null = null,
      contractBalance: string | null = null,
      blockNumber: number | null = null;
    try {
      [balance, contractBalance, blockNumber] = await Promise.all([
        this.chain.provider.getBalance(operator.address).then(formatEther),
        campaign.contractAddress
          ? this.chain.provider
              .getBalance(campaign.contractAddress)
              .then(formatEther)
          : Promise.resolve('0'),
        this.chain.provider.getBlockNumber(),
      ]);
    } catch {
      /* 체인 장애 시 마지막 지급 상태를 성공으로 바꾸지 않는다. */
    }
    return {
      campaign: {
        id: campaign.id,
        ...(campaign.settings as object),
        contractAddress: campaign.contractAddress,
        policyTx: campaign.policyTx,
        fundingTx: campaign.fundingTx,
      },
      operator: { address: operator.address, balance },
      database: {
        connectionPoolLimit: Number(
          this.config.get('DATABASE_CONNECTION_LIMIT') || 2,
        ),
        ...limits,
      },
      chain: {
        chainId: 450815,
        blockNumber,
        contractBalance,
        explorer: EXPLORER,
        connected: blockNumber !== null,
      },
      participants: participants.map((p) => ({
        id: p.id,
        ...(p.evidence as object),
        address: p.wallet.address,
        userId: p.wallet.userId,
        status: p.status,
        reason: p.reason,
        approvalTx: p.approvalTx,
        payoutTx: p.payoutTx,
        paidAmount: p.paidAmount,
        paidAt: p.paidAt,
      })),
    };
  }
  private async reconcile() {
    const pending = await this.prisma.campaignParticipant.findMany({
      where: { status: { in: ['approving', 'paying'] } },
    });
    for (const row of pending) {
      const isPayment = row.status === 'paying';
      const op = await this.prisma.chainOperation.findUnique({
        where: { operationKey: `${row.id}:${isPayment ? 'pay' : 'approve'}` },
      });
      if (!op) continue;
      const receipt = await this.chain.provider
        .getTransactionReceipt(op.txHash)
        .catch(() => null);
      if (!receipt) continue;
      const campaign = await this.prisma.affiliateCampaign.findUniqueOrThrow({
        where: { id: row.campaignId },
      });
      const settings = campaign.settings as unknown as CampaignSettings;
      await this.prisma.campaignParticipant.update({
        where: { id: row.id },
        data:
          receipt.status === 1
            ? {
                status: isPayment ? 'paid' : 'approved',
                ...(isPayment
                  ? {
                      payoutTx: op.txHash,
                      paidAmount: settings.reward,
                      paidAt: new Date(),
                    }
                  : { approvalTx: op.txHash }),
              }
            : {
                status: 'failed',
                reason: '체인에서 거래가 실패했습니다.',
                ...(isPayment
                  ? { payoutTx: op.txHash }
                  : { approvalTx: op.txHash }),
              },
      });
    }
  }
  async approve(id: string, verified: boolean) {
    if (!verified)
      throw new BadRequestException('원본 게시물과 수치를 확인해 주세요.');
    return this.transact(id, 'approve');
  }
  async pay(id: string) {
    return this.transact(id, 'pay');
  }
  private async transact(id: string, method: 'approve' | 'pay') {
    const campaign = await this.campaign();
    if (!campaign.contractAddress || !campaign.policyTx)
      throw new BadRequestException(
        '정산 컨트랙트와 PCL 정책 준비가 필요합니다.',
      );
    const row = await this.prisma.campaignParticipant.findUniqueOrThrow({
      where: { id },
      include: { wallet: { select: { address: true } } },
    });
    if (row.campaignId !== campaign.id)
      throw new BadRequestException('캠페인이 일치하지 않습니다.');
    const settings = campaign.settings as unknown as CampaignSettings,
      evidence = row.evidence as unknown as PostEvidence;
    const checks = checkEvidence(evidence, settings);
    if (!Object.values(checks).every(Boolean))
      throw new BadRequestException(
        '집행기간·필수 키워드·인게이지 조건을 모두 충족해야 합니다.',
      );
    const expected = method === 'approve' ? 'pending' : 'approved',
      pending = method === 'approve' ? 'approving' : 'paying';
    if (row.status !== expected && row.status !== pending)
      throw new BadRequestException(
        '현재 상태에서는 요청을 실행할 수 없습니다.',
      );
    if (row.status === expected) {
      const lock = await this.prisma.campaignParticipant.updateMany({
        where: { id, campaignId: campaign.id, status: expected },
        data: { status: pending, reason: null },
      });
      if (lock.count !== 1)
        throw new BadRequestException('이미 처리 중인 요청입니다.');
    }
    try {
      const proof = sha256(toUtf8Bytes(JSON.stringify(evidence)));
      const data = new Interface(ESCROW_ABI).encodeFunctionData(
        method,
        method === 'approve'
          ? [
              row.wallet.address,
              proof,
              Math.floor(Date.parse(evidence.postedAt) / 1000),
              evidence.likes,
              evidence.comments,
              evidence.views,
              true,
            ]
          : [row.wallet.address],
      );
      const result = await this.chain.execute(`${id}:${method}`, {
        to: campaign.contractAddress,
        data,
      });
      await this.prisma.campaignParticipant.update({
        where: { id },
        data: {
          ...(method === 'pay'
            ? { payoutTx: result.txHash }
            : { approvalTx: result.txHash }),
          ...(result.status === 'confirmed'
            ? {
                status: method === 'pay' ? 'paid' : 'approved',
                ...(method === 'pay'
                  ? { paidAmount: settings.reward, paidAt: new Date() }
                  : {}),
              }
            : {}),
        },
      });
      return this.workspace();
    } catch {
      const recorded = await this.prisma.chainOperation.findUnique({
        where: { operationKey: `${id}:${method}` },
      });
      if (!recorded)
        await this.prisma.campaignParticipant.update({
          where: { id },
          data: { status: expected },
        });
      throw new BadRequestException(
        recorded
          ? '거래를 확인 중입니다. 기록된 거래가 확정될 때까지 다시 지급하지 않습니다.'
          : '지급 조건, 예산 또는 네트워크를 확인하세요. 거래는 전송되지 않았습니다.',
      );
    }
  }
  async reject(id: string, reason: string) {
    if (!reason.trim())
      throw new BadRequestException('반려 사유를 입력하세요.');
    const result = await this.prisma.campaignParticipant.updateMany({
      where: { id, campaignId: ACTIVE_CAMPAIGN_ID, status: 'pending' },
      data: { status: 'rejected', reason: reason.trim() },
    });
    if (result.count !== 1)
      throw new BadRequestException('검수 대기 상태에서만 반려할 수 있습니다.');
    return this.workspace();
  }
  async reopen(id: string) {
    const result = await this.prisma.campaignParticipant.updateMany({
      where: { id, campaignId: ACTIVE_CAMPAIGN_ID, status: 'rejected' },
      data: { status: 'pending', reason: null },
    });
    if (result.count !== 1)
      throw new BadRequestException('반려 상태에서만 재검수할 수 있습니다.');
    return this.workspace();
  }
}
