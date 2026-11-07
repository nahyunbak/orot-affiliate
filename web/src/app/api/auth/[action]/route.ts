import type { NextRequest } from "next/server";
import { authAction } from "@/lib/web-auth-server";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  return authAction(request, (await context.params).action);
}
