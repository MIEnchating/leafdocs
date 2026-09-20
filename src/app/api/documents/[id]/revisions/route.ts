import { authorize } from "@/lib/server/authorize";
import { listRevisions } from "@/lib/server/documents";
import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => { await authorize(); return Response.json(await listRevisions((await context.params).id)); });
}
