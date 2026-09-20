"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, FileText, LoaderCircle, Palette, Search, X } from "@/components/icons";
import { DocumentIcon } from "./document-icon";
import { Brand } from "./brand";
import { SurfaceDialog } from "./surface-dialog";
import { ScrollArea } from "./scroll-area";
import { useTheme } from "./theme-provider";
import { siteThemes } from "@/lib/themes";
import { indexDocumentTree } from "@/lib/document-tree";
import { MotionRegion } from "./ui/motion-region";
import type { PublishedDocument } from "@/lib/types";

type NavDoc = Pick<PublishedDocument, "id" | "title" | "slug" | "icon" | "parentId" | "position">;
type SearchResult = { id: string; title: string; slug: string; excerpt: string };

function NavigationIcon({ icon }: { icon: string }) {
  const { pending } = useLinkStatus();
  return <span className="nav-doc-icon" data-navigation-pending={pending} role={pending ? "status" : undefined} aria-label={pending ? "正在打开文档" : undefined}>{pending ? <LoaderCircle size={17} className="navigation-spinner" /> : <DocumentIcon icon={icon} />}</span>;
}

export function PublicShell({ documents, children }: { documents: NavDoc[]; children: React.ReactNode }) {
  const router = useRouter();
  const treeIndex = useMemo(() => indexDocumentTree(documents), [documents]);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const { siteTheme, codeTheme, setSiteTheme, setCodeTheme, preferencesReady } = useTheme();
  const [keyboardSearch, setKeyboardSearch] = useState(false);
  const previousPath = useRef(pathname);
  const mainRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const hash = window.location.hash.slice(1);
    let target: HTMLElement | null = null;
    try { target = hash ? document.getElementById(decodeURIComponent(hash)) : null; } catch { /* Ignore malformed fragment identifiers. */ }
    if (target && main.contains(target)) target.scrollIntoView({ behavior: "instant", block: "start" });
    else main.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setMobileOpen(false); setSearchOpen(false); setThemeOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setKeyboardSearch(true); setMobileOpen(false); setThemeOpen(false); setSearchOpen(value => !value); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const closeMobile = () => { if (query.matches) setMobileOpen(false); };
    query.addEventListener("change", closeMobile);
    return () => query.removeEventListener("change", closeMobile);
  }, []);

  function openSearch() {
    setKeyboardSearch(false);
    setMobileOpen(false);
    setThemeOpen(false);
    setSearchOpen(true);
  }
  useEffect(() => {
    if (!searchOpen) return;
    const controller = new AbortController();
    if (!query.trim()) { setResults([]); setLoading(false); setError(""); return () => controller.abort(); }
    setLoading(true); setResults([]); setError("");
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("搜索暂时不可用，请稍后重试。");
        const data = await response.json();
        if (!controller.signal.aborted) setResults(data);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "搜索失败");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchOpen]);

  function tree(parentId: string | null, depth = 0): React.ReactNode {
    return (treeIndex.get(parentId) ?? []).map((doc, index) => <div key={doc.id} style={{ "--nav-index": Math.min(index, 5) } as CSSProperties}>
      <Link href={`/docs/${doc.slug}`} prefetch={false} onMouseEnter={() => router.prefetch(`/docs/${doc.slug}`)} onFocus={() => router.prefetch(`/docs/${doc.slug}`)} onClick={() => setMobileOpen(false)} className={`sidebar-link ${pathname === `/docs/${doc.slug}` ? "active" : ""}`} style={{ paddingLeft: 12 + Math.min(depth, 5) * 14 }} aria-current={pathname === `/docs/${doc.slug}` ? "page" : undefined}>
        <NavigationIcon icon={doc.icon} /><span>{doc.title}</span>
      </Link>
      {depth < 64 && tree(doc.id, depth + 1)}
    </div>);
  }

  const directory = <>
    <button className="search-trigger" disabled={!preferencesReady} onClick={openSearch}><Search size={17} /><span>搜索文档…</span><kbd>⌘ K</kbd></button>
    <Link href="/" onClick={() => setMobileOpen(false)} className={`sidebar-link overview-link ${pathname === "/" ? "active" : ""}`}><BookOpen size={18} weight="regular" /><span>文档概览</span></Link>
    <div className="sidebar-section-label">使用指南</div><nav className="document-nav" aria-label="文档目录">{tree(null)}</nav>
  </>;

  return <div className="public-app"><a className="skip-link" href="#main-content">跳转到正文</a>
    <header className="site-header"><div className="header-brand">
      <button className="icon-button mobile-menu" disabled={!preferencesReady} aria-label="打开文档目录" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><span className={`menu-glyph ${mobileOpen ? "is-open" : ""}`} aria-hidden="true"><i /><i /></span></button><Brand />
    </div>
      <div className="header-actions"><button className="theme-trigger" disabled={!preferencesReady} aria-label="切换主题" aria-expanded={themeOpen} onClick={() => setThemeOpen(value => !value)}><Palette size={18} /><span>外观</span></button><Link href="/admin" className="header-manage">工作台 <span className="button-orb"><ArrowUpRight size={15} /></span></Link></div>
    </header>
    <aside className="public-sidebar">{directory}</aside>
    <main ref={mainRef} className="public-main" id="main-content"><MotionRegion motionKey={pathname}>{children}</MotionRegion></main>

    <SurfaceDialog open={mobileOpen} onClose={() => setMobileOpen(false)} label="浏览文档目录" className="mobile-nav-dialog">
      <div className="mobile-nav-heading"><Brand /><button className="icon-button" aria-label="关闭文档目录" onClick={() => setMobileOpen(false)}><span className="menu-glyph is-open" aria-hidden="true"><i /><i /></span></button></div>
      <div className="mobile-nav-content"><h2>文档目录</h2>{directory}</div>
      <Link className="mobile-nav-workspace" href="/admin" onClick={() => setMobileOpen(false)}>进入文档工作台 <ArrowUpRight size={20} /></Link>
    </SurfaceDialog>

    <SurfaceDialog open={themeOpen} onClose={() => setThemeOpen(false)} label="主题选择" className="theme-dialog">
      <div className="panel-heading"><span>阅读外观</span><button className="icon-button" aria-label="关闭主题选择" onClick={() => setThemeOpen(false)}><X size={17} /></button></div>
      <div className="theme-picker-title">网站风格</div><div className="theme-options">{siteThemes.map(([value, label, hint]) => <button key={value} aria-pressed={siteTheme === value} className={`theme-option ${siteTheme === value ? "selected" : ""}`} onClick={() => { setSiteTheme(value); setCodeTheme("auto"); }}><span className={`theme-swatch swatch-${value}`} aria-hidden="true" /><span><strong>{label}</strong><small>{hint}</small></span>{siteTheme === value && <span className="theme-check" aria-hidden="true">✓</span>}</button>)}</div>
      <div className="theme-picker-title code-title">代码块风格</div><div className="theme-options code-options">{([["auto", "跟随主题", "自动匹配"], ["paper", "纸白", "GitHub Light"], ["forest", "深墨", "GitHub Dark"], ["midnight", "炭黑", "Min Dark"]] as const).map(([value, label, hint]) => <button key={value} aria-pressed={codeTheme === value} className={`code-option code-option-${value} ${codeTheme === value ? "selected" : ""}`} onClick={() => setCodeTheme(value)}><span className="code-option-dot" aria-hidden="true" /><span><strong>{label}</strong><small>{hint}</small></span>{codeTheme === value && <span className="theme-check" aria-hidden="true">✓</span>}</button>)}</div><p className="theme-picker-note">切换网站风格时，代码配色会同步。偏好自动保存。</p>
    </SurfaceDialog>

    <SurfaceDialog open={searchOpen} onClose={() => setSearchOpen(false)} label="搜索文档" className="search-dialog" instant={keyboardSearch}>
      <div className="search-dialog-input"><Search size={20} /><input aria-label="搜索文档" autoFocus placeholder="搜索标题或文档内容…" value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}><X size={18} /></button></div>
      <ScrollArea className="search-results" orientation="vertical" aria-live="polite">{loading ? <p className="search-message">正在搜索…</p> : error ? <p role="alert" className="search-message">{error}</p> : results.length ? results.map(result => <Link key={result.id} href={`/docs/${result.slug}`} onClick={() => setSearchOpen(false)}><FileText size={18} /><div><strong>{result.title}</strong><p>{result.excerpt}</p></div><ChevronRight size={16} /></Link>) : <p className="search-message">{query ? "没有找到相关文档，换个关键词试试。" : "输入关键词，开始探索文档。"}</p>}</ScrollArea>
      <div className="search-dialog-footer">搜索已发布的文档 <kbd>ESC 关闭</kbd></div>
    </SurfaceDialog>
  </div>;
}
