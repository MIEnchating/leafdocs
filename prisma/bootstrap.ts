import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/server/password";

const prisma = new PrismaClient();
class ConfigurationError extends Error {}

async function main() {
  await prisma.$transaction(async tx => {
    // Serialize first startup across instances. Use a supported result type for Prisma.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1818583398, 1)`;
    if (await tx.user.count()) {
      console.log("管理员已存在，保留现有账号和密码。");
      return;
    }
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new ConfigurationError("首次启动必须设置 ADMIN_EMAIL 和 ADMIN_PASSWORD。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ConfigurationError("ADMIN_EMAIL 格式不正确。");
    const length = Buffer.byteLength(password, "utf8");
    if (length < 12 || length > 1024) throw new ConfigurationError("ADMIN_PASSWORD 须为 12 至 1024 字节。");
    const passwordHash = await hashPassword(password);
    await tx.user.create({ data: { email, passwordHash } });
    console.log("首次启动已自动创建管理员，请使用配置的邮箱和密码登录。");
  }, { timeout: 30_000 });
}

main().catch((error: unknown) => {
  // Never log Prisma diagnostics or environment values: they may contain credentials.
  console.error(error instanceof ConfigurationError ? error.message : "管理员初始化失败，请检查数据库连接和迁移状态。");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
