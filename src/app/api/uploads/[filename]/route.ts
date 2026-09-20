import { route } from "@/lib/server/http";
import { serveUpload } from "@/lib/server/uploads";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  return route(async () => serveUpload((await context.params).filename));
}
