"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OverlayContainerContext } from "./ui/overlay-container";

let scrollLocks = 0;
let previousOverflow = "";

/** Native top-layer focus handling, with CSS-driven interruptible entry and exit. */
export function SurfaceDialog({ open, onClose, label, className = "", instant = false, children, role = "dialog" }: {
  open: boolean; onClose: () => void; label: string; className?: string; instant?: boolean; children: ReactNode; role?: "dialog" | "alertdialog";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      if (scrollLocks++ === 0) {
        previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
      }
      return () => {
        if (--scrollLocks === 0) document.documentElement.style.overflow = previousOverflow;
      };
    }
    if (dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={ref} role={role} className={`surface-dialog ${className}`} aria-label={label} data-instant={instant || undefined}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClose={() => { if (open && !ref.current?.open) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert], [hidden]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <OverlayContainerContext.Provider value={container}><div className="dialog-core" ref={setContainer}>{children}</div></OverlayContainerContext.Provider>
  </dialog>;
}
