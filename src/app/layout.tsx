import type { Metadata } from "next";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import "@/components/ui/ui.css";
import "@/components/ui/motion.css";
import { ThemeProvider } from "@/components/theme-provider";
import { themeBootstrap } from "@/lib/themes";
import { SiteProvider } from "@/components/site-provider";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { getSiteSettings } from "@/lib/server/site-settings";

// Site settings come from PostgreSQL, including on the not-found page.
// Resolve them at request time so a fresh deployment can build before migrations.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return { title: { default: settings.title, template: `%s · ${settings.title}` }, description: settings.description };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  // Extensions can add attributes to <html> before hydration (e.g. Immersive Translate).
  // Limit this exception to the root element; descendants still report mismatches.
  return <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body><SiteProvider settings={settings}><ThemeProvider><ConfirmProvider>{children}</ConfirmProvider></ThemeProvider></SiteProvider></body></html>;
}
