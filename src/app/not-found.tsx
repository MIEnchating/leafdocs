import Link from "next/link";
export default function NotFound() {
  return <div className="status-page"><span className="eyebrow">404 / PAGE NOT FOUND</span><h1>这一页还没有抵达。</h1><p>文档可能尚未发布，或链接已经发生变化。</p><Link className="button button-primary" href="/">回到文档首页</Link></div>;
}
