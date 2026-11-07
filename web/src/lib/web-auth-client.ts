"use client";
import { authGet, authSet } from "@/zustand/auth";
let refreshPromise: Promise<string | null> | null = null;
let refreshGeneration = 0;
let channel: BroadcastChannel | undefined;
let clearQueries: (() => void) | undefined;
export const getAuthGeneration = authGet.revision;
export function registerAuthCacheClear(clear: () => void) {
  clearQueries = clear;
  return () => {
    if (clearQueries === clear) clearQueries = undefined;
  };
}
export async function authRequest<T>(
  action: string,
  data?: unknown,
): Promise<T> {
  const send = async () => {
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(body.message || "error.request"), {
        status: response.status,
      });
    return body as T;
  };
  return navigator.locks
    ? navigator.locks.request("template-auth-session", send)
    : send();
}
export function listenForSessionChanges() {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const activeChannel = new BroadcastChannel("template-session-changed");
  channel = activeChannel;
  activeChannel.onmessage = () => {
    resetClientSession();
    void refreshSession();
  };
  return () => {
    activeChannel.close();
    if (channel === activeChannel) channel = undefined;
  };
}
export function resetClientSession() {
  authSet.reset();
  clearQueries?.();
}
export function establishSession(accessToken: string) {
  clearQueries?.();
  authSet.session(accessToken);
  channel?.postMessage("changed");
}
// 인증 판단은 서버가 맡는다. payload의 id는 갱신 중 계정 변경 감지에만 사용한다.
function sessionOwner(token: string): unknown {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    return (
      JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) as {
        id?: unknown;
      }
    ).id;
  } catch {
    return null;
  }
}
export function refreshSession(): Promise<string | null> {
  if (refreshPromise && refreshGeneration !== getAuthGeneration())
    return refreshPromise.then(() => refreshSession());
  if (!refreshPromise) {
    const generation = getAuthGeneration();
    refreshGeneration = generation;
    refreshPromise = authRequest<{ accessToken: string }>("refresh")
      .then(({ accessToken }) => {
        if (generation !== getAuthGeneration()) return null;
        const previous = authGet.accessToken();
        if (previous && sessionOwner(previous) !== sessionOwner(accessToken)) {
          clearQueries?.();
          authSet.session(accessToken);
        } else authSet.accessToken(accessToken);
        return accessToken;
      })
      .catch(() => {
        if (generation === getAuthGeneration()) resetClientSession();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
export async function hydrateSession() {
  if (!authGet.hydrated()) await refreshSession();
}
export async function logoutSession() {
  resetClientSession();
  await refreshPromise;
  await authRequest("logout");
  channel?.postMessage("changed");
}
