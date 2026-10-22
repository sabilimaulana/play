import { expect, status, test } from "./fixtures.ts"

test("home lists every game and opens a fresh room", async ({ page, shot }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Small games.*Great company/ })).toBeVisible()
  const cards = page.locator(".cabinet")
  await expect(cards).toHaveCount(6)
  for (const name of ["Tic Tac Toe", "Poker", "Checkers", "Sudoku", "Circccle", "Ceki"])
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  await shot(page, "home")

  await page.locator("#tictactoe").getByRole("button", { name: "New room" }).click()
  await expect(page).toHaveURL(/\/tictactoe\/[a-z0-9]{8}$/)
  await expect(status(page)).toHaveText("Waiting for your friend…")
  await expect(page.locator("#invite-link")).toHaveValue(page.url())
  await shot(page, "new room waiting")
})

test("unknown paths fall back to home", async ({ page }) => {
  await page.goto("/nope/x")
  await expect(page.locator(".cabinet")).toHaveCount(6)
})
