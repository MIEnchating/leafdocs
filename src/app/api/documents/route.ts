import { authorize } from "@/lib/server/authorize";
import { createDocument, listDocuments } from "@/lib/server/documents";
import { readJson, route } from "@/lib/server/http";

export const runtime = "nodejs";
export async function GET() {
  return route(async () => { await authorize(); return Response.json(await listDocuments()); });
}
export async function POST(request: Request) {
  return route(async () => {
    await authorize(request);
    return Response.json(await createDocument(await readJson(request)), { status: 201 });
  });
}
