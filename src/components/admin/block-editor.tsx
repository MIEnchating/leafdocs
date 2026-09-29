"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { zh } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import { useTheme } from "@/components/theme-provider";
import { isDarkTheme } from "@/lib/themes";
import { memo, useCallback, useEffect, useRef } from "react";

type Props = {
  content: unknown[];
  onChange?: (content: unknown[]) => void;
  onError?: (message: string) => void;
  editable?: boolean;
};

function BlockEditor({ content, onChange, onError, editable = true }: Props) {
  const { siteTheme } = useTheme();
  const viewRef = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote({
    dictionary: zh,
    initialContent: content.length ? (content as PartialBlock[]) : undefined,
    uploadFile: async (file: File) => {
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "图片上传失败，请重试");
        return result.url as string;
      } catch (error) {
        const message = error instanceof Error ? error.message : "图片上传失败";
        onError?.(message);
        throw error;
      }
    },
  });

  const handleChange = useCallback(() => { if (editable) onChange?.(editor.document); }, [editable, onChange, editor]);
  useEffect(() => {
    const root = viewRef.current;
    if (!root) return;
    const markFailedImage = (image: HTMLImageElement) => {
      image.closest<HTMLElement>("[data-content-type=\"image\"]")?.setAttribute("data-image-error", "true");
    };
    const images = [...root.querySelectorAll<HTMLImageElement>("img")];
    images.forEach(image => {
      if (image.complete && image.naturalWidth === 0) markFailedImage(image);
    });
    const handleError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) markFailedImage(event.target);
    };
    root.addEventListener("error", handleError, true);
    return () => root.removeEventListener("error", handleError, true);
  }, [content, editor]);
  return <div ref={viewRef} className="admin-block-editor-view"><BlockNoteView editor={editor} theme={isDarkTheme(siteTheme) ? "dark" : "light"} editable={editable} onChange={handleChange} /></div>;
}

export default memo(BlockEditor);
