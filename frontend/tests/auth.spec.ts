import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("unauthenticated visit shows login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("sign in, reload keeps session, log out returns to login", async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
