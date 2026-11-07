"use client";
import { useTranslation } from "react-i18next";
import { useWebAuth } from "@/hooks/useWebAuth";
import { preferencesHook } from "@/zustand/preferences";
import { AppButton } from "./common/AppButton";
import { SectionCard } from "./common/SectionCard";
import { NoticeDialog } from "./common/NoticeDialog";
export function GuestAccountLink({ email }: { email: string }) {
  const { t } = useTranslation();
  const language = preferencesHook.useLanguage();
  const { googleButton: googleButtonRef, ...auth } = useWebAuth(
    language,
    email,
  );
  return (
    <SectionCard title={t("web.auth.link")}>
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
      </div>
      {auth.error && (
        <NoticeDialog
          title={t("web.error.title")}
          message={t(auth.error)}
          onClose={auth.clearError}
        />
      )}
    </SectionCard>
  );
}
