import type { NextRequest } from "next/server";
import { backendOrigin, json, sameOrigin } from "@/lib/web-auth-server";
export const runtime = "nodejs";
const routes = new Set([
  "GET user/mypage",
  "PATCH user/update-info",
  "POST upload/upload",
  "DELETE auth/withdraw",
  "GET affiliate/workspace",
]);
type Context = { params: Promise<{ path: string[] }> };
async function forward(request: NextRequest, context: Context) {
  const path = (await context.params).path.join("/");
  const affiliateAction =
    request.method === "POST" &&
    /^affiliate\/maroo-s[1-5]\/(approve|pay|reject|reopen)$/.test(path);
  if (!routes.has(`${request.method} ${path}`) && !affiliateAction)
    return json({ message: "error.request" }, 404);
  if (request.method !== "GET" && !sameOrigin(request))
    return json({ message: "error.request" }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ message: "error.request" }, 401);
  try {
    const limit = path === "upload/upload" ? 5 * 1024 * 1024 + 65_536 : 20_000;
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return json({ message: "error.request" }, 413);
        }
        chunks.push(chunk.value);
      }
    }
    const upstream = await fetch(
      `${backendOrigin()}/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          Authorization: authorization,
          "Content-Type":
            request.headers.get("content-type") || "application/json",
        },
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      },
    );
    return json(await upstream.json(), upstream.status);
  } catch {
    return json({ message: "error.request" }, 502);
  }
}
export const GET = forward;
export const PATCH = forward;
export const POST = forward;
export const DELETE = forward;
