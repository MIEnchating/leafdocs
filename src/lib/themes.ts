export const siteThemes = [
  ["paper", "纸白", "白纸与黑墨"],
  ["stone", "浅石", "冷灰与留白"],
  ["linen", "亚麻", "温暖的阅读底色"],
  ["graphite", "石墨黑", "沉静的中性暗色"],
  ["midnight", "午夜蓝", "深蓝与冰蓝微光"],
  ["pine", "松墨绿", "墨绿与柔和薄荷"],
] as const;
export type SiteTheme = typeof siteThemes[number][0];
export type CodeTheme = "auto" | "paper" | "forest" | "midnight";
export const isDarkTheme = (theme: SiteTheme) => ["graphite", "midnight", "pine"].includes(theme);
export const resolveCodeTheme = (site: SiteTheme, code: CodeTheme) => code !== "auto" ? code : isDarkTheme(site) ? site === "graphite" ? "midnight" : "forest" : "paper";

// Apply saved colors before the first paint, including direct login/admin visits.
export const themeBootstrap = `(()=>{try{const s=localStorage.getItem('new-api-site-theme-v2'),c=localStorage.getItem('new-api-code-theme');const site=${JSON.stringify(siteThemes.map(([value]) => value))}.includes(s)?s:'paper';const code=['auto','paper','forest','midnight'].includes(c)?c:'auto';const dark=['graphite','midnight','pine'].includes(site);const root=document.documentElement;root.dataset.theme=site;root.dataset.appearance=dark?'dark':'light';root.dataset.codeTheme=code==='auto'?(dark?(site==='graphite'?'midnight':'forest'):'paper'):code;}catch{}})();`;
