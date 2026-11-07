import { validAddress, rulesHash, period, evidenceHash } from "./domain.js";
export const CHAIN_ID = "0x6e0ff";
export const EXPLORER = "https://explorer-testnet.maroo.io";
const selectors = {
  campaign: "0x811e539c",
  reviews: "0x0755464f",
  approve: "0xc4b1d962",
  pay: "0x0c11dedd",
};
const word = (value) =>
  (typeof value === "string" && value.startsWith("0x")
    ? value.slice(2)
    : BigInt(value).toString(16)
  ).padStart(64, "0");
export const encode = (method, args = []) =>
  selectors[method] + args.map(word).join("");
const words = (result) => result.slice(2).match(/.{64}/g) || [];
/** @typedef {{request:(args:{method:string,params?:any[]})=>Promise<any>,on?:(event:string,callback:()=>void)=>void}} Provider */
/** @typedef {{provider:Provider,account:string,contract:string}} Connection */
/** @param {Provider} provider */
export async function connect(provider, contract, campaign) {
  if (!provider)
    throw new Error("브라우저에 EVM 지갑을 설치한 뒤 다시 연결하세요.");
  if (!validAddress(contract))
    throw new Error("올바른 정산 컨트랙트 주소를 입력하세요.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("지갑 계정을 선택하세요.");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID }],
    });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID,
          chainName: "Maroo Testnet",
          nativeCurrency: {
            name: "Testnet OKRW",
            symbol: "tOKRW",
            decimals: 18,
          },
          rpcUrls: ["https://rpc-testnet.maroo.io"],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID }],
    });
  }
  const connection = { provider, account: accounts[0], contract };
  await verify(connection, campaign);
  return connection;
}
/** @param {Connection} c */
export async function verify(c, campaign) {
  const chain = await c.provider.request({ method: "eth_chainId" });
  const accounts = await c.provider.request({ method: "eth_accounts" });
  if (
    chain.toLowerCase() !== CHAIN_ID ||
    accounts[0]?.toLowerCase() !== c.account.toLowerCase()
  )
    throw new Error("지갑 계정 또는 네트워크가 변경됐습니다. 다시 연결하세요.");
  const data = words(
    await c.provider.request({
      method: "eth_call",
      params: [{ to: c.contract, data: encode("campaign") }, "latest"],
    }),
  );
  if (data.length !== 8)
    throw new Error(
      "지원하는 정산 컨트랙트가 아닙니다. 배포 주소를 확인하세요.",
    );
  const range = period(campaign);
  const expected = [
    await rulesHash(campaign),
    c.account,
    Math.floor(range.start / 1000),
    Math.floor(range.end / 1000),
    BigInt(campaign.reward) * 10n ** 18n,
    campaign.likes,
    campaign.comments,
    campaign.views,
  ];
  if (data.some((w, i) => w.toLowerCase() !== word(expected[i]).toLowerCase()))
    throw new Error(
      "컨트랙트의 캠페인 기준 또는 집행자 계정이 현재 화면과 다릅니다.",
    );
}
/** @param {Connection} c */
export async function readReview(c, recipient) {
  const data = words(
    await c.provider.request({
      method: "eth_call",
      params: [
        { to: c.contract, data: encode("reviews", [recipient]) },
        "latest",
      ],
    }),
  );
  if (data.length !== 3) throw new Error("온체인 검수 상태를 읽지 못했습니다.");
  return {
    evidenceHash: "0x" + data[0],
    approved: BigInt("0x" + data[1]) === 1n,
    paid: BigInt("0x" + data[2]) === 1n,
  };
}
/** @param {Connection} c */
export async function send(c, campaign, submission, method, onHash) {
  await verify(c, campaign);
  const evidence = await evidenceHash(submission);
  const review = await readReview(c, submission.wallet);
  if (review.paid)
    throw new Error("이미 지급된 지갑입니다. 다시 지급할 수 없습니다.");
  if (
    method === "pay" &&
    (!review.approved || review.evidenceHash !== evidence)
  )
    throw new Error("현재 증빙과 일치하는 온체인 승인이 필요합니다.");
  const args =
    method === "approve"
      ? [
          submission.wallet,
          evidence,
          Math.floor(Date.parse(submission.postedAt) / 1000),
          submission.likes,
          submission.comments,
          submission.views,
          1,
        ]
      : [submission.wallet];
  const tx = { from: c.account, to: c.contract, data: encode(method, args) };
  // Estimate through the configured proxy, so PCL and contract rejection happens before signing.
  const gas = await c.provider.request({
    method: "eth_estimateGas",
    params: [tx],
  });
  const txHash = await c.provider.request({
    method: "eth_sendTransaction",
    params: [{ ...tx, gas }],
  });
  onHash(txHash);
  for (let i = 0; i < 60; i++) {
    const receipt = await c.provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (receipt) {
      if (BigInt(receipt.status) !== 1n)
        throw new Error(
          "거래가 체인에서 실패했습니다. 영수증에서 원인을 확인하세요.",
        );
      return { txHash, evidenceHash: evidence };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "아직 거래가 확정되지 않았습니다. 거래 링크로 상태를 확인한 뒤 새로고침하세요.",
  );
}
