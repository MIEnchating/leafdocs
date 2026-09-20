"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SurfaceDialog } from "../surface-dialog";
import { IconPicker } from "../ui/icon-picker";
import { useConfirm } from "../ui/confirm-provider";
import { useSiteSettings } from "../site-provider";
import type { SiteSettings } from "@/lib/site-settings";
import { X } from "../icons";

export function SiteSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const site = useSiteSettings();
  const [draft, setDraft] = useState(site);
  const [baseline, setBaseline] = useState(site);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const confirm = useConfirm();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/settings", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) { setDraft(data); setBaseline(data); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open]);
  const dirty = draft.title !== baseline.title || draft.icon !== baseline.icon || draft.description !== baseline.description;
  async function close() {
    if (saving) return;
    if (dirty && !await confirm({ title: "放弃站点设置修改？", description: "尚未保存的名称、图标和简介将被放弃。", confirmLabel: "放弃修改" })) return;
    onClose();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError("");
    try {
      const { title, icon, description, version } = draft;
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, icon, description, version }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setBaseline(result as SiteSettings); router.refresh(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  }
  return <SurfaceDialog open={open} onClose={() => void close()} label="站点设置" className="site-settings-dialog">
    <header className="panel-heading"><h2>站点设置</h2><button className="icon-button" aria-label="关闭站点设置" onClick={() => void close()} disabled={saving}><X size={18} /></button></header>
    <form onSubmit={save} className="site-settings-form">
      <div className="site-identity-fields"><IconPicker label="站点图标" value={draft.icon} onChange={icon => setDraft(value => ({ ...value, icon }))} disabled={loading || saving} /><label>文档站名称<input autoFocus aria-label="文档站名称" value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} maxLength={60} required disabled={loading || saving} /></label></div>
      <label>站点简介<textarea aria-label="站点简介" rows={3} value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} maxLength={240} disabled={loading || saving} /></label>
      {error && <p role="alert" className="ui-form-error">{error}</p>}
      <div className="ui-dialog-actions"><button type="button" className="ui-button" onClick={() => void close()} disabled={saving}>取消</button><button className="ui-button ui-button-primary" disabled={loading || saving || !dirty}>{saving ? "正在保存…" : "保存设置"}</button></div>
    </form>
  </SurfaceDialog>;
}
