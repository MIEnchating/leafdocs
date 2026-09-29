"use client";

import { useState } from "react";

export function DocumentImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="document-image-error" role="img" aria-label="图片加载失败">图片加载失败</span>;
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
