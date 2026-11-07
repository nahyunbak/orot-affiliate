"use client";
import { t } from "i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authRequest, refreshSession } from "@/lib/web-auth-client";
import { authGet, authSet } from "@/zustand/auth";
import type { Workspace } from "@/components/campaign/types";
// 테스트넷 영수증 대기(65초), 토큰 갱신, 주기 조회는 생성 파일 밖의 전송 경계에 둔다.
async function request<T>(path: string, body?: unknown): Promise<T> {
  const options = {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authGet.accessToken()}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(65000),
  };
  let response = await fetch(`/api/backend/affiliate/${path}`, options);
  if (response.status === 401) {
    const token = await refreshSession();
    if (token)
      response = await fetch(`/api/backend/affiliate/${path}`, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(65000),
      });
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(t("orot.copy001"));
  }
  const result = await response.json();
  if (!response.ok || result.success !== true)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(" ")
        : result.message || t("orot.copy001"),
    );
  return result.data as T;
}

export function useAffiliateSession() {
  return useQuery({
    queryKey: ["orot-session"],
    queryFn: async () => {
      const result = await authRequest<{ accessToken: string }>("orot-demo");
      authSet.session(result.accessToken);
      return true;
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
export function useAffiliateWorkspace(enabled: boolean) {
  return useQuery({
    queryKey: ["orot-workspace"],
    queryFn: () => request<Workspace>("workspace"),
    enabled,
    refetchInterval: 15000,
    retry: 1,
  });
}
export function useAffiliateAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      verified,
      reason,
    }: {
      id: string;
      action: "approve" | "pay" | "reject" | "reopen";
      verified: boolean;
      reason: string;
    }) =>
      request<Workspace>(
        id + "/" + action,
        action === "approve"
          ? { verified }
          : action === "reject"
            ? { reason }
            : {},
      ),
    onSuccess: (data) => client.setQueryData(["orot-workspace"], data),
  });
}
