"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <div className="status-page"><span className="eyebrow">暂时无法加载</span><h1>请稍后再试。</h1><p>页面加载遇到问题，请重试。若问题持续，请联系站点管理员。</p><button type="button" className="button button-primary" onClick={retry}>重新加载</button></div>;
}
