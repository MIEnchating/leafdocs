import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays } from "@/components/icons";
import { DocumentIcon } from "@/components/document-icon";
import { DocumentContent, documentOutline } from "@/components/document-content";
import { ReaderOutline } from "@/components/reader-outline";
import { getPublishedDocument, getPublishedDocuments } from "@/lib/server/documents";
import { getSiteSettings } from "@/lib/server/site-settings";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [doc, settings] = await Promise.all([getPublishedDocument((await params).slug), getSiteSettings()]);
  if (!doc) return { title: "文档未找到" };
  return { title: doc.title === settings.title ? { absolute: doc.title } : doc.title };
}

export default async function DocumentPage({ params }: Props) {
  const [doc, documents] = await Promise.all([getPublishedDocument((await params).slug), getPublishedDocuments()]);
  if (!doc) notFound();
  const index = documents.findIndex(item => item.id === doc.id);
  const previous = documents[index - 1];
  const next = documents[index + 1];
  return <div className="reader-layout">
    <article className="reader-article">
      <header className="article-header">
        <h1><DocumentIcon icon={doc.icon} size={30} />{doc.title}</h1>
        <div className="article-meta"><CalendarDays size={13} /><span>更新于 {new Date(doc.publishedAt).toLocaleDateString("zh-CN", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" })}</span><span className="meta-divider" />文档团队</div>
      </header>
      <DocumentContent content={doc.content} />
      {(previous || next) && <nav className="article-pagination" aria-label="相邻文档">
        {previous && <Link href={`/docs/${previous.slug}`} className="pagination-previous" rel="prev"><span><ArrowLeft size={16} />上一篇</span><strong>{previous.title}</strong></Link>}
        {next && <Link href={`/docs/${next.slug}`} className="pagination-next" rel="next"><span>下一篇<ArrowRight size={16} /></span><strong>{next.title}</strong></Link>}
      </nav>}
    </article>
    <ReaderOutline key={doc.id} items={documentOutline(doc.content)} />
  </div>;
}
