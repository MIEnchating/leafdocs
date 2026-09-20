import { randomBytes } from "node:crypto";
import { cache } from "react";
import { Prisma, type Document } from "@prisma/client";
import type { DocumentDetail, DocumentSummary, PublishedDocument, RevisionSummary } from "@/lib/types";
import { prisma } from "./db";
import { HttpError } from "./http";
import { contentText, createBody, patchBody, restoreBody, versionBody } from "./validation";

type Tx = Prisma.TransactionClient;
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const summarySelect = { id: true, title: true, slug: true, icon: true, parentId: true, position: true, version: true, publishedVersion: true, publishedAt: true, updatedAt: true } satisfies Prisma.DocumentSelect;
type SummaryRow = Prisma.DocumentGetPayload<{ select: typeof summarySelect }>;
function summary(doc: SummaryRow): DocumentSummary {
  return {
    id: doc.id, title: doc.title, slug: doc.slug, icon: doc.icon,
    parentId: doc.parentId, position: doc.position, version: doc.version,
    publishedVersion: doc.publishedVersion, publishedAt: doc.publishedAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function detail(doc: Document): DocumentDetail {
  return { ...summary(doc), content: doc.content as unknown[] };
}

const publishedSelect = { id: true, publishedTitle: true, publishedSlug: true, publishedIcon: true, publishedContent: true, publishedAt: true, publishedParentId: true, publishedPosition: true } satisfies Prisma.DocumentSelect;
function published(doc: Prisma.DocumentGetPayload<{ select: typeof publishedSelect }>): PublishedDocument {
  // Every reader field comes from the published snapshot, including navigation.
  return {
    id: doc.id, title: doc.publishedTitle!, slug: doc.publishedSlug!, icon: doc.publishedIcon!,
    content: doc.publishedContent as unknown[], publishedAt: doc.publishedAt!.toISOString(),
    parentId: doc.publishedParentId, position: doc.publishedPosition ?? 0,
  };
}

async function existing(tx: Tx, id: string): Promise<Document> {
  const doc = await tx.document.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "文档不存在。");
  return doc;
}

function checkVersion(doc: Document, version: number): void {
  if (doc.version !== version) throw new HttpError(409, "文档已在其他窗口更新。请保留当前修改，刷新后再编辑。");
}

async function parentAllowed(tx: Tx, parentId: string | null, id?: string): Promise<void> {
  if (!parentId) return;
  const visited = new Set(id ? [id] : []);
  let current: string | null = parentId;
  while (current) {
    if (visited.has(current)) throw new HttpError(400, "不能将文档移动到自己或自己的子文档下。");
    visited.add(current);
    const parent: { parentId: string | null } | null = await tx.document.findUnique({ where: { id: current }, select: { parentId: true } });
    if (!parent) throw new HttpError(400, "父文档不存在。");
    current = parent.parentId;
  }
}

async function recordRevision(tx: Tx, doc: Document): Promise<void> {
  await tx.revision.create({ data: {
    documentId: doc.id, title: doc.title, slug: doc.slug, icon: doc.icon,
    content: doc.content as Prisma.InputJsonValue, version: doc.version,
  } });
}

async function publishedParentAllowed(tx: Tx, parentId: string | null, id: string): Promise<void> {
  const visited = new Set([id]);
  let current = parentId;
  while (current) {
    if (visited.has(current)) throw new HttpError(409, "公开目录会形成循环，请先发布父文档的目录调整。");
    visited.add(current);
    const parent = await tx.document.findUnique({
      where: { id: current }, select: { publishedAt: true, publishedParentId: true },
    });
    if (!parent?.publishedAt) return;
    current = parent.publishedParentId;
  }
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return (await prisma.document.findMany({ select: summarySelect, orderBy: [{ position: "asc" }, { createdAt: "asc" }] })).map(summary);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  return detail(await existing(prisma, id));
}

export async function createDocument(input: unknown): Promise<DocumentDetail> {
  const data = createBody.parse(input);
  return prisma.$transaction(async (tx) => {
    await parentAllowed(tx, data.parentId ?? null);
    const position = await tx.document.aggregate({ where: { parentId: data.parentId ?? null }, _max: { position: true } });
    const doc = await tx.document.create({ data: {
      title: data.title ?? "未命名文档", slug: `untitled-${randomBytes(6).toString("hex")}`,
      parentId: data.parentId ?? null, position: (position._max.position ?? -1) + 1,
      content: [{ type: "paragraph", content: [] }],
    } });
    await recordRevision(tx, doc);
    return detail(doc);
  }, transactionOptions);
}

export async function updateDocument(id: string, input: unknown): Promise<DocumentDetail> {
  const { version, content, ...fields } = patchBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await existing(tx, id);
    checkVersion(current, version);
    if (fields.parentId !== undefined) await parentAllowed(tx, fields.parentId, id);
    const changed = await tx.document.updateMany({ where: { id, version }, data: {
      ...fields, ...(content !== undefined ? { content: content as Prisma.InputJsonValue } : {}), version: { increment: 1 },
    } });
    if (changed.count !== 1) throw new HttpError(409, "文档版本已变化，请刷新后重试。");
    const doc = await existing(tx, id);
    await recordRevision(tx, doc);
    return detail(doc);
  }, transactionOptions);
}

export async function deleteDocument(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await existing(tx, id);
    if (await tx.document.count({ where: { parentId: id } })) {
      throw new HttpError(409, "请先移动或删除子文档，再删除这篇文档。");
    }
    // Published children retain their snapshot relationship; readers render missing parents at root.
    await tx.document.delete({ where: { id } });
  }, transactionOptions);
}

export async function publishDocument(id: string, input: unknown): Promise<DocumentDetail> {
  const { version } = versionBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await existing(tx, id);
    checkVersion(current, version);
    await publishedParentAllowed(tx, current.parentId, id);
    const updated = await tx.document.updateMany({ where: { id, version }, data: {
      publishedTitle: current.title, publishedSlug: current.slug, publishedIcon: current.icon,
      publishedContent: current.content as Prisma.InputJsonValue, publishedText: contentText(current.content),
      publishedParentId: current.parentId, publishedPosition: current.position,
      publishedAt: new Date(), publishedVersion: version + 1, version: { increment: 1 },
    } });
    if (updated.count !== 1) throw new HttpError(409, "文档版本已变化，请刷新后重试。");
    const doc = await existing(tx, id);
    await recordRevision(tx, doc);
    return detail(doc);
  }, transactionOptions);
}

export async function unpublishDocument(id: string): Promise<DocumentDetail> {
  return prisma.$transaction(async (tx) => {
    await existing(tx, id);
    const doc = await tx.document.update({ where: { id }, data: {
      publishedVersion: null, publishedAt: null, publishedTitle: null, publishedSlug: null,
      publishedIcon: null, publishedContent: Prisma.DbNull, publishedText: "",
      publishedParentId: null, publishedPosition: null, version: { increment: 1 },
    } });
    await recordRevision(tx, doc);
    return detail(doc);
  }, transactionOptions);
}

export async function listRevisions(id: string): Promise<RevisionSummary[]> {
  if (!await prisma.document.findUnique({ where: { id }, select: { id: true } })) throw new HttpError(404, "文档不存在。");
  const revisions = await prisma.revision.findMany({ select: { id: true, title: true, version: true, createdAt: true }, where: { documentId: id }, orderBy: { version: "desc" }, take: 100 });
  return revisions.map((revision) => ({ id: revision.id, title: revision.title, version: revision.version, createdAt: revision.createdAt.toISOString() }));
}

export async function restoreDocument(id: string, input: unknown): Promise<DocumentDetail> {
  const { revisionId, version } = restoreBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await existing(tx, id);
    checkVersion(current, version);
    const revision = await tx.revision.findFirst({ where: { id: revisionId, documentId: id } });
    if (!revision) throw new HttpError(404, "历史版本不存在。");
    const changed = await tx.document.updateMany({ where: { id, version }, data: {
      title: revision.title, slug: revision.slug, icon: revision.icon,
      content: revision.content as Prisma.InputJsonValue, version: { increment: 1 },
    } });
    if (changed.count !== 1) throw new HttpError(409, "文档版本已变化，请刷新后重试。");
    const doc = await existing(tx, id);
    await recordRevision(tx, doc);
    return detail(doc);
  }, transactionOptions);
}

export const getPublishedDocuments = cache(async () => {
  const docs = await prisma.document.findMany({
    select: { id: true, publishedTitle: true, publishedSlug: true, publishedIcon: true, publishedParentId: true, publishedPosition: true, publishedAt: true },
    where: { publishedAt: { not: null } }, orderBy: [{ publishedPosition: "asc" }, { createdAt: "asc" }],
  });
  return docs.map(doc => ({ id: doc.id, title: doc.publishedTitle!, slug: doc.publishedSlug!, icon: doc.publishedIcon!, parentId: doc.publishedParentId, position: doc.publishedPosition ?? 0, publishedAt: doc.publishedAt!.toISOString() }));
});

export const getPublishedDocument = cache(async (slug: string): Promise<PublishedDocument | null> => {
  const doc = await prisma.document.findFirst({ select: publishedSelect, where: { publishedSlug: slug, publishedAt: { not: null } } });
  return doc ? published(doc) : null;
});

export async function searchPublishedDocuments(query: string) {
  const q = query.trim().slice(0, 120);
  if (!q) return [];
  const docs = await prisma.document.findMany({
    where: { publishedAt: { not: null }, OR: [
      { publishedTitle: { contains: q, mode: "insensitive" } },
      { publishedText: { contains: q, mode: "insensitive" } },
    ] },
    select: { id: true, publishedTitle: true, publishedSlug: true, publishedText: true },
    take: 20, orderBy: { publishedPosition: "asc" },
  });
  return docs.map((doc) => {
    const index = doc.publishedText.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
    const start = Math.max(0, index - 45);
    const excerpt = (start > 0 ? "…" : "") + doc.publishedText.slice(start, start + 160) + (doc.publishedText.length > start + 160 ? "…" : "");
    return { id: doc.id, title: doc.publishedTitle!, slug: doc.publishedSlug!, excerpt };
  });
}
