import { authorize } from "@/lib/server/authorize";
import { route } from "@/lib/server/http";
import { saveUpload } from "@/lib/server/uploads";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return route(async () => { await authorize(request); return Response.json({ url: await saveUpload(request) }, { status: 201 }); });
}
