"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { zh } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import { useTheme } from "@/components/theme-provider";
import { isDarkTheme } from "@/lib/themes";
import { memo, useCallback } from "react";

type Props = {
  content: unknown[];
  onChange?: (content: unknown[]) => void;
  onError?: (message: string) => void;
  editable?: boolean;
};

function BlockEditor({ content, onChange, onError, editable = true }: Props) {
  const { siteTheme } = useTheme();
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
  return <BlockNoteView editor={editor} theme={isDarkTheme(siteTheme) ? "dark" : "light"} editable={editable} onChange={handleChange} />;
}

export default memo(BlockEditor);
