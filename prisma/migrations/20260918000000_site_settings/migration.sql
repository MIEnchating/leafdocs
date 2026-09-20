CREATE TABLE "SiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "title" TEXT NOT NULL DEFAULT '文档中心',
  "icon" TEXT NOT NULL DEFAULT 'book',
  "description" TEXT NOT NULL DEFAULT '使用指南、操作说明与常见问题。',
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "SiteSettings" ("id") VALUES ('default');
