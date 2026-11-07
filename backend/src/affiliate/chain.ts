import {
  JsonRpcProvider,
  Wallet,
  FetchRequest,
  keccak256,
  TransactionRequest,
  Transaction,
} from 'ethers';
import { PrismaClient } from '@prisma/client';
import { unseal } from './vault';

export const MAROO_CHAIN_ID = 450815;
export const EXPLORER = 'https://explorer-testnet.maroo.io';
export const PCL_ADDRESS = '0x1000000000000000000000000000000000000005';
export const ESCROW_ABI = [
  'function approve(address,bytes32,uint64,uint64,uint64,uint64,bool)',
  'function pay(address)',
  'function reviews(address) view returns (bytes32 evidenceHash,bool approved,bool paid)',
  'function reserved() view returns (uint256)',
  'function campaign() view returns (bytes32,address,uint64,uint64,uint256,uint64,uint64,uint64)',
];
export function createProvider() {
  const request = new FetchRequest(
    process.env.MAROO_RPC_URL || 'https://rpc-testnet.maroo.io',
  );
  request.timeout = 15000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
}
export class ChainGateway {
  readonly provider = createProvider();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly prisma: PrismaClient) {}
  async signer() {
    if ((await this.provider.getNetwork()).chainId !== BigInt(MAROO_CHAIN_ID))
      throw new Error('Maroo 테스트넷이 아니므로 거래를 중단했습니다.');
    const stored = await this.prisma.testWallet.findUniqueOrThrow({
      where: { id: 'operator' },
    });
    return new Wallet(unseal(stored.encryptedKey), this.provider);
  }
  // 서명한 거래를 전송 전에 저장한다. 응답이 끊겨도 같은 거래만 재전송해 중복 송금을 막는다.
  async execute(operationKey: string, transaction: TransactionRequest) {
    const work = this.queue
      .catch(() => undefined)
      .then(async () => {
        const signer = await this.signer();
        const operation = await this.prisma.$transaction(
          async (database) => {
            // Vercel의 서로 다른 인스턴스도 같은 집행자 nonce를 중복 배정하지 못하게 한다.
            await database.$queryRawUnsafe(
              'SELECT pg_advisory_xact_lock(450815, 1707)::text',
            );
            const existing = await database.chainOperation.findUnique({
              where: { operationKey },
            });
            if (existing) return existing;
            const previous = await database.chainOperation.findFirst({
              orderBy: { createdAt: 'desc' },
            });
            const pendingNonce = await signer.getNonce('pending');
            const nonce = Math.max(
              pendingNonce,
              previous ? Transaction.from(previous.signedTx).nonce + 1 : 0,
            );
            const prepared = await signer.populateTransaction({
              ...transaction,
              nonce,
            });
            const signedTx = await signer.signTransaction(prepared);
            return database.chainOperation.create({
              data: { operationKey, txHash: keccak256(signedTx), signedTx },
            });
          },
          { maxWait: 15000, timeout: 30000 },
        );
        const oldReceipt = await this.provider.getTransactionReceipt(
          operation.txHash,
        );
        if (!oldReceipt) {
          try {
            await this.provider.broadcastTransaction(operation.signedTx);
          } catch {
            if (!(await this.provider.getTransaction(operation.txHash)))
              throw new Error(
                '전송 여부를 확인 중입니다. 잠시 후 같은 요청으로 다시 확인하세요.',
              );
          }
        }
        const receipt =
          oldReceipt ||
          (await this.provider
            .waitForTransaction(operation.txHash, 1, 45000)
            .catch(() => null));
        if (!receipt) return { txHash: operation.txHash, status: 'pending' };
        const status = receipt.status === 1 ? 'confirmed' : 'failed';
        await this.prisma.chainOperation.update({
          where: { id: operation.id },
          data: { status },
        });
        if (status === 'failed')
          throw new Error(
            '테스트넷 거래가 실패했습니다. 거래 영수증을 확인하세요.',
          );
        return { txHash: operation.txHash, status };
      });
    this.queue = work;
    return work;
  }
}
