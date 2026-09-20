import { signIn } from "@/lib/server/auth";
import { HttpError, route, readBytes, readJson, requireSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const isForm = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/x-www-form-urlencoded";
  const response = await route(async () => {
    requireSameOrigin(request);
    let body: unknown;
    if (isForm) {
      const fields = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 8 * 1024)));
      if ([...fields.keys()].some((key) => fields.getAll(key).length !== 1)) {
        throw new HttpError(400, "登录信息包含重复字段。");
      }
      body = Object.fromEntries(fields);
    } else {
      body = await readJson(request, 8 * 1024);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "请填写邮箱和密码。");
    }
    const fields = body as Record<string, unknown>;
    if (Object.keys(fields).some((key) => key !== "email" && key !== "password")) {
      throw new HttpError(400, "登录信息包含不支持的字段。");
    }
    if (typeof fields.email !== "string" || typeof fields.password !== "string") {
      throw new HttpError(400, "请填写邮箱和密码。");
    }
    const email = fields.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Buffer.byteLength(fields.password, "utf8") > 1024) {
      throw new HttpError(400, "邮箱或密码格式不正确。");
    }
    await signIn(email, fields.password);
    return isForm
      ? new Response(null, { status: 303, headers: { Location: "/admin", "Cache-Control": "no-store" } })
      : Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  });
  // Native form submissions work before hydration and with JavaScript disabled.
  // Only a fixed error code is returned in the URL, never credentials or user input.
  if (isForm && response.status >= 400 && response.status !== 403) {
    return new Response(null, { status: 303, headers: { Location: "/login?error=sign-in-failed", "Cache-Control": "no-store" } });
  }
  return response;
}
