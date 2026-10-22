import type { Page } from "@playwright/test"
import { expect, room, status, test } from "./fixtures.ts"

const sit = async (page: Page, name: string) => {
  await page.getByLabel("Your name").fill(name)
  await page.getByRole("button", { name: "Take a seat" }).click()
  await expect(page.locator(".pod.is-you .pod-name")).toHaveText(name)
}

test("two players: sit, deal, raise, fold, pot awarded", async ({ page, friend, shot }) => {
  const url = `/poker/${room()}`
  await page.goto(url)
  await friend.goto(url)
  await expect(status(page)).toHaveText("Take a seat")
  await sit(page, "Ann")
  await sit(friend, "Bob")
  await expect(status(page)).toHaveText("Ready to deal")
  await expect(page.locator(".pod")).toHaveCount(2)
  await shot(page, "Ann: two seated")

  await page.getByRole("button", { name: "Deal" }).click()
  // Exactly one of the two is on the clock.
  await expect.poll(async () => [await status(page).textContent(), await status(friend).textContent()].filter((t) => t === "Your turn").length).toBe(1)
  const [actor, other] = (await status(page).textContent()) === "Your turn" ? [page, friend] : [friend, page]
  await shot(actor, "first to act: action bar")

  // Raise min, then the other folds.
  await actor.getByRole("button", { name: "Min" }).click()
  await actor.getByRole("button", { name: /^Raise to \d+$/ }).click()
  await expect(status(other)).toHaveText("Your turn")
  await expect(other.locator(".status-detail")).toHaveText(/^\d+ to call\.$/)
  await other.getByRole("button", { name: "Fold" }).click()

  await expect(status(actor)).toHaveText("You won the pot!")
  await expect(status(other)).toHaveText(/^(Ann|Bob) won \d+\.$/)
  await expect(other.locator(".pod-tag.is-fold")).toHaveText("Fold")
  // Chips are conserved: 2000 on the table between two players.
  const stacks = await page.locator(".pod-stack").allTextContents()
  expect(stacks.map(Number).reduce((a, b) => a + b)).toBe(2000)
  await shot(actor, "pot won")
  await shot(other, "folded")
  await expect(actor.getByRole("button", { name: "Deal next hand" })).toBeVisible()

  // The hand lands in history: a still of the table as it ended.
  await actor.getByRole("button", { name: "Hand history (1)" }).click()
  const past = actor.getByRole("dialog", { name: "Hand history" })
  await expect(past.locator(".history-round")).toHaveCount(1)
  await expect(past.locator(".history-head")).toHaveText("Hand 1")
  await expect(past.locator(".pod-tag.is-fold")).toHaveText("Fold")
  await expect(past.locator(".pod-tag.is-win")).toHaveText("Win +60")
  await expect(past.locator(".still-card")).toHaveCount(2) // the winner's two; the folder's are gone
  await shot(actor, "hand history")
  await actor.keyboard.press("Escape")
  await expect(past).toBeHidden()
})

test("solo vs a bot plays a hand to showdown or fold", async ({ page, shot }) => {
  await page.goto(`/poker/${room()}`)
  await sit(page, "Solo")
  await expect(status(page)).toHaveText("Waiting for players…")
  await page.getByRole("button", { name: "Add a bot" }).click()
  await expect(page.locator(".pod")).toHaveCount(2)
  await page.getByRole("button", { name: "Deal" }).click()
  // Check or call every street until the hand ends.
  const over = /You won the pot!| won \d+/
  for (let street = 0; street < 16; street++) {
    await expect(status(page)).toHaveText(/Your turn|You won the pot!| won \d+/, { timeout: 15_000 })
    if (over.test((await status(page).textContent())!)) break
    await page.getByRole("button", { name: /^(Check|Call \d+)$/ }).click()
    await expect(page.getByRole("button", { name: /^(Check|Call \d+)$/ })).toBeHidden()
  }
  await expect(status(page)).toHaveText(over, { timeout: 15_000 })
  await shot(page, "hand over vs bot")
})
