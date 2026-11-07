import { t } from "i18next";
import { AppButton } from "@/components/common/AppButton";
import { Workspace, Participant, checksFor, labels } from "./types";
import { Avatar, Icon, fmt, explorer } from "./ui";
export function ReviewPanel({
  data,
  post,
  verified,
  busy,
  onVerify,
  onAction,
  onModal,
}: {
  data: Workspace;
  post: Participant;
  verified: boolean;
  busy: boolean;
  onVerify: (v: boolean) => void;
  onAction: (action: "approve" | "pay" | "reopen") => void;
  onModal: (modal: "evidence" | "reject" | "pay") => void;
}) {
  const campaign = data.campaign,
    checks = checksFor(post, campaign),
    eligible = Object.values(checks).every(Boolean),
    count = [checks.period, checks.keywords, checks.engagement].filter(
      Boolean,
    ).length;
  const locked = busy || ["approving", "paying"].includes(post.status);
  const rules = [
    {
      title: t("orot.copy103"),
      pass: checks.period,
      detail:
        new Date(post.postedAt).toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
        }) + t("orot.copy104"),
    },
    {
      title: t("orot.copy105"),
      pass: checks.keywords,
      detail: campaign.keywords.join(" · "),
    },
    {
      title: t("orot.copy106"),
      pass: checks.engagement,
      detail: t("orot.copy107", {
        value0: fmt(post.likes),
        value1: fmt(campaign.likes),
        value2: fmt(post.comments),
        value3: fmt(campaign.comments),
        value4: fmt(post.views),
        value5: fmt(campaign.views),
      }),
    },
  ];
  return (
    <div className="review-content">
      <div className="review-title [display:flex] [align-items:center] [justify-content:space-between] [&_h2]:[font-size:var(--text-feed-14)] [&_h2]:[letter-spacing:-0.3px]">
        <h2>{t("orot.copy108")}</h2>
        <span
          className={`badge [display:inline-block] [padding:4px_7px] [border-radius:5px] [font-size:var(--text-feed-9)] [line-height:1.4] [font-weight:600] [background:var(--color-feed-tone-44)] [color:var(--color-feed-tone-45)] [white-space:nowrap] [&.approved]:[background:var(--color-feed-tone-46)] [&.approved]:[color:var(--color-feed-tone-47)] [&.paid]:[background:var(--color-feed-tone-48)] [&.paid]:[color:var(--color-feed-tone-49)] [&.rejected]:[background:var(--color-feed-tone-50)] [&.rejected]:[color:var(--color-feed-tone-51)] [&.failed]:[background:var(--color-feed-tone-50)] [&.failed]:[color:var(--color-feed-tone-51)] [&.approving]:[background:var(--color-feed-tone-52)] [&.approving]:[color:var(--color-feed-tone-53)] [&.paying]:[background:var(--color-feed-tone-52)] [&.paying]:[color:var(--color-feed-tone-53)] ${post.status}`}
        >
          {t(labels[post.status])}
        </span>
      </div>
      <div className="review-person [display:flex] [align-items:center] [gap:7px] [padding:20px_0] [&_>_div]:[flex:1] [&_strong]:[display:block] [&_strong]:[font-size:var(--text-feed-11)] [&_>_div_>_span]:[display:block] [&_>_div_>_span]:[font-size:var(--text-feed-10)] [&_>_div_>_span]:[color:var(--color-feed-tone-16)] [&_>_div_>_span]:[margin-top:2px] [&_.avatar]:[width:31px] [&_.avatar]:[height:31px] [&_.avatar]:[font-size:var(--text-feed-10)]">
        <Avatar post={post} />
        <div>
          <strong>{post.name}</strong>
          <span>@{post.handle}</span>
        </div>
        <button
          className="text-button [display:flex] [gap:3px] [align-items:center] [font-size:var(--text-feed-9)] [color:var(--color-feed-tone-77)] [&_svg]:[width:11px] [&_svg]:[height:11px]"
          onClick={() => onModal("evidence")}
        >
          {t("orot.copy109")}
          <Icon name="external" />
        </button>
      </div>
      <div className="check-heading [display:flex] [align-items:center] [justify-content:space-between] [border-top:1px_solid_var(--color-feed-tone-1)] [padding-top:17px] [font-size:var(--text-feed-11)] [&_span]:[font-size:var(--text-feed-10)] [&_span]:[color:var(--color-feed-tone-78)]">
        <strong>{t("orot.copy110")}</strong>
        <span>
          {count}
          {t("orot.copy111")}
        </span>
      </div>
      {rules.map((c) => (
        <div
          className={`check-line [display:flex] [gap:9px] [align-items:flex-start] [margin-top:17px] [&_>_div]:[flex:1] [&_strong]:[font-size:var(--text-feed-12)] [&_strong]:[font-weight:600] [&_strong]:[display:block] [&_p]:[font-size:var(--text-feed-11)] [&_p]:[line-height:1.8] [&_p]:[color:var(--color-feed-tone-81)] [&_p]:[margin-top:3px] [&_small]:[font-size:var(--text-feed-10)] [&_small]:[color:var(--color-feed-tone-80)] [&.fail_.check-symbol]:[background:var(--color-feed-tone-82)] [&.fail_.check-symbol]:[color:var(--color-feed-tone-83)] [&.fail_small]:[color:var(--color-feed-tone-83)] ${c.pass ? "pass" : "fail"}`}
          key={c.title}
        >
          <span className="check-symbol [width:17px] [height:17px] [border-radius:50%] [background:var(--color-feed-tone-79)] [display:grid] [place-items:center] [flex-shrink:0] [color:var(--color-feed-tone-80)] [font-size:var(--text-feed-10)] [&_svg]:[width:11px] [&_svg]:[height:11px]">
            {c.pass ? <Icon name="check" /> : "!"}
          </span>
          <div>
            <strong>{c.title}</strong>
            <p>{c.detail}</p>
          </div>
          <small>{c.pass ? t("orot.copy112") : t("orot.copy113")}</small>
        </div>
      ))}
      {!checks.active && (
        <p className="error-note [font-size:var(--text-feed-11)] [color:var(--color-feed-tone-100)] [margin:13px_0]">
          {t("orot.copy114")}
        </p>
      )}
      {post.status === "pending" && (
        <label className="verification [display:flex] [gap:9px] [border-top:1px_solid_var(--color-feed-tone-84)] [margin-top:20px] [padding-top:17px] [font-size:var(--text-feed-11)] [color:var(--color-feed-tone-85)] [align-items:flex-start] [cursor:pointer] [&_input]:[width:13px] [&_input]:[height:13px] [&_input]:[accent-color:var(--color-feed-tone-86)] [&_input]:[margin-top:2px] [&_input]:[flex-shrink:0] [&_small]:[display:block] [&_small]:[font-size:var(--text-feed-10)] [&_small]:[color:var(--color-feed-tone-87)] [&_small]:[margin-top:5px]">
          <input
            type="checkbox"
            checked={verified}
            disabled={locked}
            onChange={(e) => onVerify(e.target.checked)}
          />
          <span>
            {t("orot.copy115")}
            <small>{t("orot.copy116")}</small>
          </span>
        </label>
      )}
      {post.status === "rejected" && (
        <div className="decision-note [font-size:var(--text-feed-11)] [padding:12px] [margin-top:16px] [border-radius:7px] [background:var(--color-feed-tone-8)] [&_p]:[font-size:var(--text-feed-10)] [&_p]:[margin-top:4px] [&.paid]:[display:flex] [&.paid]:[gap:9px] [&.paid]:[background:var(--color-feed-tone-96)] [&.paid]:[color:var(--color-feed-tone-97)] [&.paid_svg]:[width:17px] [&.paid_svg]:[height:17px] [&.rejected]:[background:var(--color-feed-tone-98)] [&.rejected]:[color:var(--color-feed-tone-99)] rejected">
          <strong>{t("orot.copy117")}</strong>
          <p>{post.reason}</p>
        </div>
      )}
      {post.status === "paid" && (
        <div className="decision-note [font-size:var(--text-feed-11)] [padding:12px] [margin-top:16px] [border-radius:7px] [background:var(--color-feed-tone-8)] [&_p]:[font-size:var(--text-feed-10)] [&_p]:[margin-top:4px] [&.paid]:[display:flex] [&.paid]:[gap:9px] [&.paid]:[background:var(--color-feed-tone-96)] [&.paid]:[color:var(--color-feed-tone-97)] [&.paid_svg]:[width:17px] [&.paid_svg]:[height:17px] [&.rejected]:[background:var(--color-feed-tone-98)] [&.rejected]:[color:var(--color-feed-tone-99)] paid">
          <Icon name="check" />
          <div>
            <strong>{t("orot.copy118")}</strong>
            <p>{t("orot.copy119")}</p>
          </div>
        </div>
      )}
      {post.status === "failed" && (
        <p className="error-note [font-size:var(--text-feed-11)] [color:var(--color-feed-tone-100)] [margin:13px_0]">
          {post.reason}
        </p>
      )}
      <div className="review-payment [display:flex] [align-items:center] [justify-content:space-between] [margin:22px_0_13px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-34)] [&_strong]:[font-size:var(--text-feed-20)] [&_strong]:[font-weight:650] [&_strong]:[letter-spacing:-0.5px] [&_strong]:[color:var(--color-feed-tone-88)] [&_strong]:[font-variant-numeric:tabular-nums] [&_small]:[font-size:var(--text-feed-9)] [&_small]:[font-weight:400] [&_small]:[color:var(--color-feed-tone-89)] [&_small]:[letter-spacing:0]">
        <span>
          {post.status === "paid" ? t("orot.copy120") : t("orot.copy121")}
        </span>
        <strong>
          {fmt(post.paidAmount ?? campaign.reward)} <small>tOKRW</small>
        </strong>
      </div>
      <div className="review-buttons [display:flex] [gap:7px] [&_>_button]:[display:flex] [&_>_button]:[align-items:center] [&_>_button]:[justify-content:center] [&_>_button]:[gap:7px] [&_>_button]:[min-height:40px] [&_>_button]:[padding:9px_13px] [&_>_button]:[border-radius:6px] [&_>_button]:[font-size:var(--text-feed-11)] [&_>_button]:[flex:1] [&_>_button:first-child:not(:last-child)]:[flex:0_0_65px] [&_svg]:[width:15px] [&_svg]:[height:15px]">
        {post.status === "pending" ? (
          <>
            <AppButton
              size="compact"
              tone="quiet"
              disabled={locked}
              onClick={() => onModal("reject")}
            >
              {t("orot.copy032")}
            </AppButton>
            <AppButton
              size="compact"
              disabled={
                !eligible || !verified || locked || !campaign.contractAddress
              }
              onClick={() => onAction("approve")}
            >
              {busy ? t("orot.copy122") : t("orot.copy123")}
              <Icon name="arrow" />
            </AppButton>
          </>
        ) : post.status === "approved" ? (
          <AppButton
            size="compact"
            disabled={!eligible || locked || !data.chain.connected}
            onClick={() => onModal("pay")}
          >
            {t("orot.copy124")}
            <Icon name="arrow" />
          </AppButton>
        ) : post.status === "rejected" ? (
          <AppButton
            size="compact"
            tone="quiet"
            disabled={locked}
            onClick={() => onAction("reopen")}
          >
            {t("orot.copy125")}
          </AppButton>
        ) : post.status === "approving" || post.status === "paying" ? (
          <AppButton
            size="compact"
            tone="quiet"
            disabled={busy}
            onClick={() =>
              onAction(post.status === "paying" ? "pay" : "approve")
            }
          >
            {t("orot.transaction.retry")}
          </AppButton>
        ) : (
          <AppButton size="compact" tone="quiet" disabled>
            {post.status === "paid"
              ? t("orot.copy077")
              : t(labels[post.status])}
          </AppButton>
        )}
      </div>
      <p className="transaction-note [font-size:var(--text-feed-8)] [color:var(--color-feed-tone-87)] [text-align:center] [margin-top:9px]">
        {t("orot.copy126")}
      </p>
      {(post.approvalTx || post.payoutTx) && (
        <a
          className="receipt-link [display:flex] [align-items:center] [gap:5px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-101)] [margin-top:14px] [justify-content:center] [&_svg]:[width:12px] [&_svg]:[height:12px]"
          href={`${explorer}/tx/${post.payoutTx || post.approvalTx}`}
          target="_blank"
          rel="noreferrer"
        >
          {post.payoutTx ? t("orot.copy031") : t("orot.copy030")}
          {t("orot.copy127")}
          <Icon name="external" />
        </a>
      )}
    </div>
  );
}
