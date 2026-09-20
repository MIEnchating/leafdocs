import { signOut } from "@/lib/server/auth";
import { route, requireSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    requireSameOrigin(request);
    await signOut();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
