// Authentication integration contract:
// http.ts exports HttpError(status, message), route(callback),
// requireSameOrigin(request), and readJson(request).
// LoginAttempt fields: key (String @id), count (Int), windowStart (DateTime),
// blockedUntil (DateTime?). User/Session use the fields in CONTRACT.md.

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/server/db";
import { HttpError } from "@/lib/server/http";
import { verifyPassword } from "@/lib/server/password";

export const SESSION_COOKIE = "newapi_docs_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_ATTEMPT_LIMIT = 60;
const ACCOUNT_ATTEMPT_LIMIT = 5;
// A valid encoding keeps nonexistent-account verification on the same scrypt path.
const DUMMY_PASSWORD_HASH = [
  "scrypt", "v1", "65536", "8", "1",
  Buffer.alloc(16).toString("base64url"),
  Buffer.alloc(64).toString("base64url"),
].join("$");

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.APP_URL?.startsWith("https://") === true,
    path: "/",
  };
}

export async function getSession(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true, user: { select: { id: true, email: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
}

export async function requireSession(): Promise<{ id: string; email: string }> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "请先登录。");
  return session;
}

async function reserveLoginAttempt(email: string): Promise<void> {
  const keys = [
    { key: "login:global", limit: GLOBAL_ATTEMPT_LIMIT },
    { key: `login:email:${tokenHash(email)}`, limit: ACCOUNT_ATTEMPT_LIMIT },
  ];

  // Serializable transactions prevent concurrent requests from losing increments.
  // The global bucket also bounds work when no trusted client IP is configured.
  for (let retry = 0; retry < 5; retry += 1) {
    try {
      const allowed = await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.loginAttempt.deleteMany({
          where: {
            windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
          },
        });

        for (const { key, limit } of keys) {
          const previous = await tx.loginAttempt.findUnique({ where: { key } });
          if (previous?.blockedUntil && previous.blockedUntil > now) return false;
          const freshWindow = !previous || now.getTime() - previous.windowStart.getTime() >= ATTEMPT_WINDOW_MS;
          const count = freshWindow ? 1 : previous.count + 1;
          const windowStart = freshWindow ? now : previous.windowStart;
          await tx.loginAttempt.upsert({
            where: { key },
            create: { key, count, windowStart, blockedUntil: count >= limit ? new Date(now.getTime() + ATTEMPT_WINDOW_MS) : null },
            update: { count, windowStart, blockedUntil: count >= limit ? new Date(now.getTime() + ATTEMPT_WINDOW_MS) : null },
          });
        }
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (!allowed) throw new HttpError(429, "登录尝试过于频繁，请 15 分钟后重试。");
      return;
    } catch (error) {
      // Concurrent first attempts can also race to create the unique bucket row.
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
      if (!conflict) throw error;
      if (retry === 4) throw new HttpError(429, "登录尝试过于频繁，请稍后重试。");
    }
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  await reserveLoginAttempt(email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) throw new HttpError(401, "邮箱或密码不正确。");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;
  await prisma.$transaction(async (tx) => {
    await tx.loginAttempt.deleteMany({ where: { key: `login:email:${tokenHash(email)}` } });
    await tx.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          ...(previousToken && /^[A-Za-z0-9_-]{43}$/.test(previousToken) ? [{ tokenHash: tokenHash(previousToken) }] : []),
        ],
      },
    });
    await tx.session.create({ data: { tokenHash: tokenHash(token), userId: user.id, expiresAt } });
  });
  cookieStore.set(SESSION_COOKIE, token, { ...cookieOptions(), expires: expiresAt, maxAge: SESSION_SECONDS });
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  cookieStore.set(SESSION_COOKIE, "", { ...cookieOptions(), expires: new Date(0), maxAge: 0 });
}
