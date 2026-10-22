import { clickCell } from "./board.ts"
import { expect, room, status, test } from "./fixtures.ts"

const cell = (i: number) => `.cell-key >> nth=${i}`

test("two browsers play a full round, X wins on the top row", async ({ page, friend, shot }) => {
  const url = `/tictactoe/${room()}`
  await page.goto(url)
  await expect(status(page)).toHaveText("Waiting for your friend…")
  await friend.goto(url)
  await expect(status(page)).toHaveText("Your turn")
  await expect(status(friend)).toHaveText("X is thinking…")
  await shot(page, "X: both seated")

  // X: 0, 1, 2 — O: 3, 4
  for (const [who, i] of [[page, 0], [friend, 3], [page, 1], [friend, 4], [page, 2]] as const) {
    await expect(status(who)).toHaveText("Your turn")
    await clickCell(who, i)
    await expect(who.locator(cell(i))).toHaveAttribute("aria-label", /: [XO]$/)
  }

  await expect(status(page)).toHaveText("You win!")
  await expect(status(friend)).toHaveText("You lose.")
  await expect(page.locator(".score dd").first()).toHaveText("1")
  await shot(page, "X wins")
  await shot(friend, "O loses")

  // Rematch: O starts the next round.
  await friend.getByRole("button", { name: "Play again" }).click()
  await expect(status(friend)).toHaveText("Your turn")
  await expect(page.locator(cell(0))).toHaveAttribute("aria-label", /empty$/)
})

test("refuses a move out of turn and on a taken square", async ({ page, friend }) => {
  const url = `/tictactoe/${room()}`
  await page.goto(url)
  await expect(status(page)).toHaveText("Waiting for your friend…")
  await friend.goto(url)
  await expect(status(friend)).toHaveText("X is thinking…")
  await clickCell(friend, 4)
  await expect(status(friend)).toHaveText("Not your turn yet.")
  await clickCell(page, 4)
  await expect(status(friend)).toHaveText("Your turn")
  await clickCell(friend, 4)
  await expect(status(friend)).toHaveText("That square is taken.")
})

test("solo against the computer, played with the keyboard", async ({ page, shot }) => {
  await page.goto(`/tictactoe/${room()}`)
  await page.getByRole("button", { name: "Play the computer" }).click()
  await expect(page.locator(".player-O .player-name")).toHaveText("Computer")
  // Each turn: keyboard-press the first empty square (screen-reader button layer).
  for (let turn = 0; turn < 5; turn++) {
    await expect(status(page)).toHaveText(/Your turn|You win!|You lose\.|Draw\./)
    if ((await status(page).textContent()) !== "Your turn") break
    const empty = page.locator('.cell-key[aria-label$="empty"]').first()
    await empty.focus()
    await page.keyboard.press("Enter")
    await expect(status(page)).not.toHaveText("Your turn")
  }
  await expect(status(page)).toHaveText(/You win!|You lose\.|Draw\./, { timeout: 15_000 })
  await shot(page, "round over vs computer")
})
