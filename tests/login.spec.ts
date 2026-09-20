import { expect, test } from "@playwright/test";

// Login requests contain credentials: never capture request traces or failure images.
test.use({ trace: "off", screenshot: "off", video: "off" });

for (const javaScriptEnabled of [true, false]) {
  test.describe(javaScriptEnabled ? "hydrated login" : "native form login", () => {
    test.use({ javaScriptEnabled });

    test("configured public address accepts login without putting credentials in the URL", async ({ page, context }) => {
      await page.goto("/login");
      const form = page.locator("form");
      await expect(form).toHaveAttribute("method", "post");
      await expect(form).toHaveAttribute("action", "/api/auth/login");
      // Wait for hydration when testing the JSON path; the other case has JS disabled entirely.
      if (javaScriptEnabled) await page.waitForLoadState("networkidle");
      await page.getByLabel("邮箱地址").fill(process.env.ADMIN_EMAIL!);
      await page.getByLabel("密码", { exact: true }).fill(process.env.ADMIN_PASSWORD!);
      const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login");
      await page.getByRole("button", { name: "进入工作台" }).click();
      const response = await loginResponse;
      expect(response.request().method()).toBe("POST");
      expect(response.status()).toBe(javaScriptEnabled ? 200 : 303);
      await page.waitForURL("**/admin");
      expect(new URL(page.url()).search).toBe("");
      const cookie = (await context.cookies()).find((item) => item.name === "newapi_docs_session");
      expect(Boolean(cookie)).toBe(true);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("Lax");
      expect((await page.request.get("/api/documents")).status()).toBe(200);
      expect((await page.request.post("/api/auth/logout", { headers: { Origin: process.env.APP_URL! } })).status()).toBe(200);
      expect((await page.request.get("/api/documents")).status()).toBe(401);
    });
  });
}

test("cross-origin and missing-origin requests cannot use either login encoding", async ({ request }) => {
  for (const encoding of ["json", "form"]) {
    for (const origin of [undefined, "https://untrusted.example"]) {
      const fields = { email: "test@example.com", password: "not-a-real-password" };
      const response = await request.post("/api/auth/login", {
        headers: origin ? { Origin: origin } : {},
        ...(encoding === "json" ? { data: fields } : { form: fields }),
      });
      expect(response.status()).toBe(403);
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
  }
});

test("failed native login returns a generic error without reflecting the submitted fields", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    headers: { Origin: process.env.APP_URL! },
    form: { email: "no-such-user@example.com", password: "invalid-password-fixture" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/login?error=sign-in-failed");
  expect(response.headers()["set-cookie"]).toBeUndefined();
});

test("old login URLs lose credential query parameters before rendering", async ({ page }) => {
  await page.goto("/login?email=fixture%40example.com&password=not-a-real-password");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("邮箱地址")).toHaveValue("");
});
