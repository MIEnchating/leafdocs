"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="status-page"><span className="eyebrow">暂时无法加载</span><h1>请稍后再试。</h1><p>连接暂时出现问题，已保存的文档不会丢失。</p><button className="button button-primary" onClick={reset}>重新加载</button></div>;
}
