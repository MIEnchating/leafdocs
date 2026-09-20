import { authorize } from "@/lib/server/authorize";
import { unpublishDocument } from "@/lib/server/documents";
import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => { await authorize(request); return Response.json(await unpublishDocument((await context.params).id)); });
}
