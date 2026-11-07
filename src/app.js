import {
  DEFAULT_CAMPAIGN,
  DEMO_NOW,
  seedSubmissions,
  evaluate,
  approve,
  payDemo,
  validateCampaign,
  validateSubmission,
  evidenceHash,
} from "./domain.js";
import { connect, send, readReview, EXPLORER } from "./wallet.js";

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (value) => new Intl.NumberFormat("ko-KR").format(value);
const short = (address) => address.slice(0, 6) + "…" + address.slice(-4);
const labels = {
  pending: "검수 대기",
  approved: "승인 완료",
  rejected: "반려",
  paid: "지급 완료",
};
const storageKey = "orot-demo-v1";
let campaign = structuredClone(DEFAULT_CAMPAIGN),
  submissions = seedSubmissions(),
  selected = "s1",
  filter = "all",
  search = "",
  verified = false,
  connection = null,
  busy = false;
let toastTimer;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved) {
    validateCampaign(saved.campaign);
    if (
      Array.isArray(saved.submissions) &&
      saved.submissions.every(
        (s) =>
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.handle === "string" &&
          typeof s.caption === "string" &&
          typeof s.wallet === "string" &&
          s.status in labels &&
          Number.isFinite(Date.parse(s.postedAt)) &&
          [s.likes, s.comments, s.views].every(Number.isSafeInteger) &&
          (!s.url ||
            /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels)\//.test(s.url)),
      )
    ) {
      campaign = saved.campaign;
      submissions = saved.submissions;
      selected = submissions[0]?.id;
    }
  }
} catch {
  /* A stale or damaged demo snapshot must not stop the app. */
}
function persist() {
  if (connection) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ campaign, submissions }));
  } catch {
    toast(
      "이 브라우저에서는 저장할 수 없습니다. 새로고침하면 변경 사항이 사라집니다.",
    );
  }
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 5500);
}
const now = () => (connection ? Date.now() : DEMO_NOW);
const current = () => submissions.find((s) => s.id === selected);
const badge = (s) =>
  `<span class="badge ${s.status}">${labels[s.status]}</span>`;
function updateSubmission(next) {
  submissions = submissions.map((s) => (s.id === next.id ? next : s));
  persist();
  render();
}
function render() {
  $("#campaign-title").textContent = campaign.title;
  $("#summary-period").textContent =
    `${campaign.start.replaceAll("-", ".")} — ${campaign.end.slice(5).replace("-", ".")}`;
  $("#summary-keywords").innerHTML = campaign.keywords
    .map((k) => `<span class="keyword-chip">${escape(k)}</span>`)
    .join("");
  $("#summary-engagement").innerHTML =
    `<span class="metric-summary">좋아요 ${fmt(campaign.likes)} · 댓글 ${fmt(campaign.comments)}<br>조회수 ${fmt(campaign.views)} 이상</span>`;
  $("#summary-reward").textContent = fmt(campaign.reward);
  $("#total-count").textContent = submissions.length;
  $("#filters").innerHTML = [
    ["all", "전체"],
    ["pending", "대기"],
    ["approved", "승인"],
    ["paid", "지급"],
    ["rejected", "반려"],
  ]
    .map(
      ([key, label]) =>
        `<button data-filter="${key}" class="${filter === key ? "active" : ""}" aria-pressed="${filter === key}">${label}<span>${key === "all" ? submissions.length : submissions.filter((s) => s.status === key).length}</span></button>`,
    )
    .join("");
  const visible = submissions.filter(
    (s) =>
      (filter === "all" || s.status === filter) &&
      `${s.name} ${s.handle}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (!visible.some((s) => s.id === selected)) {
    selected = visible[0]?.id;
    verified = false;
  }
  $("#participants").innerHTML = visible.length
    ? visible
        .map((s) => {
          const result = evaluate(s, campaign, now()),
            i = submissions.indexOf(s);
          return `<button class="participant ${s.id === selected ? "selected" : ""}" data-select="${escape(s.id)}" aria-pressed="${s.id === selected}" aria-label="${escape(s.name)} ${labels[s.status]} 조건 ${result.count}/3"><span class="person"><span class="avatar a${i % 5}">${escape(s.name.slice(0, 1))}</span><span><strong>${escape(s.name)}</strong><small>@${escape(s.handle)}</small></span></span><span class="condition-count ${result.count === 3 ? "pass" : ""}"><span class="condition-dots">${result.checks.map((c) => `<i class="${c.pass ? "on" : ""}"></i>`).join("")}</span>${result.count} / 3</span>${badge(s)}</button>`;
        })
        .join("")
    : '<div class="empty-state"><strong>표시할 참여자가 없습니다</strong><p>검색어나 상태 필터를 변경하거나 새 증빙을 등록하세요.</p></div>';
  renderDetail();
}
function renderDetail() {
  const s = current();
  if (!s) {
    $("#detail").innerHTML =
      '<div class="empty-detail">참여자를 선택하면 증빙과 지급 기준을 확인할 수 있습니다.</div>';
    return;
  }
  const result = evaluate(s, campaign, now());
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(s.postedAt));
  const checkNames = [
    "집행기간 내 게시",
    "필수 키워드 포함",
    "인게이지 기준 달성",
  ];
  const descriptions = [
    `${date} 게시 · ${campaign.start.slice(5).replace("-", ".")}–${campaign.end.slice(5).replace("-", ".")} 기준`,
    result.keywords
      .map(
        (k) =>
          `<span class="${k.pass ? "" : "missing"}">${escape(k.word)} ${k.pass ? "✓" : "누락"}</span>`,
      )
      .join(" &nbsp; "),
    result.metrics
      .map(
        (m) =>
          `${{ likes: "좋아요", comments: "댓글", views: "조회수" }[m.key]} ${fmt(m.actual)} / ${fmt(m.minimum)}${m.pass ? "" : " 미달"}`,
      )
      .join(" · "),
  ];
  $("#detail").innerHTML =
    `<div class="detail-header"><div class="person"><span class="avatar a${submissions.indexOf(s) % 5}">${escape(s.name.slice(0, 1))}</span><span><strong>${escape(s.name)}</strong><small>@${escape(s.handle)}</small></span></div>${badge(s)}</div>
    <div class="detail-kicker"><span>제출한 콘텐츠</span><span>${s.source === "sample" ? "데모용 예시 게시물" : "집행자 확인 대상"}</span></div>
    <div class="post-preview">${s.source === "sample" ? '<div class="coffee-art" aria-label="데모 커피 일러스트"><div class="coffee-cup"></div></div>' : ""}<p class="caption">${escape(s.caption)}</p></div>
    <div class="post-link">${s.url ? `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">원본 게시물 확인 ↗</a>` : "<span>실제 인스타그램 게시물이 아닌 예시입니다</span>"}</div>
    <div class="metric-row"><div><small>좋아요</small><strong>${fmt(s.likes)}</strong></div><div><small>댓글</small><strong>${fmt(s.comments)}</strong></div><div><small>조회수</small><strong>${fmt(s.views)}</strong></div></div>
    <div class="checks"><div class="checks-head"><h3>지급 조건 확인</h3><span>${result.count} / 3 충족</span></div>${result.checks.map((c, i) => `<div class="check-row ${c.pass ? "" : "failed"}"><span class="check-icon">${c.pass ? "✓" : "!"}</span><div class="check-copy"><div class="check-title"><span>${checkNames[i]}</span><span>${c.pass ? "충족" : "미충족"}</span></div><p>${descriptions[i]}</p></div></div>`).join("")}${!result.active ? '<p class="blocking-note">현재 집행기간이 아닙니다. 승인·지급할 수 없습니다.</p>' : ""}</div>
    <div class="review-box">${s.status === "pending" ? `<label class="verify-label"><input type="checkbox" id="verified" ${verified ? "checked" : ""} ${busy ? "disabled" : ""}><span>원본 게시물과 성과 수치를 확인했습니다.</span></label><p class="verification-note">수치는 제출 증빙 기준입니다. 자동으로 진위를 인증하지 않습니다.</p>` : s.status === "approved" ? '<div class="status-note">집행자 검수 완료 · 지급할 준비가 됐습니다.</div>' : s.status === "rejected" ? `<div class="status-note rejected"><strong>반려 사유</strong><br>${escape(s.reason || "기준 미충족")}</div>` : `<div class="status-note paid"><strong>${connection ? "지급 거래가 확인됐습니다." : "데모 지급이 완료됐습니다."}</strong><br>${connection ? "마루 테스트넷 영수증을 확인할 수 있습니다." : "실제 자금 이동이나 거래 해시는 생성되지 않았습니다."}</div>`}${s.txHash ? `<a class="receipt" href="${EXPLORER}/tx/${escape(s.txHash)}" target="_blank" rel="noopener noreferrer">거래 상태 확인 ↗</a>` : ""}</div>
    <div class="detail-actions"><div class="payment-line"><span>${s.status === "paid" ? "지급한 금액" : "지급 예정액"}</span><strong>${fmt(s.paidAmount ?? campaign.reward)} <small>tOKRW</small></strong></div><div class="action-buttons">${s.status === "pending" ? `<button class="button secondary" id="reject" ${busy ? "disabled" : ""}>반려</button><button class="button primary" id="approve" ${!result.eligible || !verified || busy ? "disabled" : ""}>${busy ? "거래 확인 중…" : "지급 승인"} <span aria-hidden="true">→</span></button>` : s.status === "approved" ? `<button class="button primary" id="pay" ${!result.eligible || busy ? "disabled" : ""}>${busy ? "거래 확인 중…" : connection ? "보상 지급" : "데모 지급 체험"} <span aria-hidden="true">→</span></button>` : s.status === "rejected" ? '<button class="button secondary" id="reopen">검수 다시 열기</button>' : '<button class="button secondary" disabled>지급 완료 ✓</button>'}</div><p class="action-note">${connection ? "서명 후 거래 확정까지 기다려 주세요." : "데모 모드 · 실제 토큰을 전송하지 않습니다."}</p></div>`;
  $("#verified")?.addEventListener("change", (event) => {
    verified = event.target.checked;
    $("#approve").disabled = !result.eligible || !verified || busy;
  });
  $("#reject")?.addEventListener("click", () => {
    $("#reject-form").reset();
    $("#reject-dialog").showModal();
  });
  $("#approve")?.addEventListener("click", handleApprove);
  $("#reopen")?.addEventListener("click", () => {
    verified = false;
    updateSubmission({ ...s, status: "pending", reason: "" });
  });
  $("#pay")?.addEventListener("click", () => {
    $("#pay-summary").innerHTML =
      `<div class="pay-detail"><span>받는 사람</span><strong>${escape(s.name)}</strong></div><div class="pay-detail"><span>받는 지갑</span><strong>${escape(s.wallet)}</strong></div><div class="pay-detail"><span>지급액</span><strong>${fmt(campaign.reward)} tOKRW</strong></div><p class="field-note">${connection ? "연결된 지갑에서 거래 내용을 확인하고 서명합니다." : "데모 체험입니다. 실제 자금은 전송되지 않습니다."}</p>`;
    $("#confirm-pay").textContent = connection
      ? "서명하고 지급"
      : "데모 지급 완료하기";
    $("#pay-dialog").showModal();
  });
}
async function handleApprove() {
  const s = current();
  try {
    const next = approve(s, campaign, verified, now());
    if (!connection) {
      verified = false;
      updateSubmission(next);
      toast("검수를 승인했습니다. 보상을 지급할 수 있습니다.");
      return;
    }
    busy = true;
    renderDetail();
    const receipt = await send(connection, campaign, s, "approve", (txHash) =>
      updateSubmission({ ...s, txHash }),
    );
    updateSubmission({ ...next, ...receipt });
    verified = false;
    toast("마루 테스트넷에서 승인이 확인됐습니다.");
  } catch (error) {
    toast(error.message || "승인에 실패했습니다. 지갑을 확인하세요.");
  } finally {
    busy = false;
    renderDetail();
  }
}
$("#pay-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#pay-dialog").close();
  const s = current();
  try {
    const next = payDemo(s, campaign, now());
    if (!connection) {
      updateSubmission(next);
      toast("데모 지급 완료 · 실제 자금 이동은 없습니다.");
      return;
    }
    busy = true;
    renderDetail();
    const receipt = await send(connection, campaign, s, "pay", (txHash) =>
      updateSubmission({ ...s, txHash }),
    );
    updateSubmission({ ...next, ...receipt });
    toast("마루 테스트넷 지급이 완료됐습니다.");
  } catch (error) {
    toast(error.message || "지급에 실패했습니다. 거래 상태를 확인하세요.");
  } finally {
    busy = false;
    renderDetail();
  }
});
$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (button && !busy) {
    filter = button.dataset.filter;
    verified = false;
    render();
  }
});
$("#participants").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select]");
  if (button && !busy) {
    selected = button.dataset.select;
    verified = false;
    render();
    if (matchMedia("(max-width:800px)").matches)
      $("#detail").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }
});
$("#search").addEventListener("input", (event) => {
  if (!busy) {
    search = event.target.value;
    render();
  }
});
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => button.closest("dialog").close());
function openRules() {
  if (connection) {
    toast(
      "실제 모드의 기준은 배포된 컨트랙트에 고정됩니다. 데모로 돌아가려면 새로고침하세요.",
    );
    return;
  }
  const form = $("#rules-form");
  for (const key of Object.keys(campaign))
    if (form.elements.namedItem(key))
      form.elements.namedItem(key).value =
        key === "keywords" ? campaign.keywords.join(", ") : campaign[key];
  $("#rules-error").textContent = "";
  $("#rules-dialog").showModal();
}
$("#rules-nav").addEventListener("click", openRules);
$("#edit-rules").addEventListener("click", openRules);
$("#review-nav").addEventListener("click", () => {
  $(".workspace").scrollIntoView({ block: "start" });
});
$("#rules-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    const next = {
      title: data.title.trim(),
      start: data.start,
      end: data.end,
      keywords: [
        ...new Set(
          data.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        ),
      ],
      likes: Number(data.likes),
      comments: Number(data.comments),
      views: Number(data.views),
      reward: Number(data.reward),
    };
    validateCampaign(next);
    campaign = next;
    submissions = submissions.map((s) =>
      s.status === "paid" ? s : { ...s, status: "pending", reason: "" },
    );
    verified = false;
    persist();
    render();
    $("#rules-dialog").close();
    toast("기준을 저장했습니다. 미지급 참여자는 다시 검수해 주세요.");
  } catch (error) {
    $("#rules-error").textContent = error.message;
  }
});
$("#reject-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const reason = new FormData(event.target).get("reason").trim();
  if (!reason) return;
  updateSubmission({ ...current(), status: "rejected", reason });
  verified = false;
  $("#reject-dialog").close();
  toast("반려 사유를 저장했습니다.");
});
$("#add-submission").addEventListener("click", () => {
  if (busy) return;
  $("#submission-form").reset();
  $("#submission-error").textContent = "";
  $("#submission-dialog").showModal();
});
$("#submission-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector('button[type="submit"], .primary');
  submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(event.target));
    const s = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      handle: data.handle.trim(),
      url: data.url.trim(),
      postedAt: data.postedAt + ":00+09:00",
      caption: data.caption.trim(),
      likes: Number(data.likes),
      comments: Number(data.comments),
      views: Number(data.views),
      wallet: data.wallet.trim(),
      status: "pending",
      source: "manual",
    };
    validateSubmission(s);
    if (
      submissions.some(
        (existing) => existing.wallet.toLowerCase() === s.wallet.toLowerCase(),
      )
    )
      throw new Error(
        "이미 등록된 지갑입니다. 한 캠페인에서는 지갑당 한 번만 지급합니다.",
      );
    if (connection) {
      const review = await readReview(connection, s.wallet);
      if (review.approved) {
        if (review.evidenceHash !== (await evidenceHash(s)))
          throw new Error(
            "기존 온체인 승인 증빙과 입력 내용이 다릅니다. 원래 증빙을 입력하세요.",
          );
        s.status = review.paid ? "paid" : "approved";
      }
    }
    submissions.push(s);
    selected = s.id;
    filter = "all";
    search = "";
    $("#search").value = "";
    verified = false;
    persist();
    render();
    $("#submission-dialog").close();
    toast("증빙을 등록했습니다. 원본을 확인하고 검수해 주세요.");
  } catch (error) {
    $("#submission-error").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
$("#wallet-button").addEventListener("click", () => {
  if (busy) return;
  $("#wallet-error").textContent = "";
  $("#wallet-dialog").showModal();
});
$("#wallet-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector(".primary");
  button.disabled = true;
  try {
    const address = new FormData(event.target).get("contract").trim();
    connection = await connect(window.ethereum, address, campaign);
    submissions = [];
    selected = undefined;
    filter = "all";
    search = "";
    $("#search").value = "";
    verified = false;
    $("#wallet-label").textContent = short(connection.account);
    $(".demo-strip").innerHTML =
      "<span><b>마루 테스트넷 연결됨</b> 실제 거래 · 직접 등록한 증빙만 사용합니다</span>";
    window.ethereum?.on?.("accountsChanged", () => {
      if (connection) {
        location.reload();
      }
    });
    window.ethereum?.on?.("chainChanged", () => {
      if (connection) {
        location.reload();
      }
    });
    $("#wallet-dialog").close();
    render();
    toast("집행자와 캠페인 설정을 검증했습니다. 증빙을 등록하세요.");
  } catch (error) {
    $("#wallet-error").textContent = error.message || "연결에 실패했습니다.";
  } finally {
    button.disabled = false;
  }
});
$("#reset-demo").addEventListener("click", () => {
  if (!busy) $("#reset-dialog").showModal();
});
$("#reset-form").addEventListener("submit", (event) => {
  event.preventDefault();
  campaign = structuredClone(DEFAULT_CAMPAIGN);
  submissions = seedSubmissions();
  selected = "s1";
  filter = "all";
  search = "";
  $("#search").value = "";
  verified = false;
  persist();
  render();
  $("#reset-dialog").close();
  toast("데모를 처음 상태로 되돌렸습니다.");
});
setInterval(() => {
  if (connection && !busy) renderDetail();
}, 30000);
render();
