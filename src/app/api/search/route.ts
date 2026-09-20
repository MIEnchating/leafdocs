import { searchPublishedDocuments } from "@/lib/server/documents";
import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return route(async () => Response.json(await searchPublishedDocuments(new URL(request.url).searchParams.get("q") ?? "")));
}
