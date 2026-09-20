"use client";

import { forwardRef, type HTMLAttributes } from "react";
import "./scroll-area.css";

export type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "vertical" | "horizontal" | "both";
};

/** Native scrolling chains to the nearest ancestor; direction is controlled in CSS. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea({ className = "", orientation = "both", children, ...props }, ref) {
  return <div ref={ref} className={`scroll-area scroll-area-${orientation} ${className}`.trim()} {...props}>{children}</div>;
});
