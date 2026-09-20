"use client";

import { Reveal } from "@/components/reveal";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, LoaderCircle, LockKeyhole } from "@/components/icons";

export default function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败，请检查邮箱和密码");
      router.push("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法登录，请稍后重试");
      setPending(false);
    }
  }

  return (
    <main className="admin-login">
      <Link href="/" className="login-back"><ArrowLeft size={15} /> 返回文档站</Link>
      <Reveal className="login-shell surface-shell"><div className="login-card surface-core">
        <span className="login-mark"><BookOpen size={25} /></span>
        <span className="admin-eyebrow">DOCUMENT WORKSPACE</span>
        <h1>文档工作台</h1>
        <p>管理文档、编辑草稿，确认后发布给读者。</p>
        <form method="post" action="/api/auth/login" onSubmit={submit}>
          <label htmlFor="email">邮箱地址</label>
          <input id="email" name="email" type="email" placeholder="输入管理员邮箱" autoComplete="username" required disabled={pending} />
          <label htmlFor="password">密码</label>
          <input id="password" name="password" type="password" placeholder="输入你的密码" autoComplete="current-password" required disabled={pending} />
          {error && <div className="admin-inline-error" role="alert">{error}</div>}
          <button className="admin-button admin-button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="admin-spin" size={17} /> : <LockKeyhole size={16} />} {pending ? "正在登录…" : "进入工作台"} <span className="button-orb"><ArrowUpRight size={16} /></span></button>
        </form>
        <div className="login-footnote">草稿自动保存，发布内容独立管理。</div>
      </div></Reveal>
      <span className="login-copyright">Documentation workspace</span>
    </main>
  );
}
