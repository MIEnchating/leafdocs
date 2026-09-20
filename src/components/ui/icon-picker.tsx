"use client";
import { useState } from "react";
import { DocumentIcon, documentIcons } from "../document-icon";
import { Popover } from "./popover";

export function IconPicker({ value, onChange, label = "文档图标", disabled }: { value: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen} label={label} trigger={<button type="button" className="ui-icon-picker-trigger" aria-label={label} title={label} disabled={disabled}><DocumentIcon icon={value} size={24} /></button>}>
    <div className="ui-popover-heading">{label}</div><div className="ui-icon-grid">{documentIcons.map(([icon, name]) => <button type="button" key={icon} className="ui-icon-choice" aria-label={name} title={name} aria-pressed={value === icon} onClick={() => { onChange(icon); setOpen(false); }}><DocumentIcon icon={icon} size={22} /></button>)}</div>
  </Popover>;
}
