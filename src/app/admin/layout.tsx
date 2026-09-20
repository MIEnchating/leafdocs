import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import AdminWorkspace from "@/components/admin/workspace";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <><AdminWorkspace />{children}</>;
}
