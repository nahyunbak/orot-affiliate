import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "template_refresh";
const CHALLENGE = "template_oauth";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
};
export const backendOrigin = () =>
  process.env.BACKEND_URL || "http://localhost:4000";
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    // Next 개발 서버의 내부 URL 대신 브라우저가 접근한 Host와 비교한다.
    return (
      url.host === request.headers.get("host") &&
      url.protocol === request.nextUrl.protocol
    );
  } catch {
    return false;
  }
}
function equal(a: unknown, b: string) {
  return (
    typeof a === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function claims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  return JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
}
export function clearSession(response: NextResponse) {
  response.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
async function upstream(path: string, data: unknown) {
  const response = await fetch(`${backendOrigin()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok)
    return json(
      { message: "error.request" },
      response.status === 401 ? 401 : 502,
    );
  const body: unknown = await response.json();
  const tokens: unknown =
    body && typeof body === "object" && "success" in body
      ? body.success === true && "data" in body
        ? body.data
        : null
      : body;
  if (
    !tokens ||
    typeof tokens !== "object" ||
    !("accessToken" in tokens) ||
    !("refreshToken" in tokens) ||
    typeof tokens.accessToken !== "string" ||
    typeof tokens.refreshToken !== "string" ||
    !tokens.accessToken ||
    !tokens.refreshToken
  ) {
    return json({ message: "error.request" }, 502);
  }
  const responseJson = json({ accessToken: tokens.accessToken });
  // 갱신 토큰은 브라우저 JS로 전달하지 않는다. 만료 검증과 회전은 기존 서버에서 수행한다.
  responseJson.cookies.set(COOKIE, tokens.refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });
  return responseJson;
}
async function verifyAppleToken(token: string, code: string, nonce: string) {
  const parts = token.split(".");
  const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
  if (parts.length !== 3) throw new Error("Invalid token");
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw new Error("Invalid algorithm");
  const keysResponse = await fetch("https://appleid.apple.com/auth/keys", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!keysResponse.ok) throw new Error("Keys unavailable");
  const keySet = (await keysResponse.json()) as {
    keys: (JsonWebKey & { kid: string })[];
  };
  const key = keySet.keys.find((item) => item.kid === header.kid);
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2]!, "base64url"),
    )
  )
    throw new Error("Invalid signature");
  const payload = claims(token);
  const codeHash = createHash("sha256")
    .update(code)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
  if (
    payload.iss !== "https://appleid.apple.com" ||
    payload.aud !== process.env.APPLE_SERVICE_ID ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now() / 1000 ||
    !equal(payload.nonce, nonce) ||
    !equal(payload.c_hash, codeHash)
  )
    throw new Error("Invalid claims");
}
export async function authAction(request: NextRequest, action: string) {
  if (!sameOrigin(request)) return json({ message: "error.request" }, 403);
  try {
    if (action === "orot-demo") {
      if (
        process.env.OROT_DEMO_MODE !== "true" ||
        !process.env.OROT_TESTER_EMAIL ||
        !process.env.OROT_TESTER_PASSWORD
      )
        return json(
          { message: "테스트 집행자 로그인이 설정되지 않았습니다." },
          503,
        );
      return await upstream("/auth/tester-login", {
        email: process.env.OROT_TESTER_EMAIL,
        password: process.env.OROT_TESTER_PASSWORD,
      });
    }
    if (action === "anonymous")
      return await upstream("/auth/anonymous", { initialPlatform: "WEB" });
    if (action === "logout") return clearSession(json({ success: true }));
    if (action === "refresh") {
      const token = request.cookies.get(COOKIE)?.value;
      if (!token) return clearSession(json({ message: "error.request" }, 401));
      const response = await upstream("/auth/refresh", { refreshToken: token });
      return response.status === 401 ? clearSession(response) : response;
    }
    if (Number(request.headers.get("content-length") || 0) > 20_000)
      return json({ message: "error.request" }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 20_000)
      return json({ message: "error.request" }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (action === "challenge") {
      const provider = body.provider;
      if (provider !== "google" && provider !== "apple")
        return json({ message: "error.request" }, 400);
      const clientId =
        provider === "google"
          ? process.env.GOOGLE_CLIENT_ID
          : process.env.APPLE_SERVICE_ID;
      const redirectURI = process.env.APPLE_REDIRECT_URI;
      if (
        !clientId ||
        (provider === "apple" &&
          (!redirectURI ||
            new URL(redirectURI).origin !== request.nextUrl.origin))
      ) {
        return json(
          {
            message: "auth.unavailable",
          },
          503,
        );
      }
      const state = randomBytes(32).toString("base64url");
      const nonce = randomBytes(32).toString("base64url");
      const response = json({
        provider,
        clientId,
        redirectURI: provider === "apple" ? redirectURI : undefined,
        state,
        nonce,
      });
      response.cookies.set(
        CHALLENGE,
        JSON.stringify({ provider, state, nonce }),
        { ...cookieOptions, maxAge: 600 },
      );
      return response;
    }
    if (action !== "google" && action !== "apple")
      return json({ message: "error.request" }, 404);
    const challenge = JSON.parse(
      request.cookies.get(CHALLENGE)?.value || "null",
    ) as { provider: string; state: string; nonce: string } | null;
    if (
      !challenge ||
      challenge.provider !== action ||
      !equal(body.state, challenge.state)
    )
      return json({ message: "error.request" }, 400);
    const hasGuestClaim =
      body.anonymousEmail !== undefined ||
      body.anonymousAccessToken !== undefined;
    if (
      hasGuestClaim &&
      (typeof body.anonymousEmail !== "string" ||
        !body.anonymousEmail.trim() ||
        typeof body.anonymousAccessToken !== "string" ||
        !body.anonymousAccessToken.trim())
    )
      return json({ message: "error.request" }, 400);
    // 게스트 소유권은 Backend가 이 access token으로 검증한다. 이메일만으로 연결하지 않는다.
    const guestClaim = hasGuestClaim
      ? {
          anonymousEmail: body.anonymousEmail,
          anonymousAccessToken: body.anonymousAccessToken,
        }
      : {};
    let response: NextResponse;
    if (action === "google") {
      if (
        typeof body.idToken !== "string" ||
        !equal(claims(body.idToken).nonce, challenge.nonce)
      )
        throw new Error("Invalid nonce");
      // 동일 토큰의 서명·audience 검증은 기존 Google 로그인 서비스에서 수행한다.
      response = await upstream("/auth/google", {
        idToken: body.idToken,
        ...guestClaim,
        initialPlatform: "WEB",
      });
    } else {
      if (
        typeof body.authorizationCode !== "string" ||
        typeof body.identityToken !== "string"
      )
        throw new Error("Missing Apple response");
      await verifyAppleToken(
        body.identityToken,
        body.authorizationCode,
        challenge.nonce,
      );
      // 기존 사용자 연결 로직을 재사용하되, 웹 Service ID 토큰 검증 경로로 전달한다.
      response = await upstream("/auth/apple", {
        identityToken: body.identityToken,
        ...guestClaim,
        initialPlatform: "WEB",
      });
    }
    response.cookies.set(CHALLENGE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch {
    return json({ message: "error.request" }, 400);
  }
}
