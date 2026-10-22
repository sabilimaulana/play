import { clickCell } from "./board.ts"
import { expect, room, status, test } from "./fixtures.ts"

// Squares by index (row 0 = rank 8, the top for red).
const sq = (name: string) => (8 - +name[1]!) * 8 + "abcdefgh".indexOf(name[0]!)

test("two browsers: moves sync, forced capture, resign", async ({ page, friend, shot }) => {
  const url = `/checkers/${room()}`
  await page.goto(url)
  await expect(status(page)).toHaveText("Waiting for your friend…")
  await friend.goto(url)
  await expect(status(page)).toHaveText("Your move")
  await expect(status(friend)).toHaveText("Red is thinking…")
  const whites = (p: typeof page) => p.locator('.cell-key[aria-label$="white"]')
  await expect(whites(page)).toHaveCount(12)
  await shot(page, "red: opening")
  await shot(friend, "white: opening (board flipped)")

  // Red c3-d4, white f6-e5: red now must jump d4xf6.
  await clickCell(page, sq("c3"))
  await clickCell(page, sq("d4"))
  await expect(friend.locator(`.cell-key >> nth=${sq("d4")}`)).toHaveAttribute("aria-label", "d4: man red")
  await expect(status(friend)).toHaveText("Your move")
  await clickCell(friend, sq("f6"))
  await clickCell(friend, sq("e5"))

  await expect(page.locator(".status-detail")).toHaveText("A capture is available — you must take it.")
  await shot(page, "red: forced capture")
  await clickCell(page, sq("d4"))
  await clickCell(page, sq("f6"))
  await expect(whites(page)).toHaveCount(11)
  await expect(whites(friend)).toHaveCount(11)
  await expect(page.locator(`.cell-key >> nth=${sq("e5")}`)).toHaveAttribute("aria-label", "e5: empty")
  await shot(friend, "white: after losing a piece")

  // Resign is two presses.
  const resign = friend.getByRole("button", { name: "Resign" })
  await resign.click()
  await friend.getByRole("button", { name: "Press again to resign" }).click()
  await expect(status(page)).toHaveText("You win!")
  await expect(status(friend)).toHaveText("You lose.")
  await shot(page, "red wins by resignation")
})

test("solo: the computer answers a move", async ({ page }) => {
  await page.goto(`/checkers/${room()}`)
  await page.getByRole("button", { name: "Play the computer" }).click()
  await expect(status(page)).toHaveText("Your move")
  await clickCell(page, sq("c3"))
  await clickCell(page, sq("d4"))
  await expect(status(page)).toHaveText("White is thinking…")
  await expect(status(page)).toHaveText(/Your move|Keep jumping!/)
  // White moved one man off its home rows.
  await expect(page.locator('.cell-key[aria-label$="man white"]')).toHaveCount(12)
  const home = await page.locator(".cell-key").evaluateAll((keys) =>
    keys.slice(0, 24).filter((k) => k.getAttribute("aria-label")!.endsWith("white")).length)
  expect(home).toBe(11)
})
