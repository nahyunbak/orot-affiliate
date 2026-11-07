"use client";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { env } from "@/env";
import i18n from "@/i18n/client";
import { preferencesHook, preferencesSet } from "@/zustand/preferences";
import { useWebAuth } from "@/hooks/useWebAuth";
import { AccountPanel } from "./AccountPanel";
import { AppButton } from "./common/AppButton";
import { NoticeDialog } from "./common/NoticeDialog";
import { SectionCard } from "./common/SectionCard";
export function StarterWorkbench() {
  const { t } = useTranslation();
  const language = preferencesHook.useLanguage();
  const { googleButton: googleButtonRef, ...auth } = useWebAuth(language);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);
  return (
    <main className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
      <nav
        className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-6"
        aria-label={env.NEXT_PUBLIC_APP_NAME}
      >
        <span className="text-title font-bold tracking-tight">
          {env.NEXT_PUBLIC_APP_NAME}
          <span className="text-accent" aria-hidden="true">
            .
          </span>
        </span>
        <div className="flex items-center gap-4">
          <label className="text-caption text-muted">
            <span className="sr-only">{t("web.language")}</span>
            <select
              aria-label={t("web.language")}
              value={language}
              onChange={(e) =>
                preferencesSet.language(e.target.value === "en" ? "en" : "ko")
              }
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-body text-ink"
            >
              <option value="ko">{t("web.language.ko")}</option>
              <option value="en">{t("web.language.en")}</option>
            </select>
          </label>
          {auth.accessToken && (
            <AppButton
              tone="quiet"
              disabled={auth.busy}
              onClick={() => void auth.logout()}
            >
              {t("web.auth.logout")}
            </AppButton>
          )}
        </div>
      </nav>
      <header className="max-w-3xl py-12 sm:py-16">
        <p className="mb-4 text-caption font-bold tracking-widest text-accent">
          {t("web.app.eyebrow")}
        </p>
        <h1 className="text-display font-semibold leading-[1.08] tracking-tight">
          {t("web.app.title")}
        </h1>
        <p className="mt-6 max-w-xl text-body leading-relaxed text-muted">
          {t("web.app.description")}
        </p>
      </header>
      {!auth.hydrated ? (
        <p role="status">{t("web.auth.loading")}</p>
      ) : auth.accessToken ? (
        <AccountPanel key={auth.revision} />
      ) : (
        <div className="max-w-xl">
          <SectionCard
            title={t("web.auth.title")}
            description={t("web.auth.description")}
          >
            <div className="grid gap-3">
              <AppButton
                tone="quiet"
                disabled={auth.busy}
                onClick={() => void auth.google()}
              >
                {t("web.auth.google")}
              </AppButton>
              <div ref={googleButtonRef} className="empty:hidden" />
              <AppButton
                tone="quiet"
                disabled={auth.busy}
                onClick={() =>
                  void (auth.appleReady ? auth.openApple() : auth.apple())
                }
              >
                {t(auth.appleReady ? "web.auth.openApple" : "web.auth.apple")}
              </AppButton>
              <div className="my-2 border-t border-line" />
              <AppButton disabled={auth.busy} onClick={() => void auth.guest()}>
                {t("web.auth.guest")}
              </AppButton>
              <p className="text-center text-caption leading-relaxed text-muted">
                {t("web.auth.guestNote")}
              </p>
            </div>
          </SectionCard>
        </div>
      )}
      <footer className="mt-12 flex flex-wrap gap-6 border-t border-line pt-6 text-caption text-muted">
        {env.NEXT_PUBLIC_PRIVACY_URL && (
          <a
            href={env.NEXT_PUBLIC_PRIVACY_URL}
            className="underline underline-offset-4"
          >
            {t("web.privacy")}
          </a>
        )}
        {env.NEXT_PUBLIC_TERMS_URL && (
          <a
            href={env.NEXT_PUBLIC_TERMS_URL}
            className="underline underline-offset-4"
          >
            {t("web.terms")}
          </a>
        )}
      </footer>
      {auth.error && (
        <NoticeDialog
          title={t("web.error.title")}
          message={t(auth.error)}
          onClose={auth.clearError}
        />
      )}
    </main>
  );
}
