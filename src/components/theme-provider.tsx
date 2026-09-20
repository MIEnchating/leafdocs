"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isDarkTheme, resolveCodeTheme, siteThemes, type CodeTheme, type SiteTheme } from "@/lib/themes";

type Preferences = {
  siteTheme: SiteTheme;
  codeTheme: CodeTheme;
  preferencesReady: boolean;
  setSiteTheme: (theme: SiteTheme) => void;
  setCodeTheme: (theme: CodeTheme) => void;
};
const ThemeContext = createContext<Preferences | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [siteTheme, setSiteTheme] = useState<SiteTheme>("paper");
  const [codeTheme, setCodeTheme] = useState<CodeTheme>("auto");
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    try {
      const site = localStorage.getItem("new-api-site-theme-v2");
      const code = localStorage.getItem("new-api-code-theme");
      if (siteThemes.some(([value]) => value === site)) setSiteTheme(site as SiteTheme);
      if (code && ["auto", "paper", "forest", "midnight"].includes(code)) setCodeTheme(code as CodeTheme);
    } catch { /* Storage may be unavailable in restricted contexts. */ }
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    const root = document.documentElement;
    root.dataset.theme = siteTheme;
    root.dataset.appearance = isDarkTheme(siteTheme) ? "dark" : "light";
    root.dataset.codeTheme = resolveCodeTheme(siteTheme, codeTheme);
    try {
      localStorage.setItem("new-api-site-theme-v2", siteTheme);
      localStorage.setItem("new-api-code-theme", codeTheme);
    } catch { /* The current page still works without persistence. */ }
  }, [siteTheme, codeTheme, preferencesReady]);
  return <ThemeContext.Provider value={{ siteTheme, codeTheme, preferencesReady, setSiteTheme, setCodeTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}
