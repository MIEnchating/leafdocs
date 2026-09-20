"use client";

import { Check, Clipboard } from "@/components/icons";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ScrollArea } from "./scroll-area";
import { useTheme } from "./theme-provider";
import { resolveCodeTheme } from "@/lib/themes";
import "./code-block.css";

const ShikiHighlighter = lazy(() => import("react-shiki"));

function PlainCode({ code }: { code: string }) {
  const lines = code.split("\n");
  return <div className="code-highlight"><pre className="code-plain"><code>{lines.map((line, index) => <span className="plain-line" key={index}>{line}{index < lines.length - 1 ? "\n" : ""}</span>)}</code></pre></div>;
}

function languageName(value: string) {
  const normalized = value.toLowerCase();
  if (["sh", "shell", "shellscript"].includes(normalized)) return "bash";
  if (["md", "markdown"].includes(normalized)) return "markdown";
  if (["text", "plain", "code"].includes(normalized)) return "text";
  return normalized;
}

export function CodeBlock({ code, language = "code" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { siteTheme, codeTheme, preferencesReady } = useTheme();
  const palette = resolveCodeTheme(siteTheme, codeTheme);
  const theme = palette === "midnight" ? "min-dark" : palette === "forest" ? "github-dark-default" : "github-light";

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "240px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(reset.current), []);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else {
        // The HTTP development address has no Clipboard API.
        const field = document.createElement("textarea");
        const focused = document.activeElement as HTMLElement | null;
        field.value = code; field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        container.current?.append(field);
        try { field.select(); if (!document.execCommand("copy")) throw new Error("Copy unavailable"); }
        finally { field.remove(); focused?.focus({ preventScroll: true }); }
      }
      setCopyError(false);
      setCopied(true);
      clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  const plain = <PlainCode code={code} />;
  return <div className="code-block code-block-modern surface-shell" ref={container}>
    <div className="code-core surface-core"><div className="code-toolbar"><span className="code-dots" aria-hidden="true"><i /><i /><i /></span><span className="code-language">{language}</span><button type="button" className="code-copy" onClick={copy} aria-label={copied ? "已复制代码" : copyError ? "重试复制代码" : "复制代码"}>{copied ? <Check size={14} /> : <Clipboard size={14} />}<span aria-live="polite">{copied ? "已复制" : copyError ? "重试复制" : "复制"}</span></button></div>
    <ScrollArea className="code-scroll-area" orientation="horizontal" role="region" aria-label="代码，可横向滚动" tabIndex={0}>{visible && preferencesReady ? <Suspense fallback={plain}><ShikiHighlighter language={languageName(language)} theme={theme} engine="javascript" showLanguage={false} showLineNumbers startingLineNumber={1} addDefaultStyles={false} className="code-highlight" tabindex={-1}>{code}</ShikiHighlighter></Suspense> : plain}</ScrollArea></div>
  </div>;
}
