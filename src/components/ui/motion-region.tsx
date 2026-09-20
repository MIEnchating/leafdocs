"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function MotionRegion({ motionKey, className = "", children }: {
  motionKey: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || preference.matches) return;
    const style = getComputedStyle(element);
    // Animate the existing surface so navigation never remounts an editor.
    animation.current = element.animate([
      { opacity: .5 },
      { opacity: 1 },
    ], { duration: 220, easing: style.getPropertyValue("--ease-ui").trim() });
    const cancel = () => animation.current?.cancel();
    preference.addEventListener("change", cancel);
    return () => { cancel(); preference.removeEventListener("change", cancel); };
  }, [motionKey]);
  return <div ref={ref} className={className} data-motion-region="" onPointerDownCapture={() => animation.current?.cancel()} onFocusCapture={() => animation.current?.cancel()}>{children}</div>;
}

export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className="ui-collapse" data-open={open} inert={!open} aria-hidden={!open}>
    <div className="ui-collapse-content">{children}</div>
  </div>;
}
