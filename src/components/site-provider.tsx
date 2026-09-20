"use client";
import { createContext, useContext } from "react";
import { defaultSiteSettings, type SiteSettings } from "@/lib/site-settings";

const SiteContext = createContext<SiteSettings>(defaultSiteSettings);
export function SiteProvider({ settings, children }: { settings: SiteSettings; children: React.ReactNode }) {
  return <SiteContext.Provider value={settings}>{children}</SiteContext.Provider>;
}
export const useSiteSettings = () => useContext(SiteContext);
