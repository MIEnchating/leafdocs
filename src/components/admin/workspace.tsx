"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Clock3, Ellipsis, Eye, FileText, History, LoaderCircle, LogOut, Menu, PanelLeftClose, Plus, Search, Send, Settings2, Trash2, Undo2, X } from "@/components/icons";
import { SurfaceDialog } from "@/components/surface-dialog";
import { DocumentIcon } from "@/components/document-icon";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { IconPicker } from "@/components/ui/icon-picker";
import { Collapsible, MotionRegion } from "@/components/ui/motion-region";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useSiteSettings } from "@/components/site-provider";
import { SiteSettingsDialog } from "./site-settings-dialog";
import { descendantIds, indexDocumentTree } from "@/lib/document-tree";
import type { DocumentDetail, DocumentSummary, RevisionSummary } from "@/lib/types";
import type { DocumentArchive, ImportResult } from "@/lib/transfer";

const TransferDialog = dynamic(() => import("./transfer-dialog"), { ssr: false });

const DocumentContent = dynamic(() => import("@/components/document-content").then(module => module.DocumentContent), { loading: () => <LoadingPlaceholder compact label="正在准备预览…" /> });

const BlockEditor = dynamic(() => import("./block-editor"), {
  ssr: false,
  loading: () => <LoadingPlaceholder compact label="正在准备编辑器…" />,
});

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    signal: method === "GET" ? AbortSignal.timeout(20_000) : undefined,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "操作失败，请重试", response.status);
  return data as T;
}

function friendlyDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}


function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object") {
    const node = value as { text?: string; content?: unknown; children?: unknown; rows?: unknown; cells?: unknown };
    return (node.text || textContent(node.content)) + textContent(node.children) + textContent(node.rows) + textContent(node.cells);
  }
  return "";
}

function outlineFrom(content: unknown[]) {
  const entries: { id: string; text: string; level: number }[] = [];
  const walk = (blocks: unknown[]) => blocks.forEach(value => {
    const block = value as { id: string; type: string; props?: { level?: number }; content?: unknown; children?: unknown[] };
    if (block.type === "heading") entries.push({ id: block.id, text: textContent(block.content), level: block.props?.level || 1 });
    if (block.children) walk(block.children);
  });
  walk(content);
  return entries;
}

type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export default function AdminWorkspace() {
  const params = useParams<{ document?: string[] }>();
  const initialId = params.document?.[0];
  const router = useRouter();
  const site = useSiteSettings();
  const confirm = useConfirm();
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [operation, setAction] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const action = operation || navigating;
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [preview, setPreview] = useState<DocumentDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const documentRef = useRef<DocumentDetail | null>(null);
  const savedDocumentRef = useRef<DocumentDetail | null>(null);
  const changeSeq = useRef(0);
  const savedSeq = useRef(0);
  const conflict = useRef(false);
  const savePromise = useRef<Promise<void> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const actionRef = useRef(false);
  const historySequence = useRef(0);
  const listRef = useRef<DocumentSummary[] | null>(null);
  const navigationRequest = useRef<{ id: string; promise: Promise<DocumentDetail> } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const resizeTitle = useCallback(() => {
    const title = titleRef.current;
    if (title) { title.style.height = "auto"; title.style.height = `${title.scrollHeight}px`; }
  }, []);
  useLayoutEffect(resizeTitle, [document?.title, loading, resizeTitle]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 641px)");
    const close = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener("change", close);
    window.addEventListener("resize", resizeTitle);
    return () => { desktop.removeEventListener("change", close); window.removeEventListener("resize", resizeTitle); };
  }, [resizeTitle]);

  const updateSummary = useCallback((value: DocumentSummary) => {
    const { id, title, slug, icon, parentId, position, version, publishedAt, publishedVersion, updatedAt } = value;
    const summary = { id, title, slug, icon, parentId, position, version, publishedAt, publishedVersion, updatedAt };
    setDocuments(previous => {
      const next = previous.some(item => item.id === id) ? previous.map(item => item.id === id ? summary : item) : [...previous, summary];
      listRef.current = next;
      return next;
    });
  }, []);

  const adoptDocument = useCallback((value: DocumentDetail, resetEditor = true) => {
    documentRef.current = value;
    savedDocumentRef.current = value;
    changeSeq.current = 0;
    savedSeq.current = 0;
    conflict.current = false;
    setDocument(value);
    setStatus("saved");
    setError("");
    setAuthExpired(false);
    if (resetEditor) setEditorKey(previous => previous + 1);
    updateSummary(value);
  }, [updateSummary]);

  const flush = useCallback(async (): Promise<void> => {
    if (savePromise.current) return savePromise.current;
    if (conflict.current) throw new Error("文档已在其他窗口更新。请保留你的修改，重新载入前确认内容。");
    const save = async () => {
      try {
        while (documentRef.current && changeSeq.current !== savedSeq.current) {
          const snapshot = documentRef.current;
          const sequence = changeSeq.current;
          setStatus("saving");
          const fields = ["title", "slug", "icon", "content", "parentId", "position"] as const;
          // Metadata edits should not serialize and upload the entire document again.
          const changes = Object.fromEntries(fields.filter(key => snapshot[key] !== savedDocumentRef.current?.[key]).map(key => [key, snapshot[key]]));
          const result = await api<DocumentDetail>(`/api/documents/${snapshot.id}`, "PATCH", { version: snapshot.version, ...changes });
          const latest = documentRef.current;
          if (!latest || latest.id !== snapshot.id) return;
          const merged = { ...latest, version: result.version, updatedAt: result.updatedAt, publishedAt: result.publishedAt, publishedVersion: result.publishedVersion };
          documentRef.current = merged;
          savedDocumentRef.current = snapshot;
          savedSeq.current = sequence;
          setDocument(merged);
          updateSummary(merged);
        }
        setStatus("saved");
        setError("");
        setAuthExpired(false);
      } catch (caught) {
        const isConflict = caught instanceof ApiError && caught.status === 409;
        conflict.current = isConflict;
        setStatus(isConflict ? "conflict" : "error");
        const expired = caught instanceof ApiError && caught.status === 401;
        setAuthExpired(expired);
        setError(isConflict ? "这篇文档已在其他窗口更新。你的修改仍在当前页面，请复制保留后重新载入。" : expired ? "登录已过期。请在新标签页登录，再返回这里重试保存。" : caught instanceof Error ? caught.message : "保存失败，你的修改仍保留在当前页面。");
        throw caught;
      }
    };
    const pending = save();
    savePromise.current = pending;
    try { await pending; } finally { savePromise.current = null; }
  }, [updateSummary]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadFailed(false);
      setError("");
      try {
        // A same-document reload must read the version produced by the pending save.
        if (!initialId || initialId === documentRef.current?.id) await flush();
        const pending = navigationRequest.current;
        const [list, selectedDetail] = await Promise.all([
          listRef.current ?? api<DocumentSummary[]>("/api/documents"),
          initialId ? pending?.id === initialId ? pending.promise : api<DocumentDetail>(`/api/documents/${initialId}`) : null,
          flush(),
        ]);
        const detail = selectedDetail ?? (list[0] ? await api<DocumentDetail>(`/api/documents/${list[0].id}`) : null);
        if (cancelled || sequence !== requestSequence.current) return;
        setDocuments(list);
        listRef.current = list;
        if (detail) adoptDocument(detail);
        else { setDocument(null); documentRef.current = null; }
        scrollRef.current?.scrollTo(0, 0);
      } catch (caught) {
        if (!cancelled) { setLoadFailed(true); setError(caught instanceof Error ? caught.message : "无法载入文档"); }
      } finally {
        if (!cancelled) { setLoading(false); navigationRequest.current = null; }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [initialId, adoptDocument, flush, loadAttempt]);

  useEffect(() => {
    if (action || loading || changeSeq.current === savedSeq.current || conflict.current || status === "error") return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 800);
    return () => clearTimeout(timer);
  }, [document, flush, status, action, loading]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (changeSeq.current !== savedSeq.current) { event.preventDefault(); }
    }
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void flush().catch(() => {}); }
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("keydown", keyboard); };
  }, [flush]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const edit = useCallback((patch: Partial<DocumentDetail>) => {
    if (!documentRef.current || actionRef.current) return;
    if (Object.entries(patch).every(([key, value]) => documentRef.current![key as keyof DocumentDetail] === value)) return;
    const next = { ...documentRef.current, ...patch };
    documentRef.current = next;
    changeSeq.current += 1;
    setDocument(next);
    if (Object.keys(patch).some(key => key !== "content")) updateSummary(next);
    if (!conflict.current) { setStatus(previous => previous === "error" ? "error" : "dirty"); }
  }, [updateSummary]);
  const editContent = useCallback((content: unknown[]) => edit({ content }), [edit]);

  async function run(work: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    setAction(true);
    setMoreOpen(false);
    try { await flush(); await work(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请重试"); }
    finally { actionRef.current = false; setAction(false); }
  }

  function navigate(path: string) {
    if (actionRef.current) return;
    const targetId = path.startsWith("/admin/") ? path.slice("/admin/".length) : null;
    if (targetId === documentRef.current?.id) { setSidebarOpen(false); return; }
    // Fetch the destination while saving the current draft and resolving its route.
    if (targetId) {
      const promise = api<DocumentDetail>(`/api/documents/${targetId}`);
      void promise.catch(() => {});
      navigationRequest.current = { id: targetId, promise };
    }
    void run(async () => { setSidebarOpen(false); setSettingsOpen(false); setHistoryOpen(false); startNavigation(() => router.push(path)); });
  }

  async function createDocument(parentId: string | null = null) {
    await run(async () => {
      const result = await api<DocumentDetail>("/api/documents", "POST", { title: "未命名文档", parentId });
      updateSummary(result);
      if (parentId) setCollapsed(previous => { const next = new Set(previous); next.delete(parentId); return next; });
      navigationRequest.current = { id: result.id, promise: Promise.resolve(result) };
      startNavigation(() => router.push(`/admin/${result.id}`));
      setSidebarOpen(false);
      setNotice("新文档已创建，开始写作吧");
    });
  }

  async function publish() {
    await run(async () => {
      const current = documentRef.current!;
      const result = await api<DocumentDetail>(`/api/documents/${current.id}/publish`, "POST", { version: current.version });
      adoptDocument(result, false);
      setNotice("文档已发布，读者现在可以看到最新内容");
    });
  }

  async function openPreview() {
    await run(async () => { setPreview(documentRef.current); setPreviewOpen(true); });
  }

  async function openHistory() {
    const id = documentRef.current?.id;
    if (!id) return;
    const sequence = ++historySequence.current;
    setMoreOpen(false);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setRevisions([]);
    try { const result = await api<RevisionSummary[]>(`/api/documents/${id}/revisions`); if (historySequence.current === sequence && documentRef.current?.id === id) setRevisions(result); }
    catch (caught) { if (historySequence.current === sequence) setError(caught instanceof Error ? caught.message : "无法加载历史版本"); }
    finally { if (historySequence.current === sequence) setHistoryLoading(false); }
  }

  async function restore(revision: RevisionSummary) {
    if (!await confirm({ title: "恢复历史版本？", description: `将「${revision.title}」的版本 ${revision.version} 恢复为草稿。公开文档在重新发布后更新。`, confirmLabel: "恢复草稿" })) return;
    await run(async () => {
      const current = documentRef.current!;
      adoptDocument(await api<DocumentDetail>(`/api/documents/${current.id}/restore`, "POST", { revisionId: revision.id, version: current.version }));
      setHistoryOpen(false);
      setNotice("历史版本已恢复为草稿，确认后可重新发布");
    });
  }

  async function unpublish() {
    if (!await confirm({ title: "撤下文档？", description: "访客将无法访问这篇文档，草稿仍保留在工作台。", confirmLabel: "撤下发布", danger: true })) return;
    await run(async () => {
      adoptDocument(await api<DocumentDetail>(`/api/documents/${documentRef.current!.id}/unpublish`, "POST"), false);
      setNotice("文档已撤下，草稿已保留");
    });
  }

  async function removeDocument() {
    const current = documentRef.current!;
    if (!await confirm({ title: "删除文档？", description: `「${current.title}」及其历史版本将被删除。${current.publishedAt ? "公开页面也将移除。" : ""}此操作不可撤销。`, confirmLabel: "删除文档", danger: true })) return;
    await run(async () => {
      await api(`/api/documents/${current.id}`, "DELETE");
      const remaining = documents.filter(item => item.id !== current.id);
      setDocuments(remaining);
      listRef.current = remaining;
      documentRef.current = null;
      setDocument(null);
      changeSeq.current = savedSeq.current;
      if (initialId) router.push(remaining.length ? `/admin/${remaining[0].id}` : "/admin");
      else if (remaining.length) router.push(`/admin/${remaining[0].id}`);
      setNotice("文档已删除");
    });
  }

  async function reloadDocument() {
    if (!await confirm({ title: "重新载入文档？", description: "尚未保存的修改将被放弃。请先下载草稿或复制需要保留的内容。", confirmLabel: "重新载入" })) return;
    if (actionRef.current) return;
    actionRef.current = true;
    setAction(true);
    try { if (savePromise.current) await savePromise.current.catch(() => {}); adoptDocument(await api<DocumentDetail>(`/api/documents/${documentRef.current!.id}`)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "重新载入失败"); }
    finally { actionRef.current = false; setAction(false); }
  }

  async function exportDraft() {
    const current = documentRef.current;
    if (!current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${current.slug || "document"}-draft.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function transfer(work: () => Promise<void>) {
    if (actionRef.current) throw new Error("正在处理其他操作，请稍后重试。");
    actionRef.current = true; setAction(true);
    try { await flush(); await work(); }
    finally { actionRef.current = false; setAction(false); }
  }

  async function importArchive(archive: DocumentArchive) {
    await transfer(async () => {
      const result = await api<ImportResult>("/api/documents/import", "POST", archive);
      listRef.current = null;
      setTransferOpen(false); setSidebarOpen(false);
      setNotice(`已导入 ${result.count} 篇草稿${result.renamed ? `，${result.renamed} 个重名路径已调整` : ""}`);
      startNavigation(() => router.push(`/admin/${result.firstId}`));
    });
  }

  async function exportArchive(scope: "current" | "all", format: "json" | "markdown") {
    await transfer(async () => {
      const { downloadFile, downloadMarkdown } = await import("./document-transfer");
      const current = documentRef.current;
      if (scope === "current" && !current) throw new Error("请先打开一篇文档。");
      if (format === "markdown") { await downloadMarkdown(current!); return; }
      const archive = await api<DocumentArchive>(`/api/documents/export${scope === "current" ? `?id=${encodeURIComponent(current!.id)}` : ""}`);
      downloadFile(scope === "current" ? `${current!.slug}.json` : "leafdocs-documents.json", JSON.stringify(archive), "application/json");
    });
  }

  const treeIndex = useMemo(() => indexDocumentTree(documents), [documents]);
  const childrenOf = (parentId: string | null) => treeIndex.get(parentId) ?? [];
  function tree(parentId: string | null = null, depth = 0): React.ReactNode {
    return childrenOf(parentId).map(item => {
      const hasChildren = treeIndex.has(item.id);
      const isCollapsed = collapsed.has(item.id);
      return <div key={item.id}>
        <div className={`admin-tree-row ${document?.id === item.id ? "is-active" : ""}`} style={{ paddingLeft: 12 + Math.min(depth, 5) * 14 }}>
          {hasChildren ? <button className="tree-toggle" aria-label={isCollapsed ? `展开 ${item.title}` : `折叠 ${item.title}`} aria-expanded={!isCollapsed} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="tree-toggle-space" />}
          <button className="tree-document" onMouseEnter={() => router.prefetch(`/admin/${item.id}`)} onFocus={() => router.prefetch(`/admin/${item.id}`)} onClick={() => navigate(`/admin/${item.id}`)} disabled={action} aria-current={document?.id === item.id ? "page" : undefined}><DocumentIcon icon={item.icon} /><span>{item.title || "未命名文档"}</span>{!item.publishedAt && <span className="tree-draft-dot" title="未发布" />}</button>
          <button className="tree-add" aria-label={`在 ${item.title} 下新建文档`} onClick={() => void createDocument(item.id)} disabled={action}><Plus size={13} /></button>
        </div>
        {!isCollapsed && hasChildren && tree(item.id, depth + 1)}
      </div>;
    });
  }

  const excludedParents = useMemo(() => descendantIds(treeIndex, document?.id), [treeIndex, document?.id]);
  const deferredContent = useDeferredValue(document?.content);
  const outline = useMemo(() => deferredContent ? outlineFrom(deferredContent) : [], [deferredContent]);
  const wordCount = useMemo(() => textContent(deferredContent).replace(/\s/g, "").length.toLocaleString(), [deferredContent]);
  const publishedClean = !!document?.publishedAt && document.publishedVersion === document.version && status === "saved";
  const saveLabel = status === "saved" ? "所有更改已保存" : status === "saving" ? "正在保存…" : status === "dirty" ? "等待保存…" : status === "conflict" ? "版本冲突" : "保存失败";

  const sidebar = <>
        <button className="admin-brand" onClick={() => navigate("/")} title={site.title}><span className="brand-mark" aria-hidden="true"><DocumentIcon icon={site.icon} size={23} /></span><strong>{site.title}</strong></button>
        <div className="workspace-switch"><span className="workspace-symbol"><BookOpen size={17} /></span><div><strong>文档工作台</strong><small>编辑、整理与发布</small></div><button className="admin-icon-button mobile-only" aria-label="收起导航" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={17} /></button></div>
        <label className="admin-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="查找文档…" aria-label="查找工作台文档" />{query && <button className="admin-icon-button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={13} /></button>}</label>
        <div className="admin-tree-label"><span>知识库</span><button className="admin-icon-button" aria-label="新建文档" title="新建文档" disabled={action} onClick={() => void createDocument()}><Plus size={16} /></button></div>
        <nav className="admin-tree" aria-label="文档目录">
          {query ? documents.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(item => <div className={`admin-tree-row ${document?.id === item.id ? "is-active" : ""}`} key={item.id}><button className="tree-document" disabled={action} onClick={() => { setQuery(""); navigate(`/admin/${item.id}`); }}><DocumentIcon icon={item.icon} /><span>{item.title}</span></button></div>) : tree()}
          {query && !documents.some(item => item.title.toLowerCase().includes(query.toLowerCase())) && <p className="tree-empty">没有找到相关文档</p>}
          {!loading && !documents.length && <p className="tree-empty">从第一篇文档开始。</p>}
          <button className="admin-new-document" disabled={action} onClick={() => void createDocument()}><Plus size={16} /> 新建文档</button>
        </nav>
        <div className="admin-sidebar-bottom"><button onClick={() => { setSidebarOpen(false); setTransferOpen(true); }} disabled={action || loading}><FileText size={15} /> 导入与导出</button><button onClick={() => { setSidebarOpen(false); setSiteSettingsOpen(true); }} disabled={action}><Settings2 size={15} /> 站点设置</button><button onClick={() => navigate("/")} disabled={action}><ArrowUpRight size={15} /> 访问文档站</button><button onClick={() => void run(async () => { await api("/api/auth/logout", "POST"); router.push("/login"); router.refresh(); })} disabled={action}><LogOut size={14} /> 退出登录</button></div>
      </>;

  return (
    <div className="admin-workspace">
      <aside className="admin-sidebar admin-desktop-sidebar">{sidebar}</aside>
      <SurfaceDialog open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="工作台文档导航" className="admin-nav-dialog"><aside className="admin-sidebar">{sidebar}</aside></SurfaceDialog>

      <main className="admin-main">
        <header className="admin-toolbar">
          <div className="admin-breadcrumb"><button className="admin-icon-button mobile-only" aria-label="打开文档导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span className="breadcrumb-workspace">工作台</span><ChevronRight className="breadcrumb-workspace" size={13} /><span>{document?.title || "文档"}</span></div>
          <div className="admin-toolbar-actions">
            <span className={`admin-save-state is-${status}`} role="status" aria-label={loading || navigating ? "正在打开文档…" : saveLabel} title={loading || navigating ? "正在打开文档…" : saveLabel}>{loading || navigating || status === "saving" ? <LoaderCircle size={14} className="admin-spin" /> : status === "error" || status === "conflict" ? <CircleAlert size={14} /> : status === "dirty" ? <Clock3 size={14} /> : <CheckCheck size={15} />}<span>{loading || navigating ? "正在打开文档…" : saveLabel}</span></span>
            <button className="admin-button admin-preview-button" aria-label="预览" disabled={!document || action || loading || loadFailed} onClick={() => void openPreview()}><Eye size={15} /><span>预览</span></button>
            <button className="admin-button admin-button-primary" disabled={!document || action || loading || loadFailed || publishedClean} onClick={() => void publish()}>{action ? <LoaderCircle className="admin-spin" size={14} /> : publishedClean ? <Check size={14} /> : <Send size={14} />}<span>{publishedClean ? "已发布" : document?.publishedAt ? "发布更新" : "发布"}</span></button>
            <DropdownMenu label="文档操作" open={moreOpen} onOpenChange={setMoreOpen}
              trigger={<button className="admin-icon-button" aria-label="更多文档操作" title="更多文档操作" disabled={!document || action || loading || loadFailed}><Ellipsis size={20} /></button>}
              items={[
                { id: "settings", label: "页面设置", icon: <Settings2 size={16} />, onSelect: () => setSettingsOpen(value => !value) },
                { id: "history", label: "历史版本", icon: <History size={16} />, onSelect: () => void openHistory() },
                { id: "transfer", label: "导入与导出", icon: <FileText size={16} />, onSelect: () => setTransferOpen(true) },
                { id: "create", label: "新建子文档", icon: <Plus size={16} />, onSelect: () => void createDocument(document!.id) },
                ...(document?.publishedAt ? [{ id: "unpublish", label: "撤下发布", icon: <Undo2 size={16} />, onSelect: () => void unpublish() }] : []),
                { id: "delete", label: "删除文档", icon: <Trash2 size={16} />, danger: true, onSelect: () => void removeDocument() },
              ]} />
          </div>
        </header>

        {error && <div className="admin-error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span>{status === "conflict" ? <><button onClick={() => void exportDraft()}>下载当前草稿</button><button onClick={() => void reloadDocument()}>重新载入</button></> : status === "error" ? <>{authExpired && <a href="/login" target="_blank" rel="noreferrer">重新登录</a>}<button onClick={() => void flush().catch(() => {})}>重试保存</button><button onClick={() => void exportDraft()}>下载当前草稿</button></> : loadFailed ? <button onClick={() => setLoadAttempt(value => value + 1)}>重试加载</button> : <button aria-label="关闭提示" onClick={() => setError("")}><X size={15} /></button>}</div>}

        <div className="admin-editor-scroll" ref={scrollRef} aria-busy={loading || navigating}>
          {loading && !document ? <div className="editor-paper"><LoadingPlaceholder label="正在打开文档…" /></div> : loadFailed && !document ? <div className="admin-empty"><CircleAlert size={32} /><h1>文档未能加载</h1><p>请检查连接后重试。</p><button className="admin-button" onClick={() => setLoadAttempt(value => value + 1)}>重新加载文档</button></div> : !document ? <div className="admin-empty"><BookOpen size={38} /><h1>创建第一篇文档</h1><p>新建第一篇文档，让团队的经验有处可寻。</p><button className="admin-button admin-button-primary" disabled={action} onClick={() => void createDocument()}><Plus size={16} /> 新建文档</button></div> : <>
            <MotionRegion motionKey={document.id} className="editor-paper">
              <div className="editor-document-meta"><span className={`admin-publication-badge ${document.publishedAt ? "is-published" : ""}`}><span />{document.publishedAt ? publishedClean ? "已发布" : "有更新待发布" : "草稿"}</span><span>更新于 {friendlyDate(document.updatedAt)}</span></div>
              <div className="editor-title-row"><IconPicker value={document.icon} onChange={icon => edit({ icon })} disabled={action || loading || loadFailed} /><textarea ref={titleRef} rows={1} className="editor-title" aria-label="文档标题" placeholder="未命名文档" value={document.title} onChange={event => edit({ title: event.target.value.replace(/[\r\n]/g, " ") })} disabled={action || loading || loadFailed} maxLength={160} /></div>
              <div className="editor-submeta"><button disabled={action || loading || loadFailed} className={settingsOpen ? "is-selected" : ""} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={13} /> 页面设置</button><span>·</span><button disabled={action || loading || loadFailed} onClick={() => void openHistory()}><History size={13} /> 历史版本</button><span className="editor-word-count">{wordCount} 字</span></div>
              <Collapsible open={settingsOpen}><div className="editor-settings"><label>访问路径<span className="slug-input"><span>/docs/</span><input value={document.slug} onChange={event => edit({ slug: event.target.value })} disabled={action || loading || loadFailed} aria-label="访问路径" /></span></label><label>所属目录<Select label="所属目录" value={document.parentId || "root"} onChange={value => edit({ parentId: value === "root" ? null : value })} disabled={action || loading || loadFailed} options={[{ value: "root", label: "知识库（顶层）" }, ...documents.filter(item => !excludedParents.has(item.id)).map(item => ({ value: item.id, label: item.title, icon: <DocumentIcon icon={item.icon} /> }))]} /></label></div></Collapsible>
              <div className={`admin-block-editor ${action ? "is-busy" : ""}`} aria-busy={action || loading}><BlockEditor key={`${document.id}-${editorKey}`} content={document.content} onChange={editContent} onError={setError} editable={!action && !loading && !loadFailed} /></div>
            </MotionRegion>
            <aside className="editor-outline"><span>本文目录</span>{outline.length ? outline.map((item, index) => <button key={item.id || `heading-${index}`} style={{ paddingLeft: (item.level - 1) * 12 }} onClick={() => { const element = scrollRef.current?.querySelector(`[data-id="${CSS.escape(item.id)}"]`); element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}>{item.text || "未命名标题"}</button>) : <p>添加标题后，<br />在这里快速定位内容。</p>}<div className="editor-outline-tip"><BookOpen size={16} /><p>草稿自动保存，<br />发布后读者可见。</p></div></aside>
          </>}
        </div>
        <footer className="admin-statusbar"><span><span className="statusbar-dot" /> 文档工作台</span><span>{document ? `版本 ${document.version} · ${saveLabel}` : "为清晰的表达留一个位置"}</span></footer>
      </main>

      {notice && <div className="admin-toast" role="status"><Check size={16} />{notice}</div>}
      <SiteSettingsDialog open={siteSettingsOpen} onClose={() => setSiteSettingsOpen(false)} />
      {transferOpen && <TransferDialog currentTitle={document?.title} onClose={() => setTransferOpen(false)} onImport={importArchive} onExport={exportArchive} />}
      <SurfaceDialog open={previewOpen} onClose={() => setPreviewOpen(false)} label="草稿预览" className="preview-dialog">{previewOpen && preview && <section className="admin-preview-modal"><header><div><Eye size={17} /><strong>草稿预览</strong><span>仅你可见</span></div><button className="admin-icon-button" aria-label="关闭预览" onClick={() => setPreviewOpen(false)} autoFocus><X size={21} /></button></header><div className="preview-scroll"><article className="preview-article"><span className="admin-eyebrow">{site.title}</span><h1><DocumentIcon icon={preview.icon} size={30} /><span>{preview.title}</span></h1><DocumentContent content={preview.content} /></article></div></section>}</SurfaceDialog>
      <SurfaceDialog open={historyOpen} onClose={() => setHistoryOpen(false)} label="历史版本" className="history-dialog"><section className="admin-history-panel"><header><div><History size={19} /><h2>历史版本</h2></div><button className="admin-icon-button" aria-label="关闭历史版本" onClick={() => setHistoryOpen(false)} autoFocus><X size={20} /></button></header><p>恢复历史内容到草稿，确认后再发布。</p>{historyLoading ? <div className="editor-loading"><LoaderCircle className="admin-spin" size={18} /> 加载中…</div> : revisions.length ? <ol className="admin-revisions">{revisions.map(revision => <li key={revision.id}><span className="revision-dot" /><div><strong>{revision.title}</strong><span>{friendlyDate(revision.createdAt)}</span><small>版本 {revision.version}</small></div><button className="admin-button" onClick={() => void restore(revision)} disabled={action}><Undo2 size={13} /> 恢复</button></li>)}</ol> : <div className="history-empty"><History size={28} /><p>暂时没有历史版本</p><span>保存或发布后，可以在这里查看。</span></div>}</section></SurfaceDialog>
    </div>
  );
}
