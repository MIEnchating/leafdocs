import { authorize } from "@/lib/server/authorize";
import { readJson, route } from "@/lib/server/http";
import { importDocuments } from "@/lib/server/transfer";
import { MAX_TRANSFER_BYTES } from "@/lib/transfer";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return route(async () => {
    await authorize(request);
    return Response.json(await importDocuments(await readJson(request, MAX_TRANSFER_BYTES)), { status: 201 });
  });
}
