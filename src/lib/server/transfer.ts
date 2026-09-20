import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { HttpError } from "./http";
import { documentId, slugValue, titleValue, validateContent } from "./validation";
import { imageType, MAX_IMAGE_SIZE, serveUpload, uploadDirectory } from "./uploads";
import { MAX_TRANSFER_BYTES, MAX_TRANSFER_DOCUMENTS, type DocumentArchive, type ImportResult } from "../transfer";

const uploadUrl = /^\/api\/uploads\/([a-f0-9]{48}\.(png|jpg|gif|webp))$/;
const archiveSchema = z.object({
  format: z.literal("leafdocs"), version: z.literal(1), exportedAt: z.string().optional(),
  documents: z.array(z.object({
    id: documentId, title: titleValue, slug: slugValue, icon: z.string().min(1).max(32),
    parentId: documentId.nullable(), position: z.number().int().min(0).max(1_000_000),
    content: z.unknown().transform(validateContent),
  }).strict()).min(1).max(MAX_TRANSFER_DOCUMENTS),
  assets: z.array(z.object({ url: z.string().regex(uploadUrl), data: z.string().max(Math.ceil(MAX_IMAGE_SIZE / 3) * 4) }).strict()).max(500),
}).strict();

// Only URL fields are rewritten; literal examples inside code blocks stay intact.
function mapUrls(value: unknown, visit: (url: string) => string, depth = 0): unknown {
  if (depth > 50) throw new HttpError(400, "文档数据嵌套过深。");
  if (Array.isArray(value)) return value.map(item => mapUrls(item, visit, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    (key === "url" || key === "href") && typeof item === "string" ? visit(item) : mapUrls(item, visit, depth + 1),
  ]));
}

export async function exportDocuments(id?: string): Promise<DocumentArchive> {
  if (id) documentId.parse(id);
  const documents = await prisma.document.findMany({
    where: id ? { id } : undefined,
    select: { id: true, title: true, slug: true, icon: true, parentId: true, position: true, content: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: MAX_TRANSFER_DOCUMENTS + 1,
  });
  if (!documents.length) throw new HttpError(404, "没有可导出的文档。");
  if (documents.length > MAX_TRANSFER_DOCUMENTS) throw new HttpError(413, "单次最多导出 200 篇文档，请分篇导出。");
  const archive: DocumentArchive = {
    format: "leafdocs", version: 1, exportedAt: new Date().toISOString(),
    documents: documents.map(doc => ({ ...doc, parentId: id ? null : doc.parentId, content: doc.content as unknown[] })), assets: [],
  };
  let bytes = Buffer.byteLength(JSON.stringify(archive));
  const urls = new Set<string>();
  for (const doc of archive.documents) mapUrls(doc.content, url => { if (uploadUrl.test(url)) urls.add(url); return url; });
  for (const url of urls) {
    if (bytes > MAX_TRANSFER_BYTES) throw new HttpError(413, "导出文件超过 25 MB，请分篇导出。");
    let response: Response;
    try { response = await serveUpload(uploadUrl.exec(url)![1]); }
    catch { throw new HttpError(409, "文档引用的上传图片缺失或无法读取，请修复后重新导出。"); }
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    const asset = { url, data };
    bytes += Buffer.byteLength(JSON.stringify(asset)) + 1;
    archive.assets.push(asset);
  }
  if (bytes > MAX_TRANSFER_BYTES || archive.assets.length > 500) throw new HttpError(413, "导出文件过大，请分篇导出。");
  return archive;
}

export async function importDocuments(input: unknown): Promise<ImportResult> {
  const archive = archiveSchema.parse(input);
  const entries = new Map(archive.documents.map(doc => [doc.id, doc]));
  if (entries.size !== archive.documents.length) throw new HttpError(400, "导入文件包含重复的文档标识。");
  if (new Set(archive.documents.map(doc => doc.slug)).size !== archive.documents.length) throw new HttpError(400, "导入文件包含重复的访问路径。");
  for (const doc of archive.documents) {
    const visited = new Set([doc.id]);
    let parent = doc.parentId;
    while (parent !== null) {
      if (!entries.has(parent)) throw new HttpError(400, "导入文件缺少父文档。");
      if (visited.has(parent)) throw new HttpError(400, "导入目录不能形成循环。");
      if (visited.size >= 30) throw new HttpError(400, "导入目录最多支持 30 层。");
      visited.add(parent); parent = entries.get(parent)!.parentId;
    }
  }
  const assets = new Map<string, { data: Buffer; extension: string }>();
  for (const asset of archive.assets) {
    if (assets.has(asset.url)) throw new HttpError(400, "导入文件包含重复图片。");
    const data = Buffer.from(asset.data, "base64");
    if (!data.length || data.length > MAX_IMAGE_SIZE || data.toString("base64") !== asset.data) throw new HttpError(400, "图片编码或大小不正确。");
    const extension = uploadUrl.exec(asset.url)![2];
    if (imageType(data) !== extension) throw new HttpError(400, "图片内容与文件类型不匹配。");
    assets.set(asset.url, { data, extension });
  }
  // Every local image must be portable; fail before creating any documents or files.
  for (const doc of archive.documents) mapUrls(doc.content, url => {
    if (uploadUrl.test(url) && !assets.has(url)) throw new HttpError(400, "导入文件缺少文档引用的图片，请使用包含图片的 JSON 导出文件。");
    return url;
  });
  const createdFiles: string[] = [];
  const imageUrls = new Map<string, string>();
  try {
    if (assets.size) await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
    for (const [url, asset] of assets) {
      const filename = `${randomBytes(24).toString("hex")}.${asset.extension}`;
      const target = path.join(uploadDirectory, filename);
      await writeFile(target, asset.data, { flag: "wx", mode: 0o600 });
      createdFiles.push(target); imageUrls.set(url, `/api/uploads/${filename}`);
    }
    return await prisma.$transaction(async tx => {
      const existing = await tx.document.findMany({ select: { slug: true, publishedSlug: true } });
      const usedSlugs = new Set(existing.flatMap(doc => [doc.slug, ...(doc.publishedSlug ? [doc.publishedSlug] : [])]));
      const ids = new Map(archive.documents.map(doc => [doc.id, randomUUID()]));
      const slugs = new Map<string, string>();
      let renamed = 0;
      for (const doc of archive.documents) {
        let slug = doc.slug;
        if (usedSlugs.has(slug)) {
          renamed++;
          do { slug = `${doc.slug.slice(0, 143)}-${randomBytes(6).toString("hex")}`; } while (usedSlugs.has(slug));
        }
        usedSlugs.add(slug); slugs.set(doc.slug, slug);
      }
      const roots = await tx.document.aggregate({ where: { parentId: null }, _max: { position: true } });
      let rootPosition = (roots._max.position ?? -1) + 1;
      const documents = [...archive.documents].sort((a, b) => a.position - b.position).map(doc => ({
        id: ids.get(doc.id)!, title: doc.title, slug: slugs.get(doc.slug)!, icon: doc.icon,
        parentId: doc.parentId ? ids.get(doc.parentId)! : null,
        position: doc.parentId ? doc.position : rootPosition++,
        content: mapUrls(doc.content, url => {
          if (imageUrls.has(url)) return imageUrls.get(url)!;
          const link = /^\/docs\/([a-z0-9-]+)(#.*)?$/.exec(url);
          return link && slugs.has(link[1]) ? `/docs/${slugs.get(link[1])}${link[2] ?? ""}` : url;
        }) as Prisma.InputJsonValue,
      }));
      await tx.document.createMany({ data: documents });
      await tx.revision.createMany({ data: documents.map(doc => ({ documentId: doc.id, title: doc.title, slug: doc.slug, icon: doc.icon, content: doc.content, version: 1 })) });
      return { count: documents.length, firstId: documents[0].id, renamed };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    await Promise.allSettled(createdFiles.map(file => unlink(file)));
    throw error;
  }
}
