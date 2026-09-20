"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || preference.matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        element.dataset.reveal = "visible";
        observer.disconnect();
      }
    }, { threshold: 0.04 });
    // Never hide content already painted in the initial viewport during hydration.
    const bounds = element.getBoundingClientRect();
    if (bounds.top < window.innerHeight && bounds.bottom > 0) return;
    element.dataset.reveal = "pending";
    observer.observe(element);
    const show = () => { if (preference.matches) { element.dataset.reveal = "visible"; observer.disconnect(); } };
    preference.addEventListener("change", show);
    return () => { observer.disconnect(); preference.removeEventListener("change", show); delete element.dataset.reveal; };
  }, []);
  return <div ref={ref} className={`reveal ${className}`} onFocusCapture={() => { if (ref.current) ref.current.dataset.reveal = "visible"; }} style={{ "--reveal-delay": `${Math.min(delay, 3) * 60}ms` } as CSSProperties}>{children}</div>;
}
