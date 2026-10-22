import type { Page } from "@playwright/test"
import { expect, room, status, test } from "./fixtures.ts"

const sit = async (page: Page, name: string) => {
  await page.getByLabel("Your name").fill(name)
  await page.getByRole("button", { name: "Take a seat" }).click()
  await expect(page.locator(".ck-seat.is-you .player-name")).toHaveText(`${name} (you)`)
}

const drawAndDiscard = async (page: Page) => {
  await expect(status(page)).toHaveText(/^Your turn/)
  await page.getByRole("button", { name: "Draw", exact: true }).click()
  await expect(page.locator(".ck-card")).toHaveCount(8)
  await page.locator(".ck-card.is-new").click()
  await page.getByRole("button", { name: /^Discard / }).click()
  await expect(page.locator(".ck-card")).toHaveCount(7)
}

test("two players: sit, deal 7 each, draw and discard, turn passes", async ({ page, friend, shot }) => {
  const url = `/ceki/${room()}`
  await page.goto(url)
  await friend.goto(url)
  await expect(status(page)).toHaveText("Take a seat")
  await sit(page, "Ann")
  await sit(friend, "Bob")
  await expect(status(page)).toHaveText("Ready to deal")
  await page.getByRole("button", { name: "Deal", exact: true }).click()

  // Ann sat first: she deals and starts.
  await expect(page.locator(".ck-card")).toHaveCount(7)
  await expect(friend.locator(".ck-card")).toHaveCount(7)
  await expect(status(friend)).toHaveText("Ann is playing…")
  await shot(page, "Ann: dealt")
  await drawAndDiscard(page)
  await expect(page.locator(".ck-discard")).toHaveCount(1)
  await expect(status(page)).toHaveText("Bob is playing…")
  await drawAndDiscard(friend)
  await expect(friend.locator(".ck-discard")).toHaveCount(2)
  await shot(friend, "Bob: after a round")
})

test("solo with a bot: the bot answers every turn", async ({ page, shot }) => {
  await page.goto(`/ceki/${room()}`)
  await sit(page, "Ann")
  await page.getByRole("button", { name: "Add a bot" }).click()
  await expect(page.locator(".ck-seat")).toHaveCount(2)
  await page.getByRole("button", { name: "Deal", exact: true }).click()
  for (let turn = 0; turn < 3; turn++) {
    await expect(status(page)).toHaveText(/^Your turn|closed|Stock ran out/, { timeout: 15_000 })
    if (!(await status(page).textContent())?.startsWith("Your turn")) break
    await drawAndDiscard(page)
  }
  await shot(page, "solo vs bot")
})
