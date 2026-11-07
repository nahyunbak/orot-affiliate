"use client";
import { env } from "@/env";
let viewed = false;
// 기존 웹 분석 경계처럼 계정·이메일·IP·리퍼러를 보내지 않는다.
export function trackPageView() {
  const token = env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (
    viewed ||
    !token ||
    privacy.doNotTrack === "1" ||
    privacy.globalPrivacyControl ||
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  )
    return;
  viewed = true;
  void fetch("https://api.mixpanel.com/track?ip=0", {
    method: "POST",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    body: new URLSearchParams({
      data: JSON.stringify([
        { event: "Sample Page View", properties: { token } },
      ]),
    }),
  }).catch(() => {
    /* 분석 실패는 화면을 막지 않는다. */
  });
}
