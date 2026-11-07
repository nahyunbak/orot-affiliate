import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAMPAIGN as c,
  DEMO_NOW,
  seedSubmissions,
  evaluate,
  approve,
  payDemo,
  validateCampaign,
  validateSubmission,
  hasKeyword,
  period,
  rulesHash,
  evidenceHash,
} from "../src/domain.js";
const valid = () => seedSubmissions()[0];
test("all three criteria pass; fixtures independently fail keywords, engagement and time", () => {
  const results = seedSubmissions().map((s) => evaluate(s, c, DEMO_NOW));
  assert.equal(results[0].eligible, true);
  assert.equal(results[1].checks[1].pass, false);
  assert.equal(results[2].checks[2].pass, false);
  assert.equal(results[3].checks[0].pass, false);
});
test("hashtag matching rejects a longer hashtag and normalizes unicode", () => {
  assert.equal(hasKeyword("#광고아님", "#광고"), false);
  assert.equal(hasKeyword("#광고, 좋은 커피", "#광고"), true);
  assert.equal(hasKeyword("＃광고", "#광고"), true);
  assert.equal(hasKeyword("#DAVE", "#dave"), true);
});
test("period uses inclusive KST boundaries; future posts fail", () => {
  const p = period(c);
  const s = valid();
  assert.equal(
    evaluate({ ...s, postedAt: new Date(p.start).toISOString() }, c, p.start)
      .eligible,
    true,
  );
  assert.equal(evaluate(s, c, p.end).eligible, true);
  assert.equal(evaluate(s, c, p.end + 1).eligible, false);
  assert.equal(evaluate(s, c, p.start - 1).eligible, false);
  assert.equal(
    evaluate(
      { ...s, postedAt: new Date(DEMO_NOW + 1).toISOString() },
      c,
      DEMO_NOW,
    ).eligible,
    false,
  );
});
test("human verification and pending state are required for approval", () => {
  assert.throws(() => approve(valid(), c, false, DEMO_NOW));
  assert.throws(() => approve(seedSubmissions()[1], c, true, DEMO_NOW));
  assert.throws(() =>
    approve({ ...valid(), status: "rejected" }, c, true, DEMO_NOW),
  );
  assert.equal(approve(valid(), c, true, DEMO_NOW).status, "approved");
});
test("unapproved, duplicate and expired payments are blocked", () => {
  assert.throws(() => payDemo(valid(), c, DEMO_NOW));
  const approved = approve(valid(), c, true, DEMO_NOW),
    paid = payDemo(approved, c, DEMO_NOW);
  assert.equal(paid.paidAmount, c.reward);
  assert.equal(paid.txHash, undefined);
  assert.throws(() => payDemo(paid, c, DEMO_NOW));
  assert.throws(() => payDemo(approved, c, period(c).end + 1));
});
test("malformed rules and unsafe submissions fail", () => {
  for (const patch of [
    { start: "2026-12-01" },
    { keywords: [] },
    { keywords: ["#"] },
    { likes: -1 },
    { reward: 0 },
    { views: NaN },
    { reward: 1.5 },
  ])
    assert.throws(() => validateCampaign({ ...c, ...patch }));
  const s = { ...valid(), url: "https://www.instagram.com/p/valid/" };
  assert.doesNotThrow(() => validateSubmission(s));
  for (const url of [
    "javascript:alert(1)",
    "https://instagram.com.evil.test/p/x",
    "https://www.instagram.com/creator/",
  ])
    assert.throws(() => validateSubmission({ ...s, url }));
  assert.throws(() =>
    validateSubmission({ ...s, wallet: "0x" + "0".repeat(40) }),
  );
});
test("rules and evidence commitments change on meaningful edits", async () => {
  assert.notEqual(
    await rulesHash(c),
    await rulesHash({ ...c, keywords: ["#new"] }),
  );
  assert.notEqual(
    await evidenceHash(valid()),
    await evidenceHash({ ...valid(), likes: 999 }),
  );
  assert.equal(
    await evidenceHash(valid()),
    await evidenceHash({ ...valid(), status: "approved" }),
  );
});
