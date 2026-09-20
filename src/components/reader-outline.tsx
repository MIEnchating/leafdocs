"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; title: string; level: number };

export function ReaderOutline({ items }: { items: Heading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const baseLevel = Math.min(...items.map(item => item.level));

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".public-main");
    if (!scroller) return;
    const headings = items.map(item => document.getElementById(item.id)).filter((element): element is HTMLElement => element !== null);
    let frame = 0;
    let positions: number[] = [];
    let offset = 20;
    let needsMeasure = true;
    const update = () => {
      frame = 0;
      if (needsMeasure) {
        offset = (parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0) + 4;
        positions = headings.map(heading => heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
        needsMeasure = false;
      }
      // Read heading geometry only after layout changes, not on every scroll frame.
      let low = 0;
      let high = positions.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (positions[middle] <= scroller.scrollTop + offset) low = middle + 1;
        else high = middle;
      }
      let current = headings[Math.max(0, low - 1)];
      // The last section may be too short to reach the sticky header.
      if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = headings.at(-1)!;
      setActiveId(current?.id ?? null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const measure = () => { needsMeasure = true; schedule(); };
    const observer = new ResizeObserver(measure);
    const article = document.querySelector(".reader-article");
    if (article) observer.observe(article);
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("hashchange", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      window.removeEventListener("hashchange", schedule);
    };
  }, [items]);

  return <nav className="reader-outline" aria-label="本页内容">
    <div>本页内容</div>
    {items.length ? items.map(item => <a key={item.id} href={`#${encodeURIComponent(item.id)}`} className={item.level > baseLevel ? "nested" : undefined} aria-current={activeId === item.id ? "location" : undefined}>{item.title}</a>) : <span className="muted">暂无章节标题</span>}
  </nav>;
}
