import type { PartialBlock } from "@blocknote/core";
import type { DocumentDetail } from "@/lib/types";
import { MAX_TRANSFER_BYTES, MAX_TRANSFER_DOCUMENTS, type DocumentArchive } from "@/lib/transfer";

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(inlineText).join("");
  if (value && typeof value === "object") {
    const part = value as { text?: string; content?: unknown };
    return part.text ?? inlineText(part.content);
  }
  return "";
}

export async function readImportFiles(files: File[]): Promise<DocumentArchive> {
  if (!files.length || files.length > MAX_TRANSFER_DOCUMENTS) throw new Error("请选择 1 至 200 个 Markdown 文件，或一个 JSON 文件。");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TRANSFER_BYTES) throw new Error("单次导入文件总大小不能超过 25 MB。");
  if (files.some(file => /\.json$/i.test(file.name))) {
    if (files.length !== 1) throw new Error("JSON 文件请单独导入。");
    let value;
    try { value = JSON.parse(await files[0].text()); } catch { throw new Error("JSON 文件格式不正确。"); }
    // Recover the single-document draft files provided by the older save-error action.
    if (value && Array.isArray(value.content) && typeof value.title === "string") {
      const { id, title, slug, icon, content } = value;
      value = { format: "leafdocs", version: 1, documents: [{ id, title, slug, icon, content, parentId: null, position: 0 }], assets: [] };
    }
    if (value?.format !== "leafdocs" || value?.version !== 1 || !Array.isArray(value.documents) || !value.documents.length || value.documents.length > MAX_TRANSFER_DOCUMENTS || !value.documents.every((item: unknown) => item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string")) {
      throw new Error("请选择 LeafDocs 导出的 JSON 文件（版本 1，最多 200 篇文档）。");
    }
    return value as DocumentArchive;
  }
  if (files.some(file => !/\.(md|markdown)$/i.test(file.name))) throw new Error("仅支持 .md、.markdown 或 LeafDocs JSON 文件。");
  const { BlockNoteEditor } = await import("@blocknote/core");
  const editor = BlockNoteEditor.create();
  try {
    const documents = [];
    for (const [position, file] of files.entries()) {
      let markdown = (await file.text()).replace(/^\uFEFF/, "");
      let title = file.name.replace(/\.(md|markdown)$/i, "");
      const heading = /^#[ \t]+([^\r\n]+)(?:\r?\n(?:\r?\n)?|$)/.exec(markdown);
      if (heading) { title = inlineText(editor.tryParseMarkdownToBlocks(heading[0])[0]?.content).trim(); markdown = markdown.slice(heading[0].length); }
      if (!title.trim() || title.length > 160) throw new Error("文档标题需为 1 至 160 个字符，请调整文件名或首行标题。");
      const id = crypto.randomUUID();
      const baseSlug = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 130).replace(/-$/, "") || "import";
      documents.push({ id, title, slug: `${baseSlug}-${id.slice(0, 8)}`, icon: "📄", parentId: null, position, content: editor.tryParseMarkdownToBlocks(markdown) });
    }
    return { format: "leafdocs", version: 1, documents, assets: [] };
  } finally { editor._tiptapEditor.destroy(); }
}

export async function downloadMarkdown(doc: DocumentDetail) {
  const { BlockNoteEditor } = await import("@blocknote/core");
  const editor = BlockNoteEditor.create();
  try {
    const content = JSON.parse(JSON.stringify(doc.content, (key, value) =>
      (key === "url" || key === "href") && typeof value === "string" && /^\/(?!\/)/.test(value) ? `${window.location.origin}${value}` : value,
    )) as PartialBlock[];
    const title = doc.title.replace(/[\\`*_{}[\]<>]/g, "\\$&");
    downloadFile(`${doc.slug}.md`, `# ${title}\n\n${editor.blocksToMarkdownLossy(content)}\n`, "text/markdown;charset=utf-8");
  } finally { editor._tiptapEditor.destroy(); }
}
