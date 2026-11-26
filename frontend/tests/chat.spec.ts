import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("chat message flow refreshes the board", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const firstCardId = (await firstColumn.locator('[data-testid^="card-"]').first().getAttribute("data-testid"))!.replace("card-", "");

  let requestBody: unknown;
  await page.route("**/api/chat", async (route) => {
    requestBody = route.request().postDataJSON();
    const board = await (await page.request.get("/api/board")).json();
    board.cards["card-e2e"] = { id: "card-e2e", title: "Mocked AI card", details: "" };
    board.columns[0].cardIds.push("card-e2e");
    board.columns[0].cardIds = board.columns[0].cardIds.filter((id: string) => id !== firstCardId);
    board.columns[4].cardIds.push(firstCardId);
    await route.fulfill({ json: { reply: "Added a card and moved one.", board } });
  });

  await page.getByRole("button", { name: /open ai chat/i }).click();
  const chat = page.getByRole("complementary", { name: "AI chat" });
  await chat.getByLabel("Chat message").fill("Add a card and move the first one to Done");
  await chat.getByRole("button", { name: /send/i }).click();

  await expect(chat.getByText("Add a card and move the first one to Done")).toBeVisible();
  await expect(chat.getByText("Added a card and moved one.")).toBeVisible();
  await expect(firstColumn.getByText("Mocked AI card")).toBeVisible();
  await expect(page.getByTestId("column-col-done").getByTestId(`card-${firstCardId}`)).toBeVisible();
  expect(requestBody).toEqual({ message: "Add a card and move the first one to Done", history: [] });
});
