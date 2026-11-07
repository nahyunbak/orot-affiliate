"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMypage } from "@/query/user";
import { useUpdateUserInfoMutation } from "@/mutation/user";
import { useUploadFileMutation } from "@/mutation/upload";
import { useDeleteUserMutation } from "@/mutation/auth";
import { queryKeys } from "@/fetch/utils/constants";
import { LanguageEnum } from "@/fetch/types/prisma-types";
import { logoutSession, getAuthGeneration } from "@/lib/web-auth-client";
import { preferencesSet } from "@/zustand/preferences";
import type { SupportedLanguage } from "@/i18n/resources";
export function useAccount() {
  const profile = useMypage();
  const update = useUpdateUserInfoMutation();
  const upload = useUploadFileMutation();
  const withdraw = useDeleteUserMutation();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = update.isPending || upload.isPending || withdraw.isPending;
  async function save(
    name: string,
    language: SupportedLanguage,
    image?: string,
  ) {
    setSaved(false);
    const generation = getAuthGeneration();
    try {
      const data = {
        nickName: name.trim(),
        language: LanguageEnum[language],
        ...(image ? { profile_image: image } : {}),
      };
      await update.mutateAsync(data);
      if (generation !== getAuthGeneration()) return;
      preferencesSet.language(language);
      await client.invalidateQueries({ queryKey: [queryKeys.user.mypage] });
      if (generation === getAuthGeneration()) setSaved(true);
    } catch {
      if (generation === getAuthGeneration()) setError("web.error.request");
    }
  }
  async function uploadPhoto(
    file: File,
    name: string,
    language: SupportedLanguage,
  ) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("web.profile.fileError");
      return;
    }
    setSaved(false);
    const generation = getAuthGeneration();
    try {
      const result = await upload.mutateAsync({
        file,
        params: { kind: "profile", name: file.name },
      });
      if (generation !== getAuthGeneration()) return;
      if (
        !result.success ||
        !result.data?.url ||
        !/^https?:\/\//.test(result.data.url)
      )
        throw new Error("Invalid upload response");
      await save(name, language, result.data.url);
    } catch {
      if (generation === getAuthGeneration()) setError("web.error.request");
    }
  }
  async function deleteAccount() {
    const generation = getAuthGeneration();
    try {
      await withdraw.mutateAsync();
      if (generation === getAuthGeneration()) await logoutSession();
    } catch {
      if (generation === getAuthGeneration()) setError("web.error.request");
    }
  }
  return {
    profile,
    busy,
    error,
    saved,
    clearError: () => setError(""),
    save,
    uploadPhoto,
    deleteAccount,
  };
}
