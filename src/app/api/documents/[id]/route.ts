import { authorize } from "@/lib/server/authorize";
import { deleteDocument, getDocument, updateDocument } from "@/lib/server/documents";
import { readJson, route } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, context: Context) {
  return route(async () => { await authorize(); return Response.json(await getDocument((await context.params).id)); });
}
export async function PATCH(request: Request, context: Context) {
  return route(async () => {
    await authorize(request);
    return Response.json(await updateDocument((await context.params).id, await readJson(request)));
  });
}
export async function DELETE(request: Request, context: Context) {
  return route(async () => { await authorize(request); await deleteDocument((await context.params).id); return Response.json({ ok: true }); });
}
