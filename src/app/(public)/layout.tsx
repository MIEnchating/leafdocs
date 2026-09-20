import { PublicShell } from "@/components/public-shell";
import { getPublishedDocuments } from "@/lib/server/documents";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const documents = await getPublishedDocuments();
  const navigation = documents.map(({ id, title, slug, icon, parentId, position }) => ({ id, title, slug, icon, parentId, position }));
  return <PublicShell documents={navigation}>{children}</PublicShell>;
}
