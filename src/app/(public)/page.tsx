import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen } from "@/components/icons";
import { DocumentIcon } from "@/components/document-icon";
import { getPublishedDocuments } from "@/lib/server/documents";
import { getSiteSettings } from "@/lib/server/site-settings";

export default async function HomePage() {
  const [documents, site] = await Promise.all([getPublishedDocuments(), getSiteSettings()]);
  const first = documents[0];
  return <div className="home-page">
    <header className="library-header">
      <div className="eyebrow"><DocumentIcon icon={site.icon} size={16} /> KNOWLEDGE BASE</div>
      <h1>{site.title}</h1><p>{site.description}</p>
      <Link className="button button-primary" href={first ? `/docs/${first.slug}` : "/admin"}>{first ? "开始阅读" : "创建文档"}<span className="button-orb"><ArrowUpRight size={19} /></span></Link>
    </header>
    <section className="library-section" aria-labelledby="guides-heading">
      <div className="section-heading"><h2 id="guides-heading">全部文档</h2><span className="muted">{documents.length} 篇文档</span></div>
      <div className="library-grid">{documents.map(doc => <Link key={doc.id} href={`/docs/${doc.slug}`} className="library-document">
        <span className="library-document-icon"><DocumentIcon icon={doc.icon} size={24} /></span>
        <div><h3>{doc.title}</h3><span>更新于 {new Date(doc.publishedAt).toLocaleDateString("zh-CN", { timeZone: "UTC" })}</span></div><ArrowUpRight size={18} />
      </Link>)}</div>
      {!documents.length && <div className="empty-docs"><BookOpen size={30} /><h3>暂无已发布文档</h3><Link className="text-link" href="/admin">进入工作台 <ArrowRight size={16} /></Link></div>}
    </section>
  </div>;
}
