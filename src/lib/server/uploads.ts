import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError, readBytes } from "./http";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const uploadDirectory = path.resolve(process.cwd(), ".data/uploads");
const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export function imageType(bytes: Uint8Array): keyof typeof mimeTypes | null {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.subarray(12, 16).toString("ascii") === "IHDR") return "png";
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9) return "jpg";
  if (b.length >= 13 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii"))) return "gif";
  if (b.length >= 16 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(b.subarray(12, 16).toString("ascii"))) return "webp";
  return null;
}

export async function saveUpload(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new HttpError(415, "请使用文件上传表单。");
  const bytes = await readBytes(request, MAX_IMAGE_SIZE + 64 * 1024);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new HttpError(400, "上传表单不正确。");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "请选择图片文件。");
  if (!file.size || file.size > MAX_IMAGE_SIZE) throw new HttpError(413, "图片大小需在 5 MB 以内。");
  const image = new Uint8Array(await file.arrayBuffer());
  const extension = imageType(image);
  if (!extension) throw new HttpError(415, "仅支持 PNG、JPEG、WebP 和 GIF 图片。");
  const filename = `${randomBytes(24).toString("hex")}.${extension}`;
  await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadDirectory, filename), image, { flag: "wx", mode: 0o600 });
  return `/api/uploads/${filename}`;
}

export async function serveUpload(filename: string): Promise<Response> {
  const match = /^([a-f0-9]{48})\.(png|jpg|webp|gif)$/.exec(filename);
  if (!match) throw new HttpError(404, "图片不存在。");
  let bytes: Buffer;
  try { bytes = await readFile(path.join(uploadDirectory, filename)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "图片不存在。");
    throw error;
  }
  if (imageType(bytes) !== match[2]) throw new HttpError(404, "图片不存在。");
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": mimeTypes[match[2]],
    "Content-Length": String(bytes.length),
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "public, max-age=31536000, immutable",
  } });
}
