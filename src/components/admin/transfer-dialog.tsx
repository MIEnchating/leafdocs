"use client";

import { useRef, useState } from "react";
import { SurfaceDialog } from "@/components/surface-dialog";
import { LoaderCircle, X } from "@/components/icons";
import { MAX_TRANSFER_BYTES, type DocumentArchive } from "@/lib/transfer";
import { readImportFiles } from "./document-transfer";

type Props = {
  currentTitle?: string;
  onClose: () => void;
  onImport: (archive: DocumentArchive) => Promise<void>;
  onExport: (scope: "current" | "all", format: "json" | "markdown") => Promise<void>;
};

export default function TransferDialog({ currentTitle, onClose, onImport, onExport }: Props) {
  const [tab, setTab] = useState<"import" | "export">("import");
  const [archive, setArchive] = useState<DocumentArchive | null>(null);
  const [scope, setScope] = useState<"current" | "all">(currentTitle ? "current" : "all");
  const [format, setFormat] = useState<"json" | "markdown">("json");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);

  async function work(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await task(); }
    catch (error) { setError(error instanceof Error ? error.message : "操作失败，请重试。"); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <SurfaceDialog open onClose={() => { if (!busyRef.current) onClose(); }} label="导入与导出" className="transfer-dialog">
    <header className="panel-heading"><h2>导入与导出</h2><button className="admin-icon-button" aria-label="关闭导入与导出" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="transfer-tabs" role="group" aria-label="选择操作">
      <button className="ui-button" aria-pressed={tab === "import"} disabled={busy} onClick={() => { setTab("import"); setError(""); setNotice(""); }}>导入文档</button>
      <button className="ui-button" aria-pressed={tab === "export"} disabled={busy} onClick={() => { setTab("export"); setError(""); setNotice(""); }}>导出文档</button>
    </div>
    {tab === "import" ? <section className="transfer-section">
      <p>选择 Markdown 文件或 LeafDocs JSON 文件。导入后创建新草稿，确认内容后再发布。</p>
      <label className="transfer-file-label">选择文件<input aria-label="选择导入文件" type="file" accept=".md,.markdown,.json" multiple disabled={busy} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = "";
        if (!files.length) return;
        setArchive(null);
        void work(async () => { setArchive(await readImportFiles(files)); });
      }} /></label>
      <p className="transfer-help">最多 200 篇、合计 25 MB。JSON 保留目录和上传图片；Markdown 图片需使用 HTTPS 链接。</p>
      {archive && <div className="transfer-preview"><strong>将导入 {archive.documents.length} 篇文档</strong><ul>{archive.documents.map((doc, index) => <li key={index}>{doc.title}</li>)}</ul><p>不会覆盖已有文档；访问路径重名时自动生成新路径。</p></div>}
      <div className="ui-dialog-actions"><button className="ui-button ui-button-primary" disabled={busy || !archive} onClick={() => void work(async () => {
        if (new Blob([JSON.stringify(archive)]).size > MAX_TRANSFER_BYTES) throw new Error("转换后的内容超过 25 MB，请分批导入。");
        await onImport(archive!);
      })}>{busy ? <><LoaderCircle size={15} className="admin-spin" /> 正在处理…</> : "导入为草稿"}</button></div>
    </section> : <section className="transfer-section">
      <label>导出范围<select aria-label="导出范围" value={scope} disabled={busy} onChange={event => { const next = event.target.value as "current" | "all"; setScope(next); if (next === "all") setFormat("json"); }}>
        {currentTitle && <option value="current">当前文档 · {currentTitle}</option>}<option value="all">全部文档</option>
      </select></label>
      <label>文件格式<select aria-label="导出格式" value={format} disabled={busy} onChange={event => setFormat(event.target.value as "json" | "markdown")}>
        <option value="json">JSON · 保留目录、块数据和图片</option>{scope === "current" && <option value="markdown">Markdown · 通用文档格式</option>}
      </select></label>
      <p>{format === "json" ? "导出当前草稿内容与上传图片，不包含账号、站点设置、发布快照或历史版本。" : "导出当前草稿为 Markdown。部分块样式会简化，图片以当前站点的链接引用。"}</p>
      <div className="ui-dialog-actions"><button className="ui-button ui-button-primary" disabled={busy} onClick={() => void work(async () => { await onExport(scope, format); setNotice("导出文件已准备好，请查看浏览器下载。"); })}>{busy ? <><LoaderCircle size={15} className="admin-spin" /> 正在导出…</> : "导出并下载"}</button></div>
    </section>}
    {error && <p className="ui-form-error" role="alert">{error}</p>}
    {notice && <p className="transfer-help" role="status">{notice}</p>}
  </SurfaceDialog>;
}
