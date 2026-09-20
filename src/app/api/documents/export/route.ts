import { authorize } from "@/lib/server/authorize";
import { route } from "@/lib/server/http";
import { exportDocuments } from "@/lib/server/transfer";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(async () => {
    await authorize();
    const archive = await exportDocuments(new URL(request.url).searchParams.get("id") ?? undefined);
    return Response.json(archive, { headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="leafdocs-documents.json"',
    } });
  });
}
