import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export async function route(handler: () => Promise<Response>): Promise<Response> {
  try {
    const response = await handler();
    if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    let status = 500;
    let message = "服务暂时不可用，请稍后重试。";
    if (error instanceof HttpError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      message = error.issues[0]?.message ?? "请求格式不正确。";
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        status = 409;
        message = "文档地址已被使用，请更换地址。";
      } else if (error.code === "P2003") {
        status = 409;
        message = "关联文档已发生变化，请刷新后重试。";
      } else if (error.code === "P2025") {
        status = 404;
        message = "文档不存在。";
      } else if (error.code === "P2034") {
        status = 409;
        message = "文档已被其他操作修改，请刷新后重试。";
      }
    }
    if (status === 500) console.error("Document service request failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

// Trust an explicitly configured canonical URL rather than forwarded proxy headers.
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin === "null") throw new HttpError(403, "请求来源无效，请刷新页面后重试。");
  try {
    if (new URL(origin).origin !== expected || new URL(origin).pathname !== "/") {
      throw new HttpError(403, "请求来源无效，请刷新页面后重试。");
    }
  } catch {
    throw new HttpError(403, "请求来源无效，请刷新页面后重试。");
  }
}

export async function readJson(request: Request, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "请使用 JSON 格式提交。");
  }
  const buffer = await readBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new HttpError(400, "JSON 格式不正确。");
  }
}

export async function readBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, "内容超过大小限制。");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "内容超过大小限制。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

export { HttpError as ApiError };
export const apiHandler = route;
