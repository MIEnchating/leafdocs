import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import LoginForm from "@/components/admin/login-form";
import "../admin/admin.css";

export const metadata = { title: "登录工作台", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.email !== undefined || query.password !== undefined) redirect("/login");
  if (await getSession()) redirect("/admin");
  return <LoginForm initialError={query.error === "sign-in-failed" ? "登录未成功，请检查邮箱和密码；尝试过于频繁时请稍后再试。" : ""} />;
}
