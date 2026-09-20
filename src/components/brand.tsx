"use client";
import Link from "next/link";
import { useSiteSettings } from "./site-provider";
import { DocumentIcon } from "./document-icon";

export function Brand({ href = "/" }: { href?: string }) {
  const site = useSiteSettings();
  return <Link className="brand" href={href} aria-label={`${site.title}首页`} title={site.title}>
    <span className="brand-mark" aria-hidden="true"><DocumentIcon icon={site.icon} size={23} /></span>
    <span className="brand-title">{site.title}</span>
  </Link>;
}
