import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const COST = 65_536;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const length = Buffer.byteLength(password, "utf8");
  if (length < 12 || length > 1024) {
    throw new Error("密码须为 12 至 1024 字节。");
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return ["scrypt", "v1", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > 1024 || encoded.length > 256) return false;
  const parts = encoded.split("$");
  if (
    parts.length !== 7 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "v1" ||
    parts[2] !== String(COST) ||
    parts[3] !== String(BLOCK_SIZE) ||
    parts[4] !== String(PARALLELIZATION) ||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[5]) ||
    !/^[A-Za-z0-9_-]{86}$/.test(parts[6])
  ) return false;

  const salt = Buffer.from(parts[5], "base64url");
  const expected = Buffer.from(parts[6], "base64url");
  if (
    salt.length !== SALT_BYTES || expected.length !== KEY_BYTES ||
    salt.toString("base64url") !== parts[5] || expected.toString("base64url") !== parts[6]
  ) return false;

  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
