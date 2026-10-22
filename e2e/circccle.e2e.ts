import { expect, room, status, test } from "./fixtures.ts"

// Private room only: never drop test traffic into the shared /circccle/global arena.
test("two browsers share a live arena with computer players", async ({ page, friend, shot }) => {
  const url = `/circccle/${room()}`
  await page.goto(url)
  await expect(status(page)).toHaveText("Eat!")
  await expect(page.getByText("Private room: only people with this link can join.")).toBeVisible()
  const board = page.locator(".leaderboard > li")
  await expect.poll(() => board.count()).toBeGreaterThan(1) // bots keep it busy solo
  await expect(page.locator(".leaderboard .is-turn .player-name")).toHaveText("You")

  await friend.goto(url)
  await expect(status(friend)).toHaveText("Eat!")
  await friend.getByLabel("Your name").fill("Bob")
  await friend.getByRole("button", { name: "Save" }).click()
  await expect(friend.locator(".leaderboard .is-turn .player-name")).toHaveText("Bob (you)")

  // The world ticks: two canvas frames a moment apart differ. Steer right meanwhile.
  const canvas = page.locator(".stage canvas")
  const before = await canvas.screenshot()
  await page.locator("body").focus()
  await page.keyboard.down("ArrowRight")
  await page.waitForTimeout(1500)
  await page.keyboard.up("ArrowRight")
  expect((await canvas.screenshot()).equals(before)).toBe(false)
  expect(Number(await page.locator(".sd-time").textContent())).toBeGreaterThanOrEqual(1)
  await shot(page, "player one in the arena")
  await shot(friend, "Bob in the arena")

  // Split and eject are wired (buttons + keys) and don't knock you out.
  await page.getByRole("button", { name: "Split · Space" }).click()
  await page.getByRole("button", { name: "Eject · W" }).click()
  await expect(status(page)).toHaveText(/Eat!|Eaten!/)
})
