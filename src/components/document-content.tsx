import type { ReactNode } from "react";
import { CodeBlock } from "./code-block";

type Inline = { type?: string; text?: string; href?: string; content?: Inline[]; styles?: Record<string, unknown> };
type Block = { id?: string; type?: string; props?: Record<string, unknown>; content?: Inline[] | { rows?: { cells: unknown[] }[] }; children?: Block[] };

export function textFromInline(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((item) => typeof item?.text === "string" ? item.text : textFromInline(item?.content)).join("");
}

export function documentOutline(content: unknown[]): { id: string; title: string; level: number }[] {
  const result: { id: string; title: string; level: number }[] = [];
  function visit(blocks: Block[], path: string) {
    blocks.forEach((block, i) => {
      const key = `${path}-${i}`;
      if (block.type === "heading") result.push({ id: block.id || key, title: textFromInline(block.content), level: Number(block.props?.level || 2) });
      if (block.children?.length) visit(block.children, key);
    });
  }
  visit(content as Block[], "block");
  return result;
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value)) return value;
}

function InlineContent({ content }: { content: unknown }) {
  if (!Array.isArray(content)) return null;
  return content.map((part: Inline, index) => {
    if (part.type === "link") return <a href={safeUrl(part.href)} key={index} rel="noreferrer"><InlineContent content={part.content} /></a>;
    let node: ReactNode = typeof part.text === "string" ? part.text : "";
    if (part.styles?.code) node = <code>{node}</code>;
    if (part.styles?.bold) node = <strong>{node}</strong>;
    if (part.styles?.italic) node = <em>{node}</em>;
    if (part.styles?.underline) node = <u>{node}</u>;
    if (part.styles?.strike) node = <s>{node}</s>;
    return <span key={index}>{node}</span>;
  });
}

function Blocks({ blocks, path = "block" }: { blocks: Block[]; path?: string }) {
  const nodes: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const key = `${path}-${i}`;
    const id = block.id || key;
    const props = block.props || {};
    const body = <InlineContent content={block.content} />;
    const children = block.children?.length ? <Blocks blocks={block.children} path={key} /> : null;
    if (block.type === "bulletListItem" || block.type === "numberedListItem") {
      const items: ReactNode[] = [];
      const type = block.type;
      let j = i;
      for (; j < blocks.length && blocks[j].type === type; j++) {
        const item = blocks[j];
        items.push(<li key={item.id || j}><InlineContent content={item.content} />{item.children?.length ? <Blocks blocks={item.children} path={`${path}-${j}`} /> : null}</li>);
      }
      nodes.push(type === "numberedListItem" ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      i = j - 1;
      continue;
    }
    let node: ReactNode;
    switch (block.type) {
      case "heading": {
        const level = Math.max(2, Math.min(4, Number(props.level || 2) + 1));
        node = level === 2 ? <h2 id={id}>{body}</h2> : level === 3 ? <h3 id={id}>{body}</h3> : <h4 id={id}>{body}</h4>;
        break;
      }
      case "codeBlock": node = <CodeBlock code={textFromInline(block.content)} language={String(props.language || "code")} />; break;
      case "quote": node = <blockquote>{body}</blockquote>; break;
      case "checkListItem": node = <div className="read-check"><input type="checkbox" checked={Boolean(props.checked)} readOnly aria-label={textFromInline(block.content)} />{body}</div>; break;
      case "image": node = safeUrl(props.url) ? <figure><img src={safeUrl(props.url)} alt={String(props.caption || props.name || "文档图片")} loading="lazy" />{props.caption ? <figcaption>{String(props.caption)}</figcaption> : null}</figure> : null; break;
      case "table": {
        const rows = !Array.isArray(block.content) ? block.content?.rows : [];
        node = <div className="table-scroll"><table><tbody>{rows?.map((row, r) => <tr key={r}>{row.cells.map((cell, c) => <td key={c}><InlineContent content={Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content} /></td>)}</tr>)}</tbody></table></div>;
        break;
      }
      case "divider": node = <hr />; break;
      case "file": case "video": case "audio": node = <p><a href={safeUrl(props.url)}>{String(props.name || "查看附件")}</a></p>; break;
      default: node = <p>{body}</p>;
    }
    nodes.push(<div className="document-block" key={id}>{node}{children}</div>);
  }
  return nodes;
}

export function DocumentContent({ content }: { content: unknown[] }) {
  return <div className="document-content"><Blocks blocks={content as Block[]} /></div>;
}
