import { authGet } from "@/zustand/auth";
import { refreshSession, getAuthGeneration } from "@/lib/web-auth-client";
export const BASE_URL = "/api/backend";
export async function fetchWithAuth<T>(
  input: string,
  init?: RequestInit,
  retry = false,
  generation = getAuthGeneration(),
): Promise<T> {
  const checkSession = () => {
    if (generation !== getAuthGeneration())
      throw new DOMException("Session changed", "AbortError");
  };
  checkSession();
  if (!input.startsWith("/") || input.startsWith("//") || input.includes(".."))
    throw new Error("error.request");
  if (input.startsWith("/auth/") && input !== "/auth/withdraw")
    throw new Error("Use the HttpOnly auth session boundary");
  const headers = new Headers(init?.headers);
  const token = authGet.accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  const response = await fetch(`${BASE_URL}${input}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  checkSession();
  if (response.status === 401 && !retry && (await refreshSession()))
    return fetchWithAuth<T>(input, init, true, generation);
  const body = await response.json();
  checkSession();
  if (!response.ok || body?.success === false) throw new Error("error.request");
  return body as T;
}
export function getBaseHeader(accessToken?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}
export function toSearchParams(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null)
      search.set(
        key,
        value instanceof Date ? value.toISOString() : String(value),
      );
  }
  return search.toString();
}
