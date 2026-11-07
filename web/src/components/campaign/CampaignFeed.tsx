"use client";
import { t } from "i18next";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useAffiliateSession,
  useAffiliateWorkspace,
  useAffiliateAction,
} from "@/query/affiliate-custom";
import { AppButton } from "@/components/common/AppButton";
import { checksFor, labels } from "./types";
import { Icon, Avatar, fmt, short, explorer } from "./ui";
import { ReviewPanel } from "./ReviewPanel";
type Modal = "wallets" | "rules" | "reject" | "pay" | "evidence" | null;
export function CampaignFeed() {
  const actionMutation = useAffiliateAction();
  const [selected, setSelected] = useState("maroo-s1"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [verified, setVerified] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Modal>(null),
    [reason, setReason] = useState(""),
    [mobileReview, setMobileReview] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    reviewDialog = useRef<HTMLDialogElement>(null);
  const session = useAffiliateSession();
  const ready = session.isSuccess,
    loginError = session.error ? t("orot.copy002") : "";
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    else if (!modal) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (mobileReview && !reviewDialog.current?.open)
      reviewDialog.current?.showModal();
    else if (!mobileReview) reviewDialog.current?.close();
  }, [mobileReview]);
  const { data, error, isFetching, refetch } = useAffiliateWorkspace(ready);
  const campaign = data?.campaign;
  const visible =
    data?.participants.filter(
      (p) =>
        (filter === "all" || p.status === filter) &&
        (p.name + " " + p.handle).toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const post = visible.find((p) => p.id === selected) ?? visible[0];
  function selectPost(id: string) {
    if (busy) return;
    setSelected(id);
    setVerified(false);
    if (matchMedia("(max-width:1050px)").matches) setMobileReview(true);
  }
  async function act(action: "approve" | "pay" | "reject" | "reopen") {
    if (!post || busy) return;
    if (action === "reject" && !reason.trim()) {
      setNotice(t("orot.copy003"));
      return;
    }
    setBusy(true);
    setModal(null);
    try {
      await actionMutation.mutateAsync({
        id: post.id,
        action,
        verified: verified || post.status === "approving",
        reason,
      });
      setVerified(false);
      setReason("");
      setNotice(
        {
          approve: t("orot.copy004"),
          pay: t("orot.copy005"),
          reject: t("orot.copy006"),
          reopen: t("orot.copy007"),
        }[action],
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("orot.copy008"));
      await refetch();
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t("orot.copy009"));
    } catch {
      setNotice(t("orot.copy010"));
    }
  }
  const review =
    data && post ? (
      <ReviewPanel
        data={data}
        post={post}
        verified={verified}
        busy={busy}
        onVerify={setVerified}
        onAction={(action) => void act(action)}
        onModal={setModal}
      />
    ) : null;
  return (
    <div className="orot-app">
      <a
        className="skip-link [position:fixed] [top:-60px] [left:20px] [padding:12px] [background:white] [z-index:10] [&:focus]:[top:8px]"
        href="#feed"
      >
        {t("orot.copy011")}
      </a>
      <aside className="app-nav [position:fixed] [inset:0_auto_0_0] [width:220px] [padding:38px_24px_25px] [border-right:1px_solid_var(--color-feed-tone-1)] [display:flex] [flex-direction:column] [background:var(--color-feed-tone-2)] [z-index:3] [&_nav]:[margin-top:51px] [&_nav]:[display:grid] [&_nav]:[gap:10px] [&_nav_button]:[display:flex] [&_nav_button]:[align-items:center] [&_nav_button]:[gap:15px] [&_nav_button]:[text-align:left] [&_nav_button]:[padding:15px_13px] [&_nav_button]:[border-radius:9px] [&_nav_button]:[font-size:var(--text-feed-14)] [&_nav_button]:[color:var(--color-feed-tone-5)] [&_nav_button]:[transition:background_0.15s] [&_nav_button:hover]:[background:var(--color-feed-tone-6)] [&_nav_.nav-active]:[font-weight:700] [&_nav_.nav-active]:[color:var(--color-feed-tone-7)] [&_nav_.nav-active]:[background:var(--color-feed-tone-8)] [&_nav_button_svg]:[width:23px] [&_nav_button_svg]:[height:23px] max-[1250px]:[width:180px] max-[1250px]:[padding-left:18px] max-[1250px]:[padding-right:18px] max-[1050px]:[width:85px] max-[1050px]:[padding:28px_14px] max-[1050px]:[&_nav_button_span]:[display:none] max-[1050px]:[&_nav]:[margin-top:40px] max-[1050px]:[&_nav]:[gap:17px] max-[1050px]:[&_nav_button]:[justify-content:center] max-[1050px]:[&_nav_button]:[padding:14px] max-[600px]:[inset:0_0_auto] max-[600px]:[width:100%] max-[600px]:[height:63px] max-[600px]:[padding:0_18px] max-[600px]:[flex-direction:row] max-[600px]:[align-items:center] max-[600px]:[border-right:0] max-[600px]:[border-bottom:1px_solid_var(--color-feed-tone-113)] max-[600px]:[&_nav]:[margin:0_0_0_auto] max-[600px]:[&_nav]:[display:flex] max-[600px]:[&_nav]:[gap:5px] max-[600px]:[&_nav_button]:[padding:10px] max-[600px]:[&_nav_button]:[background:none] max-[600px]:[&_nav_button_svg]:[width:21px] max-[600px]:[&_nav_button_svg]:[height:21px]">
        <Link
          className="wordmark mb-2 flex items-center gap-2 whitespace-nowrap text-title font-bold tracking-tight text-ink max-[1050px]:justify-center max-[600px]:mb-0"
          aria-label={t("brand.home")}
          href="/"
        >
          <Image src="/icon.svg" alt="" width={32} height={32} unoptimized />
          <span className="min-[601px]:max-[1050px]:hidden">Inchain</span>
        </Link>
        <p className="nav-caption [font-size:var(--text-feed-10)] [letter-spacing:0.3px] [color:var(--color-feed-tone-4)] [margin-left:13px] max-[1050px]:[display:none]">
          {t("orot.copy012")}
        </p>
        <nav aria-label={t("orot.copy013")}>
          <button
            aria-label={t("orot.copy014")}
            className="nav-active"
            onClick={() => {
              setFilter("all");
              document
                .querySelector("#feed")
                ?.scrollIntoView({ block: "start" });
            }}
          >
            <Icon name="home" />
            <span>{t("orot.copy014")}</span>
          </button>
          <button
            aria-label={t("orot.copy015")}
            onClick={() => setModal("rules")}
          >
            <Icon name="settings" />
            <span>{t("orot.copy015")}</span>
          </button>
          <button
            aria-label={t("orot.copy016")}
            onClick={() => setModal("wallets")}
          >
            <Icon name="wallet" />
            <span>{t("orot.copy016")}</span>
          </button>
        </nav>
        <div className="nav-bottom [margin-top:auto] max-[1050px]:[display:none]">
          <div className="maroo-label [display:flex] [align-items:center] [gap:8px] [font-size:var(--text-feed-11)] [color:var(--color-feed-tone-9)] [margin:0_12px_26px] [&_span]:[width:6px] [&_span]:[height:6px] [&_span]:[display:inline-block] [&_span]:[border-radius:50%] [&_span]:[background:var(--color-feed-tone-10)]">
            <span />
            Maroo Testnet
          </div>
          <div className="operator-profile [display:flex] [gap:11px] [padding:19px_9px_0] [border-top:1px_solid_var(--color-feed-tone-1)] [align-items:center] [&_strong]:[font-size:var(--text-feed-12)] [&_strong]:[display:block] [&_small]:[font-size:var(--text-feed-10)] [&_small]:[color:var(--color-feed-tone-13)] [&_small]:[display:block] [&_small]:[margin-top:2px]">
            <Image
              src="/images/maroo/logo.png"
              alt="Maroo"
              width={36}
              height={36}
              className="shrink-0"
              unoptimized
            />
            <div>
              <strong>{t("orot.copy017")}</strong>
              <small>{t("orot.copy018")}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="app-main [margin-left:220px] [max-width:1350px] [padding:40px_55px_30px] min-[1600px]:[margin-left:max(220px,_calc((100vw_-_1050px)_/_2))] min-[1600px]:[padding-left:50px] min-[1600px]:[padding-right:50px] min-[1600px]:[max-width:1100px] max-[1250px]:[margin-left:180px] max-[1250px]:[padding:30px_34px] max-[1050px]:[margin-left:85px] max-[1050px]:[max-width:760px] max-[1050px]:[padding:30px_45px] max-[600px]:[margin:63px_0_0] max-[600px]:[padding:24px_0_25px]">
        <header className="page-heading [display:flex] [align-items:center] [justify-content:space-between] [gap:20px] [padding-bottom:29px] [&_>_div_>_p:last-child]:[font-size:var(--text-feed-12)] [&_>_div_>_p:last-child]:[color:var(--color-feed-tone-15)] [&_>_div_>_p:last-child]:[margin-top:7px] max-[600px]:[padding:0_18px_19px] max-[600px]:[&_>_div_>_p:last-child]:[font-size:var(--text-feed-11)]">
          <div>
            <p className="eyebrow [font-size:var(--text-feed-9)] [letter-spacing:1.9px] [color:var(--color-feed-tone-14)] [font-weight:600] [margin-bottom:10px] max-[600px]:[font-size:var(--text-feed-8)] max-[600px]:[margin-bottom:7px]">
              INSTAGRAM CAMPAIGN
            </p>
            <h1>{campaign?.title || t("orot.copy019")}</h1>
            <p>{t("orot.copy020")}</p>
          </div>
          <span className="environment-label [&_i]:[width:6px] [&_i]:[height:6px] [&_i]:[display:inline-block] [&_i]:[border-radius:50%] [&_i]:[background:var(--color-feed-tone-10)] [display:flex] [align-items:center] [gap:6px] [font-size:var(--text-feed-9)] [color:var(--color-feed-tone-16)] [white-space:nowrap] max-[1250px]:[display:none]">
            <i />
            {t("orot.copy021")}
          </span>
        </header>
        {(loginError || error) && (
          <div
            className="server-error [border:1px_solid_var(--color-feed-tone-119)] [border-radius:8px] [padding:17px] [color:var(--color-feed-tone-120)] [font-size:var(--text-feed-12)] [display:flex] [gap:12px] [justify-content:space-between] [&_button]:[font-weight:600] max-[600px]:[margin:0_16px]"
            role="alert"
          >
            <span>
              {loginError ||
                (error instanceof Error ? error.message : t("orot.copy022"))}
            </span>
            <button
              onClick={() => (ready ? void refetch() : void session.refetch())}
            >
              {t("orot.copy023")}
            </button>
          </div>
        )}
        {!data && !loginError && !error && (
          <div className="loading-state [padding:65px_20px] [text-align:center] [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-121)]">
            {t("orot.copy024")}
          </div>
        )}
        {data && campaign && (
          <div className="feed-layout [display:grid] [grid-template-columns:minmax(0,_530px)_minmax(285px,_320px)] [gap:52px] [align-items:start] max-[1250px]:[gap:30px] max-[1250px]:[grid-template-columns:minmax(0,_1fr)_290px] max-[1050px]:[grid-template-columns:1fr]">
            <section
              id="feed"
              className="feed-column [min-width:0] [scroll-margin-top:20px] max-[1050px]:[width:100%] max-[1050px]:[max-width:600px]"
              aria-label={t("orot.copy025")}
            >
              <div className="creator-stories [display:flex] [gap:24px] [padding:6px_4px_23px] max-[1250px]:[gap:20px] max-[1050px]:[justify-content:flex-start] max-[1050px]:[gap:26px] max-[600px]:[gap:24px] max-[600px]:[padding:7px_18px_20px] max-[600px]:[overflow:auto]">
                {data.participants.map((p) => (
                  <button
                    key={p.id}
                    className={
                      selected === p.id
                        ? "story [display:flex] [flex-direction:column] [align-items:center] [gap:7px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-17)] [&.selected]:[color:var(--color-feed-tone-31)] [&.selected]:[font-weight:700] [&.selected_.ring]:[box-shadow:0_0_0_3px_white,_0_0_0_4px_var(--color-feed-tone-32)] selected"
                        : "story [display:flex] [flex-direction:column] [align-items:center] [gap:7px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-17)] [&.selected]:[color:var(--color-feed-tone-31)] [&.selected]:[font-weight:700] [&.selected_.ring]:[box-shadow:0_0_0_3px_white,_0_0_0_4px_var(--color-feed-tone-32)]"
                    }
                    onClick={() => {
                      if (busy) return;
                      setSelected(p.id);
                      setVerified(false);
                      setFilter("all");
                      setSearch("");
                      requestAnimationFrame(() =>
                        document
                          .getElementById(`post-${p.id}`)
                          ?.scrollIntoView({
                            behavior: matchMedia(
                              "(prefers-reduced-motion:reduce)",
                            ).matches
                              ? "instant"
                              : "smooth",
                            block: "center",
                          }),
                      );
                    }}
                    aria-label={t("orot.copy026", { value0: p.name })}
                  >
                    <Avatar post={p} ring />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="feed-controls [margin-bottom:12px] max-[600px]:[padding:0_16px]">
                <div
                  className='feed-tabs [display:flex] [justify-content:space-between] [border-bottom:1px_solid_var(--color-feed-tone-33)] [gap:8px] [&_button]:[font-size:var(--text-feed-12)] [&_button]:[color:var(--color-feed-tone-34)] [&_button]:[padding:12px_4px] [&_button]:[position:relative] [&_button]:[white-space:nowrap] [&_button_small]:[font-size:var(--text-feed-10)] [&_button_small]:[margin-left:5px] [&_button_small]:[color:var(--color-feed-tone-35)] [&_button.active]:[color:var(--color-feed-tone-36)] [&_button.active]:[font-weight:700] [&_button.active:after]:[content:""] [&_button.active:after]:[height:2px] [&_button.active:after]:[background:var(--color-feed-tone-37)] [&_button.active:after]:[position:absolute] [&_button.active:after]:[bottom:-1px] [&_button.active:after]:[left:0] [&_button.active:after]:[right:0] max-[600px]:[&_button]:[font-size:var(--text-feed-11)] max-[600px]:[&_button_small]:[font-size:var(--text-feed-9)]'
                  role="group"
                  aria-label={t("orot.copy027")}
                >
                  {[
                    ["all", t("orot.copy028")],
                    ["pending", t("orot.copy029")],
                    ["approved", t("orot.copy030")],
                    ["paid", t("orot.copy031")],
                    ["rejected", t("orot.copy032")],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className={filter === key ? "active" : ""}
                      aria-pressed={filter === key}
                      onClick={() => {
                        if (!busy) {
                          setFilter(key!);
                          setVerified(false);
                        }
                      }}
                    >
                      {label}
                      <small>
                        {key === "all"
                          ? data.participants.length
                          : data.participants.filter((p) => p.status === key)
                              .length}
                      </small>
                    </button>
                  ))}
                </div>
                <label className="feed-search [display:flex] [align-items:center] [gap:9px] [padding:10px_12px] [margin-top:14px] [background:var(--color-feed-tone-38)] [border:1px_solid_var(--color-feed-tone-39)] [border-radius:7px] [color:var(--color-feed-tone-40)] [&_svg]:[width:15px] [&_svg]:[height:15px] [&_input]:[min-width:0] [&_input]:[width:100%] [&_input]:[outline:none] [&_input]:[background:transparent] [&_input]:[border:0] [&_input]:[font-size:var(--text-feed-11)] [&_input]:[color:var(--color-feed-tone-41)] max-[600px]:[margin-top:11px]">
                  <Icon name="search" />
                  <input
                    value={search}
                    onChange={(e) => {
                      if (!busy) {
                        setSearch(e.target.value);
                        setVerified(false);
                      }
                    }}
                    placeholder={t("orot.copy033")}
                    aria-label={t("orot.copy033")}
                  />
                </label>
              </div>
              {visible.length === 0 && (
                <div className="empty-feed [padding:65px_20px] [text-align:center] [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-121)] [&_h2]:[font-size:var(--text-feed-15)] [&_h2]:[margin-bottom:8px] [&_h2]:[color:var(--color-feed-tone-122)] [&_button]:[color:var(--color-feed-tone-123)] [&_button]:[margin-top:17px] [&_button]:[font-size:var(--text-feed-12)]">
                  <h2>{t("orot.copy034")}</h2>
                  <p>{t("orot.copy035")}</p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    {t("orot.copy036")}
                  </button>
                </div>
              )}
              {visible.map((p, i) => {
                const checks = checksFor(p, campaign),
                  count = [
                    checks.period,
                    checks.keywords,
                    checks.engagement,
                  ].filter(Boolean).length;
                return (
                  <article
                    className={`feed-post [padding-top:4px] [margin-bottom:26px] [scroll-margin-top:24px] [border-bottom:1px_solid_var(--color-feed-tone-42)] max-[600px]:[margin-bottom:12px] ${selected === p.id ? "selected-post [&_.post-review-strip_button]:[color:var(--color-feed-tone-65)]" : ""}`}
                    id={`post-${p.id}`}
                    key={p.id}
                  >
                    <header className="post-heading [display:flex] [align-items:center] [gap:8px] [padding:12px_0] max-[600px]:[padding:12px_14px]">
                      <Avatar post={p} />
                      <div className="post-identity [flex:1] [min-width:0] [&_strong]:[display:flex] [&_strong]:[align-items:center] [&_strong]:[gap:5px] [&_strong]:[font-family:Arial,_sans-serif] [&_strong]:[font-size:var(--text-feed-12)] [&_strong]:[font-weight:600] [&_>_span]:[display:block] [&_>_span]:[font-size:var(--text-feed-10)] [&_>_span]:[color:var(--color-feed-tone-15)] [&_>_span]:[margin-top:2px]">
                        <strong>
                          {p.handle}
                          <span
                            className="creator-verified [display:inline-grid] [place-items:center] [width:12px] [height:12px] [background:var(--color-feed-tone-43)] [color:white] [border-radius:50%] [font-size:var(--text-feed-8)]"
                            aria-label={t("orot.copy037")}
                          >
                            ✓
                          </span>
                        </strong>
                        <span>
                          {p.name}
                          {t("orot.copy038")}
                        </span>
                      </div>
                      <span
                        className={`badge [display:inline-block] [padding:4px_7px] [border-radius:5px] [font-size:var(--text-feed-9)] [line-height:1.4] [font-weight:600] [background:var(--color-feed-tone-44)] [color:var(--color-feed-tone-45)] [white-space:nowrap] [&.approved]:[background:var(--color-feed-tone-46)] [&.approved]:[color:var(--color-feed-tone-47)] [&.paid]:[background:var(--color-feed-tone-48)] [&.paid]:[color:var(--color-feed-tone-49)] [&.rejected]:[background:var(--color-feed-tone-50)] [&.rejected]:[color:var(--color-feed-tone-51)] [&.failed]:[background:var(--color-feed-tone-50)] [&.failed]:[color:var(--color-feed-tone-51)] [&.approving]:[background:var(--color-feed-tone-52)] [&.approving]:[color:var(--color-feed-tone-53)] [&.paying]:[background:var(--color-feed-tone-52)] [&.paying]:[color:var(--color-feed-tone-53)] ${p.status}`}
                      >
                        {t(labels[p.status])}
                      </span>
                    </header>
                    <button
                      className="post-image-button [position:relative] [display:block] [width:100%] [padding:0] [border:0] [border-radius:5px] [overflow:hidden] [background:var(--color-feed-tone-54)] [cursor:pointer] [aspect-ratio:1] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover] [&_img]:[display:block] [&_img]:[transition:filter_0.2s] [&:hover_img]:[filter:brightness(0.97)] max-[600px]:[border-radius:0]"
                      onClick={() => selectPost(p.id)}
                      aria-label={t("orot.copy039", { value0: p.name })}
                    >
                      <Image
                        src={`/images/maroo/${p.id}-feed.jpg`}
                        alt={t("orot.copy040", { value0: p.name })}
                        width={1254}
                        height={1254}
                        priority={i === 0}
                        loading={i === 0 ? "eager" : "lazy"}
                        unoptimized
                      />
                      <span className="photo-label [position:absolute] [bottom:13px] [right:13px] [color:var(--color-feed-tone-55)] [font-size:var(--text-feed-8)] [letter-spacing:1.7px] [text-shadow:0_1px_5px_var(--color-feed-tone-56)] max-[600px]:[font-size:var(--text-feed-7)]">
                        DEMO CONTENT
                      </span>
                    </button>
                    <div className="post-social [display:flex] [align-items:center] [justify-content:space-between] [padding:16px_0_12px] [&_>_div]:[display:flex] [&_>_div]:[gap:20px] [&_span]:[display:flex] [&_span]:[align-items:center] [&_span]:[gap:6px] [&_span]:[font-size:var(--text-feed-11)] [&_span]:[color:var(--color-feed-tone-57)] [&_span]:[font-variant-numeric:tabular-nums] [&_svg]:[width:22px] [&_svg]:[height:22px] [&_svg]:[color:var(--color-feed-tone-58)] [&_>_button]:[padding:4px] [&_>_button]:[color:var(--color-feed-tone-59)] [&_>_button_svg]:[width:18px] [&_>_button_svg]:[height:18px] max-[600px]:[margin-left:16px] max-[600px]:[margin-right:16px] max-[600px]:[padding-top:14px] max-[600px]:[&_span]:[font-size:var(--text-feed-11)] max-[600px]:[&_>_div]:[gap:22px]">
                      <div>
                        <span title={t("orot.copy041")}>
                          <Icon name="heart" />
                          {fmt(p.likes)}
                        </span>
                        <span title={t("orot.copy042")}>
                          <Icon name="comment" />
                          {fmt(p.comments)}
                        </span>
                        <span title={t("orot.copy043")}>
                          <Icon name="eye" />
                          {fmt(p.views)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (busy) return;
                          setSelected(p.id);
                          setVerified(false);
                          setModal("evidence");
                        }}
                        aria-label={t("orot.copy044", { value0: p.name })}
                      >
                        <Icon name="external" />
                      </button>
                    </div>
                    <div className="post-caption [font-size:var(--text-feed-13)] [line-height:1.85] [overflow-wrap:anywhere] [&_>_strong]:[font-family:Arial,_sans-serif] [&_>_strong]:[font-size:var(--text-feed-12)] [&_>_p]:[display:inline] [&_>_p]:[white-space:pre-wrap] [&_>_p]:[margin-left:8px] [&_>_p]:[color:var(--color-feed-tone-60)] max-[600px]:[margin-left:16px] max-[600px]:[margin-right:16px] max-[600px]:[font-size:var(--text-feed-13)]">
                      <strong>{p.handle}</strong>
                      <p>{p.caption}</p>
                    </div>
                    <p className="post-date [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-61)] [margin:11px_0_15px] max-[600px]:[margin-left:16px] max-[600px]:[margin-right:16px]">
                      {new Date(p.postedAt).toLocaleDateString("ko-KR", {
                        month: "long",
                        day: "numeric",
                        timeZone: "Asia/Seoul",
                      })}{" "}
                      {t("orot.copy045")}
                    </p>
                    <footer className="post-review-strip [display:flex] [justify-content:space-between] [align-items:center] [padding:12px_0_19px] [font-size:var(--text-feed-11)] [&_>_span]:[display:flex] [&_>_span]:[align-items:center] [&_>_span]:[gap:6px] [&_>_span]:[color:var(--color-feed-tone-62)] [&_>_span.pass]:[color:var(--color-feed-tone-63)] [&_i]:[display:inline-block] [&_i]:[width:5px] [&_i]:[height:5px] [&_i]:[background:currentColor] [&_i]:[border-radius:50%] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:5px] [&_button]:[color:var(--color-feed-tone-64)] [&_button]:[font-weight:600] [&_button]:[font-size:var(--text-feed-11)] [&_svg]:[width:14px] [&_svg]:[height:14px] max-[600px]:[margin-left:16px] max-[600px]:[margin-right:16px] max-[600px]:[padding-bottom:15px]">
                      <span className={count === 3 ? "pass" : "partial"}>
                        <i />
                        {count === 3
                          ? t("orot.copy046")
                          : t("orot.copy047", { value0: count })}
                      </span>
                      <button onClick={() => selectPost(p.id)}>
                        {p.status === "paid"
                          ? t("orot.copy048")
                          : t("orot.copy049")}
                        <Icon name="arrow" />
                      </button>
                    </footer>
                  </article>
                );
              })}
              <p className="feed-end [text-align:center] [font-size:var(--text-feed-11)] [color:var(--color-feed-tone-66)] [padding:12px_0_30px] max-[600px]:[font-size:var(--text-feed-10)]">
                {t("orot.copy050")}
              </p>
            </section>
            <aside className="review-sidebar [position:sticky] [top:25px] [min-width:0] [padding-top:5px] max-[1050px]:[display:none]">
              <section className="campaign-card [background:var(--color-feed-tone-67)] [border:1px_solid_var(--color-feed-tone-1)] [border-radius:10px] [padding:18px]">
                <div className="card-heading [display:flex] [gap:10px] [align-items:center] [&_>_div]:[flex:1] [&_strong]:[font-size:var(--text-feed-12)] [&_strong]:[display:block] [&_>_div_>_span]:[display:block] [&_>_div_>_span]:[font-size:var(--text-feed-9)] [&_>_div_>_span]:[color:var(--color-feed-tone-70)] [&_>_div_>_span]:[margin-top:3px]">
                  <Image
                    src="/images/maroo/logo.png"
                    alt="Maroo"
                    width={38}
                    height={38}
                    className="shrink-0"
                    unoptimized
                  />
                  <div>
                    <strong>{t("orot.copy017")}</strong>
                    <span>{t("orot.copy051")}</span>
                  </div>
                  <span className="live-pill [font-size:var(--text-feed-8)] [border:1px_solid_var(--color-feed-tone-71)] [padding:3px_5px] [border-radius:4px] [color:var(--color-feed-tone-72)]">
                    {t("orot.copy052")}
                  </span>
                </div>
                <div className="campaign-facts [display:grid] [gap:12px] [padding:21px_0_16px] [&_>_div]:[display:flex] [&_>_div]:[justify-content:space-between] [&_>_div]:[gap:10px] [&_>_div]:[align-items:baseline] [&_>_div]:[font-size:var(--text-feed-11)] [&_>_div_>_span]:[color:var(--color-feed-tone-73)] [&_strong]:[font-size:var(--text-feed-11)] [&_strong]:[font-weight:500] [&_small]:[font-size:var(--text-feed-9)] [&_small]:[color:var(--color-feed-tone-74)]">
                  <div>
                    <span>{t("orot.copy053")}</span>
                    <strong>
                      {campaign.start.slice(5).replace("-", ".")} —{" "}
                      {campaign.end.slice(5).replace("-", ".")}
                    </strong>
                  </div>
                  <div>
                    <span>{t("orot.copy054")}</span>
                    <strong>{campaign.keywords.join(" ")}</strong>
                  </div>
                  <div>
                    <span>{t("orot.copy055")}</span>
                    <strong>
                      {fmt(campaign.reward)} <small>tOKRW</small>
                    </strong>
                  </div>
                </div>
                <button
                  className="criteria-link [display:flex] [align-items:center] [justify-content:space-between] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-75)] [width:100%] [border-top:1px_solid_var(--color-feed-tone-76)] [padding-top:12px] [&_svg]:[width:13px] [&_svg]:[height:13px]"
                  onClick={() => setModal("rules")}
                >
                  {t("orot.copy056")}
                  <Icon name="arrow" />
                </button>
              </section>
              <section
                className="desktop-review [margin-top:25px] [padding-top:1px]"
                aria-label={t("orot.copy057")}
              >
                {review}
              </section>
              <div className="chain-summary [display:flex] [gap:7px] [align-items:flex-start] [border-top:1px_solid_var(--color-feed-tone-90)] [margin-top:23px] [padding-top:17px] [&_>_span]:[margin-top:5px] [&_>_span]:[flex-shrink:0] [&_>_div]:[flex:1] [&_strong]:[font-size:var(--text-feed-11)] [&_strong]:[font-weight:500] [&_strong]:[color:var(--color-feed-tone-91)] [&_strong]:[display:block] [&_p]:[font-size:var(--text-feed-10)] [&_p]:[margin-top:5px] [&_p]:[color:var(--color-feed-tone-92)] [&_button]:[color:var(--color-feed-tone-93)] [&_button]:[padding:0_5px]">
                <span
                  className={
                    data.chain.connected
                      ? "connected-dot [width:6px] [height:6px] [display:inline-block] [border-radius:50%] [background:var(--color-feed-tone-10)]"
                      : "offline-dot [width:6px] [height:6px] [background:var(--color-feed-tone-94)] [border-radius:50%]"
                  }
                />
                <div>
                  <strong>
                    {data.chain.connected
                      ? t("orot.copy058")
                      : t("orot.copy059")}
                  </strong>
                  <p>
                    {data.chain.blockNumber
                      ? t("orot.copy060", {
                          value0: fmt(data.chain.blockNumber),
                          value1: fmt(data.chain.contractBalance ?? 0),
                        })
                      : t("orot.copy061")}
                  </p>
                </div>
                <button
                  aria-label={t("orot.copy062")}
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  ↻
                </button>
              </div>
              <p className="sidebar-footnote [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-95)] [line-height:1.8] [margin-top:17px]">
                {t("orot.copy063")}
                <br />
                {t("orot.copy064")}
              </p>
            </aside>
          </div>
        )}
      </main>
      <dialog
        ref={reviewDialog}
        className="mobile-review-dialog [margin:auto] [border:1px_solid_var(--color-feed-tone-102)] [border-radius:14px] [width:min(490px,_calc(100%_-_32px))] [padding:28px] [max-height:90dvh] [overflow:auto] [box-shadow:0_20px_70px_var(--color-feed-tone-103)] [background:white] [color:var(--color-feed-tone-88)] [&::backdrop]:[background:var(--color-feed-tone-104)] [&::backdrop]:[backdrop-filter:blur(3px)] [position:fixed] [bottom:0] [margin:auto_auto_0] [width:100%] [border-radius:18px_18px_0_0] [padding:35px_25px_25px] max-[1050px]:[&_.check-line_strong]:[font-size:var(--text-feed-12)] max-[1050px]:[&_.check-line_p]:[font-size:var(--text-feed-11)] max-[1050px]:[&_.verification]:[font-size:var(--text-feed-12)] max-[1050px]:[&_.verification_small]:[font-size:var(--text-feed-10)] max-[1050px]:[&_.transaction-note]:[font-size:var(--text-feed-10)] max-[1050px]:[&_.review-person_strong]:[font-size:var(--text-feed-13)] max-[600px]:[&_.review-buttons_>_button]:[min-height:46px] max-[600px]:[&_.review-buttons_>_button]:[font-size:var(--text-feed-12)]"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setMobileReview(false);
        }}
        onClose={() => setMobileReview(false)}
      >
        <button
          className="dialog-close [position:absolute] [right:14px] [top:8px] [padding:4px] [color:var(--color-feed-tone-105)] [&_svg]:[width:16px] [&_svg]:[height:16px]"
          aria-label={t("orot.copy065")}
          disabled={busy}
          onClick={() => setMobileReview(false)}
        >
          <span className="text-caption">{t("common.cancel")}</span>
        </button>
        {mobileReview && review}
      </dialog>
      <dialog
        ref={dialog}
        className={`content-dialog max-[600px]:[margin:auto_auto_0] max-[600px]:[width:100%] max-[600px]:[border-radius:18px_18px_0_0] [margin:auto] [border:1px_solid_var(--color-feed-tone-102)] [border-radius:14px] [width:min(490px,_calc(100%_-_32px))] [padding:28px] [max-height:90dvh] [overflow:auto] [box-shadow:0_20px_70px_var(--color-feed-tone-103)] [background:white] [color:var(--color-feed-tone-88)] [&::backdrop]:[background:var(--color-feed-tone-104)] [&::backdrop]:[backdrop-filter:blur(3px)] ${modal === "wallets" ? "wallet-dialog [width:min(600px,_calc(100%_-_32px))] max-[600px]:[padding:22px]" : ""}`}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setModal(null);
        }}
        onClose={() => setModal(null)}
      >
        <div className="modal-heading [display:flex] [gap:12px] [align-items:center] [justify-content:space-between] [margin-bottom:17px] [&_h2]:[font-size:var(--text-feed-19)] [&_h2]:[font-weight:650] [&_h2]:[letter-spacing:-0.5px] [&_button]:[padding:5px] [&_button]:[color:var(--color-feed-tone-105)] [&_svg]:[width:19px] [&_svg]:[height:19px] max-[600px]:[&_h2]:[font-size:var(--text-feed-17)]">
          <h2>
            {
              {
                wallets: t("orot.copy066"),
                rules: t("orot.copy067"),
                reject: t("orot.copy068"),
                pay: t("orot.copy069"),
                evidence: t("orot.copy070"),
              }[modal ?? "rules"]
            }
          </h2>
          <button aria-label={t("orot.copy071")} onClick={() => setModal(null)}>
            <span className="min-[601px]:hidden text-caption">
              {t("common.cancel")}
            </span>
            <span className="max-[600px]:hidden">
              <Icon name="close" />
            </span>
          </button>
        </div>
        {modal === "wallets" && data && (
          <>
            <p className="modal-description [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-106)] [line-height:1.9] [margin-bottom:20px]">
              {t("orot.copy072")}
            </p>
            <div className="wallet-row [display:grid] [grid-template-columns:85px_1fr_24px_95px] [gap:10px] [align-items:center] [padding:16px_0] [border-bottom:1px_solid_var(--color-feed-tone-113)] [font-size:var(--text-feed-11)] [&_strong]:[font-size:var(--text-feed-12)] [&_small]:[display:block] [&_small]:[font-size:var(--text-feed-9)] [&_small]:[color:var(--color-feed-tone-114)] [&_small]:[font-weight:400] [&_small]:[margin-top:3px] [&_a]:[font-family:monospace] [&_a]:[color:var(--color-feed-tone-115)] [&_svg]:[width:14px] [&_svg]:[height:14px] [&_>_span]:[text-align:right] [&_>_span]:[color:var(--color-feed-tone-106)] [&_>_span]:[font-size:var(--text-feed-10)] max-[600px]:[grid-template-columns:65px_1fr_24px] max-[600px]:[gap:5px] max-[600px]:[&_>_span]:[display:none]">
              <strong>{t("orot.copy073")}</strong>
              <a
                target="_blank"
                rel="noreferrer"
                href={`${explorer}/address/${data.operator.address}`}
              >
                {short(data.operator.address)}
              </a>
              <button
                aria-label={t("orot.copy074")}
                onClick={() => void copy(data.operator.address)}
              >
                <Icon name="copy" />
              </button>
              <span>{fmt(data.operator.balance ?? 0)} tOKRW</span>
            </div>
            {data.participants.map((p) => (
              <div
                className="wallet-row [display:grid] [grid-template-columns:85px_1fr_24px_95px] [gap:10px] [align-items:center] [padding:16px_0] [border-bottom:1px_solid_var(--color-feed-tone-113)] [font-size:var(--text-feed-11)] [&_strong]:[font-size:var(--text-feed-12)] [&_small]:[display:block] [&_small]:[font-size:var(--text-feed-9)] [&_small]:[color:var(--color-feed-tone-114)] [&_small]:[font-weight:400] [&_small]:[margin-top:3px] [&_a]:[font-family:monospace] [&_a]:[color:var(--color-feed-tone-115)] [&_svg]:[width:14px] [&_svg]:[height:14px] [&_>_span]:[text-align:right] [&_>_span]:[color:var(--color-feed-tone-106)] [&_>_span]:[font-size:var(--text-feed-10)] max-[600px]:[grid-template-columns:65px_1fr_24px] max-[600px]:[gap:5px] max-[600px]:[&_>_span]:[display:none]"
                key={p.id}
              >
                <strong>
                  {p.name}
                  <small>
                    {t("orot.copy075")}
                    {p.userId}
                  </small>
                </strong>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${explorer}/address/${p.address}`}
                >
                  {short(p.address)}
                </a>
                <button
                  aria-label={t("orot.copy076", { value0: p.name })}
                  onClick={() => void copy(p.address)}
                >
                  <Icon name="copy" />
                </button>
                <span>
                  {p.status === "paid" ? t("orot.copy077") : t("orot.copy078")}
                </span>
              </div>
            ))}
            <p className="modal-footnote [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-116)] [margin-top:19px]">
              {t("orot.copy079")}
            </p>
          </>
        )}
        {modal === "rules" && campaign && (
          <>
            <p className="modal-description [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-106)] [line-height:1.9] [margin-bottom:20px]">
              {t("orot.copy080")}
            </p>
            <dl className="rule-list [&_dt]:[font-size:var(--text-feed-11)] [&_dt]:[color:var(--color-feed-tone-107)] [&_dt]:[margin-top:20px] [&_dd]:[font-size:var(--text-feed-13)] [&_dd]:[margin:5px_0_0] [&_dd]:[color:var(--color-feed-tone-108)] [&_dd]:[line-height:1.8] [&_.pay-total]:[font-size:var(--text-feed-28)] [&_.pay-total]:[font-weight:600] [&_.pay-total_small]:[font-size:var(--text-feed-12)] [&_.pay-total_small]:[color:var(--color-feed-tone-109)]">
              <dt>{t("orot.copy081")}</dt>
              <dd>
                {campaign.start} 00:00 — {campaign.end} 23:59
              </dd>
              <dt>{t("orot.copy082")}</dt>
              <dd>{campaign.keywords.join(", ")}</dd>
              <dt>{t("orot.copy083")}</dt>
              <dd>
                {t("orot.copy041")}
                {fmt(campaign.likes)}
                {t("orot.copy084")}
                {fmt(campaign.comments)}
                {t("orot.copy085")}
                {fmt(campaign.views)}
              </dd>
              <dt>{t("orot.copy055")}</dt>
              <dd>{fmt(campaign.reward)} tOKRW</dd>
              <dt>{t("orot.copy086")}</dt>
              <dd>{t("orot.copy087")}</dd>
            </dl>
            {campaign.contractAddress && (
              <a
                className="receipt-link [display:flex] [align-items:center] [gap:5px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-101)] [margin-top:14px] [justify-content:center] [&_svg]:[width:12px] [&_svg]:[height:12px]"
                href={`${explorer}/address/${campaign.contractAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("orot.copy088")}
                <Icon name="external" />
              </a>
            )}
            {campaign.policyTx && (
              <a
                className="receipt-link [display:flex] [align-items:center] [gap:5px] [font-size:var(--text-feed-10)] [color:var(--color-feed-tone-101)] [margin-top:14px] [justify-content:center] [&_svg]:[width:12px] [&_svg]:[height:12px]"
                href={`${explorer}/tx/${campaign.policyTx}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("orot.copy089")}
                <Icon name="external" />
              </a>
            )}
          </>
        )}
        {modal === "reject" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("reject");
            }}
          >
            <label className="field-label [display:block] [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-110)] [&_textarea]:[display:block] [&_textarea]:[resize:vertical] [&_textarea]:[width:100%] [&_textarea]:[border:1px_solid_var(--color-feed-tone-111)] [&_textarea]:[border-radius:7px] [&_textarea]:[padding:12px] [&_textarea]:[margin-top:10px] [&_textarea]:[font-size:var(--text-feed-12)] [&_textarea]:[line-height:1.8]">
              {t("orot.copy090")}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
                rows={4}
                placeholder={t("orot.copy091")}
              />
            </label>
            <div className="modal-actions [display:flex] [justify-content:flex-end] [gap:8px] [margin-top:24px] [&_button]:[font-size:var(--text-feed-12)] [&_button]:[min-height:42px] [&_button]:[border-radius:7px]">
              <AppButton tone="quiet" onClick={() => setModal(null)}>
                {t("orot.copy092")}
              </AppButton>
              <AppButton tone="danger" type="submit">
                {t("orot.copy093")}
              </AppButton>
            </div>
          </form>
        )}
        {modal === "pay" && post && campaign && (
          <>
            <p className="modal-description [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-106)] [line-height:1.9] [margin-bottom:20px]">
              {t("orot.copy094")}
            </p>
            <dl className="rule-list [&_dt]:[font-size:var(--text-feed-11)] [&_dt]:[color:var(--color-feed-tone-107)] [&_dt]:[margin-top:20px] [&_dd]:[font-size:var(--text-feed-13)] [&_dd]:[margin:5px_0_0] [&_dd]:[color:var(--color-feed-tone-108)] [&_dd]:[line-height:1.8] [&_.pay-total]:[font-size:var(--text-feed-28)] [&_.pay-total]:[font-weight:600] [&_.pay-total_small]:[font-size:var(--text-feed-12)] [&_.pay-total_small]:[color:var(--color-feed-tone-109)]">
              <dt>{t("orot.copy095")}</dt>
              <dd>
                {post.name} · @{post.handle}
              </dd>
              <dt>{t("orot.copy096")}</dt>
              <dd className="wallet-address [word-break:break-all] [font-family:monospace] [font-size:var(--text-feed-11)]">
                {post.address}
              </dd>
              <dt>{t("orot.copy097")}</dt>
              <dd className="pay-total">
                {fmt(campaign.reward)} <small>tOKRW</small>
              </dd>
            </dl>
            <div className="modal-actions [display:flex] [justify-content:flex-end] [gap:8px] [margin-top:24px] [&_button]:[font-size:var(--text-feed-12)] [&_button]:[min-height:42px] [&_button]:[border-radius:7px]">
              <AppButton tone="quiet" onClick={() => setModal(null)}>
                {t("orot.copy092")}
              </AppButton>
              <AppButton onClick={() => void act("pay")}>
                {t("orot.copy098")}
              </AppButton>
            </div>
          </>
        )}
        {modal === "evidence" && post && (
          <>
            <p className="modal-description [font-size:var(--text-feed-12)] [color:var(--color-feed-tone-106)] [line-height:1.9] [margin-bottom:20px]">
              {t("orot.copy099")}
            </p>
            <div className="evidence-caption [padding:18px] [background:var(--color-feed-tone-112)] [border-radius:8px] [white-space:pre-wrap] [font-size:var(--text-feed-13)] [line-height:1.9]">
              {post.caption}
            </div>
            <dl className="rule-list [&_dt]:[font-size:var(--text-feed-11)] [&_dt]:[color:var(--color-feed-tone-107)] [&_dt]:[margin-top:20px] [&_dd]:[font-size:var(--text-feed-13)] [&_dd]:[margin:5px_0_0] [&_dd]:[color:var(--color-feed-tone-108)] [&_dd]:[line-height:1.8] [&_.pay-total]:[font-size:var(--text-feed-28)] [&_.pay-total]:[font-weight:600] [&_.pay-total_small]:[font-size:var(--text-feed-12)] [&_.pay-total_small]:[color:var(--color-feed-tone-109)]">
              <dt>{t("orot.copy100")}</dt>
              <dd>
                {new Date(post.postedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </dd>
              <dt>{t("orot.copy101")}</dt>
              <dd>
                {t("orot.copy041")}
                {fmt(post.likes)}
                {t("orot.copy084")}
                {fmt(post.comments)}
                {t("orot.copy085")} {fmt(post.views)}
              </dd>
              <dt>{t("orot.copy102")}</dt>
              <dd className="wallet-address [word-break:break-all] [font-family:monospace] [font-size:var(--text-feed-11)]">
                {post.address}
              </dd>
            </dl>
          </>
        )}
      </dialog>
      <div
        className={`toast [position:fixed] [bottom:24px] [left:50%] [transform:translate(-50%,_12px)] [max-width:calc(100%_-_30px)] [width:max-content] [padding:12px_20px] [background:var(--color-feed-tone-117)] [color:var(--color-feed-tone-2)] [border-radius:9px] [font-size:var(--text-feed-12)] [box-shadow:0_4px_25px_var(--color-feed-tone-118)] [z-index:10] [opacity:0] [pointer-events:none] [transition:opacity_0.2s,_transform_0.2s] [&.visible]:[opacity:1] [&.visible]:[transform:translate(-50%,_0)] ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </div>
  );
}
