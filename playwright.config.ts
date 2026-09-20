import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] } } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: process.env.APP_URL || "http://localhost:3210",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
