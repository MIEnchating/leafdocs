import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/server/authorize";
import { getSiteSettings, updateSiteSettings } from "@/lib/server/site-settings";
import { readJson, route } from "@/lib/server/http";

export async function GET() {
  return route(async () => { await authorize(); return Response.json(await getSiteSettings()); });
}
export async function PATCH(request: Request) {
  return route(async () => {
    await authorize(request);
    const settings = await updateSiteSettings(await readJson(request, 4096));
    revalidatePath("/", "layout");
    return Response.json(settings);
  });
}
