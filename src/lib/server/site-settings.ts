import { cache } from "react";
import { z } from "zod";
import { prisma } from "./db";
import { HttpError } from "./http";
import { defaultSiteSettings } from "../site-settings";

export const getSiteSettings = cache(async () => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "default" } });
  return settings ?? defaultSiteSettings;
});

const settingsBody = z.object({
  title: z.string().trim().min(1, "请输入文档站名称。").max(60, "名称最多 60 个字符。"),
  icon: z.enum(["file", "book", "rocket", "settings", "key", "idea", "plug", "compass"]),
  description: z.string().trim().max(240, "简介最多 240 个字符。"),
  version: z.number().int().positive(),
}).strict();

export async function updateSiteSettings(input: unknown) {
  const { version, ...data } = settingsBody.parse(input);
  return prisma.$transaction(async tx => {
    const changed = await tx.siteSettings.updateMany({ where: { id: "default", version }, data: { ...data, version: { increment: 1 } } });
    if (!changed.count) throw new HttpError(409, "站点设置已在其他窗口更新，请重新打开设置后再修改。");
    return tx.siteSettings.findUniqueOrThrow({ where: { id: "default" } });
  });
}
