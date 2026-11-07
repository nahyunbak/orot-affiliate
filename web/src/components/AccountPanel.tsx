"use client";
import Image from "next/image";
import { GuestAccountLink } from "./GuestAccountLink";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MyPageResDto } from "@/fetch/types";
import type { SupportedLanguage } from "@/i18n/resources";
import { useAccount } from "@/hooks/useAccount";
import { AppButton } from "./common/AppButton";
import { AppTextField } from "./common/AppTextField";
import { SectionCard } from "./common/SectionCard";
import { NoticeDialog } from "./common/NoticeDialog";
export function AccountPanel() {
  const account = useAccount();
  const { t } = useTranslation();
  const [dismissedError, setDismissedError] = useState(0);
  if (!account.profile.data)
    return (
      <SectionCard title={t("web.profile.title")}>
        <p role="status" className="mb-5 text-muted">
          {t(
            account.profile.isError
              ? "web.profile.loadError"
              : "web.auth.loading",
          )}
        </p>
        {account.profile.isError && (
          <AppButton onClick={() => void account.profile.refetch()}>
            {t("web.retry")}
          </AppButton>
        )}
        {account.profile.isError &&
          dismissedError !== account.profile.errorUpdatedAt && (
            <NoticeDialog
              title={t("web.error.title")}
              message={t("web.error.request")}
              onClose={() => setDismissedError(account.profile.errorUpdatedAt)}
            />
          )}
      </SectionCard>
    );
  return (
    <ProfileForm
      key={account.profile.data.id}
      account={account}
      profile={account.profile.data}
    />
  );
}
function ProfileForm({
  account,
  profile,
}: {
  account: ReturnType<typeof useAccount>;
  profile: MyPageResDto;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(
    "nickName" in profile && typeof profile.nickName === "string"
      ? profile.nickName
      : "",
  );
  const [language, setLanguage] = useState<SupportedLanguage>(
    profile.language === "en" ? "en" : "ko",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photo =
    profile.profile_image && /^https?:\/\//.test(profile.profile_image)
      ? profile.profile_image
      : undefined;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <SectionCard
        title={t("web.profile.title")}
        description={t("web.profile.description")}
      >
        <div className="mb-8 flex flex-wrap items-center gap-5">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-title font-semibold text-accent">
            {photo ? (
              <Image
                src={photo}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="size-20 object-cover"
              />
            ) : (
              name.trim().slice(0, 1).toUpperCase() || "·"
            )}
          </div>
          <label className="grid max-w-full gap-2 text-caption text-muted">
            <span className="font-semibold text-ink">
              {t("web.profile.upload")}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={account.busy || !name.trim()}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void account.uploadPhoto(file, name, language);
                e.currentTarget.value = "";
              }}
              className="max-w-full text-caption file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:text-ink focus-visible:outline-accent disabled:opacity-50"
            />
            <span>{t("web.profile.uploadHint")}</span>
          </label>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void account.save(name, language);
          }}
        >
          <AppTextField
            label={t("web.profile.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            autoComplete="name"
            disabled={account.busy}
          />
          <AppTextField
            label={t("web.profile.email")}
            value={profile.email || t("web.profile.noEmail")}
            readOnly
          />
          <label className="grid gap-2 text-caption font-semibold text-muted">
            <span>{t("web.language")}</span>
            <select
              value={language}
              disabled={account.busy}
              onChange={(e) =>
                setLanguage(e.target.value === "en" ? "en" : "ko")
              }
              className="min-h-12 rounded-xl border border-line bg-surface px-4 text-body text-ink focus:outline-accent"
            >
              <option value="ko">{t("web.language.ko")}</option>
              <option value="en">{t("web.language.en")}</option>
            </select>
          </label>
          <AppButton type="submit" disabled={account.busy || !name.trim()}>
            {t(account.busy ? "web.profile.pending" : "web.profile.save")}
          </AppButton>
          <p role="status" className="min-h-6 text-caption text-accent">
            {account.saved ? t("web.profile.saved") : ""}
          </p>
        </form>
      </SectionCard>
      <div className="grid gap-6">
        {profile.auth_provider === "anonymous" && (
          <GuestAccountLink email={profile.email} />
        )}
        <SectionCard
          title={t("web.subscription.title")}
          description={t("web.subscription.description")}
        >
          <div className="mb-5 rounded-2xl bg-accent-soft p-5 text-title font-semibold text-accent">
            {t(
              profile.isPremium
                ? "web.subscription.active"
                : "web.subscription.free",
            )}
          </div>
          <p className="text-body leading-relaxed text-muted">
            {t("web.subscription.note")}
          </p>
          <p className="mt-4 border-t border-line pt-4 text-caption leading-relaxed text-muted">
            {t("web.subscription.native")}
          </p>
        </SectionCard>
        <AppButton
          tone="quiet"
          onClick={() => setConfirmDelete(true)}
          disabled={account.busy}
        >
          {t("web.account.delete")}
        </AppButton>
      </div>
      {account.error && (
        <NoticeDialog
          title={t("web.error.title")}
          message={t(account.error)}
          onClose={account.clearError}
        />
      )}
      {confirmDelete && !account.error && (
        <NoticeDialog
          title={t("web.account.confirmTitle")}
          message={t("web.account.confirmText")}
          busy={account.busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            void account.deleteAccount().then(() => setConfirmDelete(false))
          }
        />
      )}
    </div>
  );
}
