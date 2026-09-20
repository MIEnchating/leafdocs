import { z } from "zod";
import { HttpError } from "./http";

export const documentId = z.string().min(1).max(128);
export const versionBody = z.object({ version: z.number().int().positive() }).strict();
export const titleValue = z.string().trim().min(1, "请输入文档标题。").max(160, "标题最多 160 个字符。");
export const slugValue = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "文档地址只能使用小写英文字母、数字和连字符。");
const parentValue = documentId.nullable();

const blockTypes = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "image", "video", "audio", "file", "divider", "quote"]);
const styleTypes = new Set(["bold", "italic", "underline", "strike", "code", "textColor", "backgroundColor"]);
const colorValues = new Set(["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function fail(): never {
  throw new HttpError(400, "文档内容格式不正确或超出大小限制。");
}

// Only documented protocols can reach either the editor or public renderer.
export function safeUrl(value: unknown, image = false): boolean {
  if (typeof value !== "string" || value.length > 4096) return false;
  if (value === "" && image) return true;
  if (value.startsWith("/api/uploads/") && /^\/api\/uploads\/[a-f0-9]{48}\.(png|jpg|webp|gif)$/.test(value)) return true;
  if (!image && (/^\/(?!\/)[^\\\x00-\x20]*$/.test(value) || /^#[^\x00-\x20]*$/.test(value))) return true;
  try {
    const url = new URL(value);
    return image ? url.protocol === "https:" : ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateContent(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail();
  if (JSON.stringify(value).length > 1_500_000) fail();
  let count = 0;
  function styles(value: unknown) {
    if (value === undefined) return;
    if (!object(value)) fail();
    for (const [key, item] of Object.entries(value)) {
      if (!styleTypes.has(key)) fail();
      if (key === "textColor" || key === "backgroundColor") {
        if (typeof item !== "string" || !colorValues.has(item)) fail();
      } else if (typeof item !== "boolean") fail();
    }
  }
  function inline(value: unknown, depth = 0): void {
    if (typeof value === "string") return;
    if (!Array.isArray(value) || depth > 10 || value.length > 10000) fail();
    for (const part of value) {
      if (!object(part)) fail();
      if (part.type === "text") {
        if (typeof part.text !== "string") fail();
        styles(part.styles);
      } else if (part.type === "link") {
        if (!safeUrl(part.href)) fail();
        inline(part.content, depth + 1);
      } else fail();
    }
  }
  function blocks(value: unknown[], depth: number) {
    if (depth > 12) fail();
    for (const block of value) {
      count += 1;
      if (count > 2000 || !object(block) || typeof block.type !== "string" || !blockTypes.has(block.type)) fail();
      if (block.id !== undefined && (typeof block.id !== "string" || block.id.length > 128)) fail();
      if (block.props !== undefined) {
        if (!object(block.props)) fail();
        for (const [key, item] of Object.entries(block.props)) {
          if (["url", "href"].includes(key) && !safeUrl(item, true)) fail();
          if (!["string", "number", "boolean"].includes(typeof item) && item !== null) fail();
          if (typeof item === "string" && item.length > 10000) fail();
          if (typeof item === "number" && !Number.isFinite(item)) fail();
        }
        if (block.type === "heading" && block.props.level !== undefined && ![1, 2, 3, 4, 5, 6].includes(block.props.level as number)) fail();
      }
      if (block.type === "table") {
        const table = block.content;
        if (!object(table) || table.type !== "tableContent" || !Array.isArray(table.rows) || table.rows.length > 200) fail();
        for (const row of table.rows) {
          if (!object(row) || !Array.isArray(row.cells) || row.cells.length > 30) fail();
          for (const cell of row.cells) {
            if (object(cell) && cell.type === "tableCell") inline(cell.content);
            else inline(cell);
          }
        }
      } else if (block.content !== undefined) inline(block.content);
      if (block.children !== undefined) {
        if (!Array.isArray(block.children)) fail();
        blocks(block.children, depth + 1);
      }
    }
  }
  blocks(value, 0);
  return value;
}

export const createBody = z.object({ title: titleValue.optional(), parentId: parentValue.optional() }).strict();
export const patchBody = z.object({
  version: z.number().int().positive(),
  title: titleValue.optional(),
  slug: slugValue.optional(),
  icon: z.string().min(1).max(32).optional(),
  content: z.unknown().transform((value) => validateContent(value)).optional(),
  parentId: parentValue.optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
}).strict();
export const restoreBody = z.object({ revisionId: documentId, version: z.number().int().positive() }).strict();

export function contentText(content: unknown): string {
  const text: string[] = [];
  function visit(value: unknown) {
    if (typeof value === "string") { text.push(value); return; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!object(value)) return;
    if (value.type === "text" && typeof value.text === "string") text.push(value.text);
    if (value.content) visit(value.content);
    if (value.children) visit(value.children);
    if (value.rows) visit(value.rows);
    if (value.cells) visit(value.cells);
    if (object(value.props) && typeof value.props.caption === "string") text.push(value.props.caption);
  }
  visit(content);
  return text.join(" ").replace(/\s+/g, " ").trim().slice(0, 500_000);
}
