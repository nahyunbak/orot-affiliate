"use client";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppButton } from "./AppButton";
export function NoticeDialog({
  title,
  message,
  onClose,
  onConfirm,
  busy = false,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="notice-title"
      aria-describedby="notice-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-surface p-7 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <h2 id="notice-title" className="text-title font-semibold">
        {title}
      </h2>
      <p
        id="notice-description"
        className="mt-3 text-body leading-relaxed text-muted"
      >
        {message}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <AppButton tone="quiet" disabled={busy} onClick={onClose}>
          {t(onConfirm ? "web.cancel" : "web.close")}
        </AppButton>
        {onConfirm && (
          <AppButton tone="danger" disabled={busy} onClick={onConfirm}>
            {t("web.account.delete")}
          </AppButton>
        )}
      </div>
    </dialog>
  );
}
