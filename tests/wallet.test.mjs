import test from "node:test";
import assert from "node:assert/strict";
import { encode, CHAIN_ID, connect, verify, send } from "../src/wallet.js";
import {
  DEFAULT_CAMPAIGN as c,
  period,
  rulesHash,
  seedSubmissions,
  evidenceHash,
} from "../src/domain.js";
const address = "0x" + "1".repeat(40),
  contract = "0x" + "2".repeat(40);
const word = (x) =>
  (typeof x === "string" && x.startsWith("0x")
    ? x.slice(2)
    : BigInt(x).toString(16)
  ).padStart(64, "0");
async function fixture(overrides = {}) {
  const p = period(c),
    call =
      "0x" +
      [
        await rulesHash(c),
        address,
        p.start / 1000,
        p.end / 1000,
        BigInt(c.reward) * 10n ** 18n,
        c.likes,
        c.comments,
        c.views,
      ]
        .map(word)
        .join("");
  const calls = [];
  const provider = {
    request: async (q) => {
      calls.push(q);
      if (overrides[q.method]) return overrides[q.method](q);
      return {
        eth_requestAccounts: [address],
        eth_accounts: [address],
        eth_chainId: CHAIN_ID,
        eth_call: call,
        wallet_switchEthereumChain: null,
      }[q.method];
    },
  };
  return { provider, account: address, contract, calls };
}
test("Maroo chain ID and static ABI encoding are exact", () => {
  assert.equal(Number(CHAIN_ID), 450815);
  assert.equal(encode("pay", [address]), "0x0c11dedd" + word(address));
});
test("connection checks chain, reviewer and immutable campaign", async () => {
  const f = await fixture();
  await connect(f.provider, contract, c);
  await assert.rejects(() => verify(f, { ...c, reward: 501 }));
  const wrong = await fixture({ eth_chainId: () => "0x1" });
  await assert.rejects(() => verify(wrong, c));
});
test("a failed receipt never becomes a successful payout", async () => {
  const s = seedSubmissions()[0],
    evidence = await evidenceHash(s);
  const f = await fixture({
    eth_call: (q) =>
      q.params[0].data.startsWith("0x0755464f")
        ? "0x" + [evidence, 1, 0].map(word).join("")
        : normal,
    eth_estimateGas: () => "0x20000",
    eth_sendTransaction: () => "0x" + "a".repeat(64),
    eth_getTransactionReceipt: () => ({ status: "0x0" }),
  });
  const base = await fixture();
  const normal = await base.provider.request({
    method: "eth_call",
    params: [{ data: encode("campaign") }],
  });
  let emitted;
  await assert.rejects(
    () => send(f, c, s, "pay", (h) => (emitted = h)),
    /실패/,
  );
  assert.match(emitted, /^0x/);
});
test("changed evidence prevents payment before signing", async () => {
  const base = await fixture();
  const normal = await base.provider.request({
    method: "eth_call",
    params: [{ data: encode("campaign") }],
  });
  const f = await fixture({
    eth_call: (q) =>
      q.params[0].data.startsWith("0x0755464f")
        ? "0x" + [0, 1, 0].map(word).join("")
        : normal,
  });
  await assert.rejects(
    () => send(f, c, seedSubmissions()[0], "pay", () => {}),
    /증빙/,
  );
  assert.equal(
    f.calls.some((c) => c.method === "eth_sendTransaction"),
    false,
  );
});
