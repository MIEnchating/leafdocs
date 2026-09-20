import { authorize } from "@/lib/server/authorize";
import { restoreDocument } from "@/lib/server/documents";
import { readJson, route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await authorize(request);
    return Response.json(await restoreDocument((await context.params).id, await readJson(request)));
  });
}
