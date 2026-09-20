import { BookOpen, Compass, FileText, Gear, Key, Lightbulb, Plug, Rocket } from "./icons";

export const documentIcons = [
  ["file", "文档"], ["book", "指南"], ["rocket", "部署"], ["settings", "设置"],
  ["key", "令牌"], ["idea", "提示"], ["plug", "渠道"], ["compass", "导航"],
] as const;

const glyphs = { file: FileText, book: BookOpen, rocket: Rocket, settings: Gear, key: Key, idea: Lightbulb, plug: Plug, compass: Compass };
// Existing document data stays intact; legacy pictographs display as a document icon.
export function DocumentIcon({ icon, size = 17 }: { icon?: string; size?: number }) {
  const Glyph = glyphs[icon as keyof typeof glyphs] || FileText;
  return <Glyph size={size} weight="regular" />;
}
