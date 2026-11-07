/** @typedef {{title:string,start:string,end:string,keywords:string[],likes:number,comments:number,views:number,reward:number}} Campaign */
/** @typedef {{id:string,name:string,handle:string,url:string,postedAt:string,caption:string,likes:number,comments:number,views:number,wallet:string,status:string,reason?:string,txHash?:string,paidAmount?:number,evidenceHash?:string,source?:string}} Submission */

export const DEMO_NOW = Date.parse("2026-11-07T14:20:00+09:00");
export const DEFAULT_CAMPAIGN = {
  title: "데이브 커피 · 나의 아침 루틴",
  start: "2026-11-01",
  end: "2026-11-30",
  keywords: ["#데이브커피", "#광고"],
  likes: 100,
  comments: 10,
  views: 1000,
  reward: 500,
};
export const validAddress = (value) =>
  /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
export const normalize = (value) =>
  value.normalize("NFKC").toLocaleLowerCase("ko-KR");
/** @param {Campaign} campaign */
export function period(campaign) {
  return {
    start: Date.parse(`${campaign.start}T00:00:00+09:00`),
    end: Date.parse(`${campaign.end}T23:59:59+09:00`),
  };
}
/** @param {Campaign} c */
export function validateCampaign(c) {
  const p = period(c);
  if (!c.title.trim()) throw new Error("캠페인 이름을 입력하세요.");
  if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || p.start > p.end)
    throw new Error("종료일은 시작일 이후여야 합니다.");
  if (
    !c.keywords.length ||
    c.keywords.some((k) => !k.trim() || k.trim() === "#")
  )
    throw new Error("필수 키워드를 한 개 이상 입력하세요.");
  if (
    ![c.likes, c.comments, c.views].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9,
    )
  )
    throw new Error("인게이지 기준은 0 이상의 정수로 입력하세요.");
  if (!Number.isSafeInteger(c.reward) || c.reward < 1 || c.reward > 1e6)
    throw new Error("지급액은 1~1,000,000 tOKRW 정수로 입력하세요.");
}
export function hasKeyword(caption, keyword) {
  const text = normalize(caption),
    key = normalize(keyword.trim());
  return key.startsWith("#")
    ? (text.match(/#[\p{L}\p{N}_]+/gu) || []).includes(key)
    : text.includes(key);
}
/** @param {Submission} s @param {Campaign} c */
export function evaluate(s, c, now = Date.now()) {
  const { start, end } = period(c),
    posted = Date.parse(s.postedAt);
  const keywords = c.keywords.map((word) => ({
    word,
    pass: hasKeyword(s.caption, word),
  }));
  const metrics = ["likes", "comments", "views"].map((key) => ({
    key,
    actual: s[key],
    minimum: c[key],
    pass: Number.isSafeInteger(s[key]) && s[key] >= c[key],
  }));
  const checks = [
    {
      key: "period",
      pass:
        Number.isFinite(posted) &&
        posted >= start &&
        posted <= end &&
        posted <= now,
    },
    {
      key: "keywords",
      pass: keywords.length > 0 && keywords.every((k) => k.pass),
    },
    { key: "engagement", pass: metrics.every((m) => m.pass) },
  ];
  const active = now >= start && now <= end;
  return {
    checks,
    keywords,
    metrics,
    active,
    eligible: active && checks.every((c) => c.pass) && validAddress(s.wallet),
    count: checks.filter((c) => c.pass).length,
  };
}
/** @param {Submission} s @param {Campaign} c */
export function approve(s, c, verified, now = Date.now()) {
  if (s.status !== "pending")
    throw new Error("검수 대기 상태에서만 승인할 수 있습니다.");
  if (!verified) throw new Error("원본 게시물과 수치를 확인해 주세요.");
  if (!evaluate(s, c, now).eligible)
    throw new Error("지급 조건을 모두 충족해야 승인할 수 있습니다.");
  return { ...s, status: "approved", reason: "" };
}
/** @param {Submission} s @param {Campaign} c */
export function payDemo(s, c, now = Date.now()) {
  if (s.status !== "approved")
    throw new Error("집행자가 승인한 참여자만 지급할 수 있습니다.");
  if (!evaluate(s, c, now).eligible)
    throw new Error("지급 조건 또는 집행기간을 다시 확인하세요.");
  return { ...s, status: "paid", paidAmount: c.reward };
}
/** @param {Submission} s */
export function validateSubmission(s) {
  if (!s.name.trim() || !/^[\w.]{1,30}$/.test(s.handle))
    throw new Error("이름과 인스타그램 아이디를 확인하세요.");
  const url = new URL(s.url);
  if (
    url.protocol !== "https:" ||
    !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
    !/^\/(p|reel|reels)\/[^/]+/.test(url.pathname)
  )
    throw new Error("인스타그램 게시물 또는 릴스 URL을 입력하세요.");
  if (!Number.isFinite(Date.parse(s.postedAt)) || !s.caption.trim())
    throw new Error("게시 시각과 캡션을 입력하세요.");
  if (
    ![s.likes, s.comments, s.views].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9,
    )
  )
    throw new Error("성과 수치는 0 이상의 정수로 입력하세요.");
  if (!validAddress(s.wallet))
    throw new Error("올바른 수신 지갑 주소를 입력하세요.");
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return (
    "0x" +
    Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
  );
}
/** @param {Campaign} c */
export function rulesHash(c) {
  return hash([
    c.title,
    c.start,
    c.end,
    c.keywords,
    c.likes,
    c.comments,
    c.views,
    c.reward,
  ]);
}
/** @param {Submission} s */
export function evidenceHash(s) {
  return hash([
    s.url,
    s.postedAt,
    s.caption,
    s.likes,
    s.comments,
    s.views,
    s.wallet.toLowerCase(),
  ]);
}

/** @returns {Submission[]} */
export function seedSubmissions() {
  const base = {
    url: "",
    postedAt: "2026-11-05T10:30:00+09:00",
    caption:
      "조금 느리게 시작한 아침.\n좋아하는 잔에 담은 데이브 커피 한 잔이면 충분해요.\n\n#데이브커피 #광고 #모닝루틴",
    likes: 248,
    comments: 24,
    views: 3200,
    status: "pending",
    source: "sample",
  };
  return [
    {
      ...base,
      id: "s1",
      name: "서윤",
      handle: "seoyun.daily",
      wallet: "0x1111111111111111111111111111111111111111",
    },
    {
      ...base,
      id: "s2",
      name: "지우",
      handle: "jiwoo.archive",
      wallet: "0x2222222222222222222222222222222222222222",
      caption: "오늘의 작은 즐거움, 커피 한 잔. #데이브커피 #모닝루틴",
      likes: 182,
      comments: 16,
      views: 2100,
    },
    {
      ...base,
      id: "s3",
      name: "민서",
      handle: "minseo.moment",
      wallet: "0x3333333333333333333333333333333333333333",
      likes: 72,
      comments: 8,
      views: 890,
    },
    {
      ...base,
      id: "s4",
      name: "도현",
      handle: "dohyun.log",
      wallet: "0x4444444444444444444444444444444444444444",
      postedAt: "2026-10-30T09:00:00+09:00",
      likes: 316,
      comments: 32,
      views: 4800,
    },
    {
      ...base,
      id: "s5",
      name: "하린",
      handle: "harin.notes",
      wallet: "0x5555555555555555555555555555555555555555",
      status: "approved",
      likes: 154,
      comments: 18,
      views: 2300,
    },
  ];
}
