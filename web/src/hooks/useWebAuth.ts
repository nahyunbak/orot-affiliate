"use client";
import { useEffect, useRef, useState } from "react";
import {
  authRequest,
  establishSession,
  getAuthGeneration,
  logoutSession,
} from "@/lib/web-auth-client";
import { authGet, authHook } from "@/zustand/auth";
type Challenge = {
  clientId: string;
  redirectURI?: string;
  state: string;
  nonce: string;
};
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        const timer = window.setTimeout(() => {
          script.remove();
          scripts.delete(src);
          reject(new Error("error.request"));
        }, 15000);
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          scripts.delete(src);
          reject(new Error("error.request"));
        };
        document.head.appendChild(script);
      }),
    );
  return scripts.get(src)!;
}
export function useWebAuth(language: string, anonymousEmail?: string) {
  const auth = authHook.useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appleReady, setAppleReady] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );
  async function run(task: (valid: () => boolean) => Promise<void>) {
    if (busy) return;
    const id = ++attempt.current;
    const generation = getAuthGeneration();
    const valid = () =>
      attempt.current === id && getAuthGeneration() === generation;
    setBusy(true);
    setError("");
    try {
      await task(valid);
    } catch (reason) {
      const cancelled =
        reason &&
        typeof reason === "object" &&
        "error" in reason &&
        ["popup_closed_by_user", "user_cancelled_authorize"].includes(
          String(reason.error),
        );
      if (!cancelled && attempt.current === id)
        setError(
          reason instanceof Error && reason.message === "auth.unavailable"
            ? "web.auth.unavailable"
            : "web.error.request",
        );
    } finally {
      if (attempt.current === id) setBusy(false);
    }
  }
  async function accept(
    action: string,
    data: Record<string, unknown>,
    valid: () => boolean,
  ) {
    if (!valid()) return;
    const claim =
      anonymousEmail && (action === "google" || action === "apple")
        ? { anonymousEmail, anonymousAccessToken: authGet.accessToken() }
        : {};
    if (anonymousEmail && !authGet.accessToken())
      throw new Error("error.request");
    const result = await authRequest<{ accessToken: string }>(action, {
      ...data,
      ...claim,
    });
    if (valid()) establishSession(result.accessToken);
  }
  const guest = () => run((valid) => accept("anonymous", {}, valid));
  const google = () =>
    run(async (valid) => {
      setAppleReady(false);
      const [challenge] = await Promise.all([
        authRequest<Challenge>("challenge", { provider: "google" }),
        loadScript("https://accounts.google.com/gsi/client"),
      ]);
      if (!valid()) return;
      if (!window.google || !googleButton.current)
        throw new Error("error.request");
      window.google.accounts.id.initialize({
        client_id: challenge.clientId,
        nonce: challenge.nonce,
        callback: (response) => {
          if (!valid()) return;
          void run((current) =>
            accept(
              "google",
              { idToken: response.credential, state: challenge.state },
              current,
            ),
          );
        },
      });
      window.google.accounts.id.renderButton(googleButton.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: language,
        width: 280,
      });
    });
  const apple = () =>
    run(async (valid) => {
      if (googleButton.current) googleButton.current.replaceChildren();
      const [challenge] = await Promise.all([
        authRequest<Challenge>("challenge", { provider: "apple" }),
        loadScript(
          "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
        ),
      ]);
      if (!valid()) return;
      if (!window.AppleID || !challenge.redirectURI)
        throw new Error("error.request");
      window.AppleID.auth.init({
        clientId: challenge.clientId,
        redirectURI: challenge.redirectURI,
        scope: "name email",
        state: challenge.state,
        nonce: challenge.nonce,
        usePopup: true,
      });
      setAppleReady(true);
    });
  const openApple = () =>
    run(async (valid) => {
      if (!window.AppleID) throw new Error("error.request");
      const result = await window.AppleID.auth.signIn();
      setAppleReady(false);
      if (valid())
        await accept(
          "apple",
          {
            state: result.authorization.state,
            authorizationCode: result.authorization.code,
            identityToken: result.authorization.id_token,
          },
          valid,
        );
    });
  const logout = () =>
    run(async () => {
      setAppleReady(false);
      await logoutSession();
    });
  return {
    ...auth,
    busy,
    error,
    clearError: () => setError(""),
    googleButton,
    appleReady,
    guest,
    google,
    apple,
    openApple,
    logout,
  };
}
