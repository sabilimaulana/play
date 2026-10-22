import type { Page } from "@playwright/test"
import { expect, room, status, test } from "./fixtures.ts"

// Read the givens off the grid's accessible labels, then solve it (plain backtracking).
const readPuzzle = (page: Page) =>
  page.locator(".sd-cell").evaluateAll((cells) =>
    cells.map((c) => +(c.getAttribute("aria-label")!.match(/: (\d), given$/)?.[1] ?? 0)))

const solve = (g: number[]): boolean => {
  const i = g.indexOf(0)
  if (i < 0) return true
  const [r, c] = [Math.floor(i / 9), i % 9]
  for (let d = 1; d <= 9; d++) {
    const clash = g.some((v, j) => v === d && (Math.floor(j / 9) === r || j % 9 === c ||
      (Math.floor(j / 27) === Math.floor(i / 27) && Math.floor((j % 9) / 3) === Math.floor(c / 3))))
    if (clash) continue
    g[i] = d
    if (solve(g)) return true
  }
  g[i] = 0
  return false
}

test("two-player race: same puzzle, clashes flagged, first to finish wins", async ({ page, friend, shot }) => {
  const url = `/sudoku/${room()}`
  await page.goto(url)
  await expect(status(page)).toHaveText("Pick a level")
  await friend.goto(url)
  await expect(page.locator(".players > li")).toHaveCount(2)

  await page.getByRole("button", { name: "Easy" }).click()
  await page.getByRole("button", { name: "Start" }).click()
  await expect(status(page)).toHaveText("Go!")
  await expect(status(friend)).toHaveText("Go!")

  const puzzle = await readPuzzle(page)
  expect(await readPuzzle(friend)).toEqual(puzzle)
  expect(puzzle.filter(Boolean).length).toBeGreaterThanOrEqual(25)
  const solution = [...puzzle]
  expect(solve(solution)).toBe(true)
  const blanks = puzzle.flatMap((d, i) => (d ? [] : [i]))
  await shot(page, "race started, same puzzle on both")

  // A digit that repeats a given in the same row is flagged, then erased with the keypad.
  const first = blanks[0]!
  const rowGiven = puzzle.slice(first - (first % 9), first - (first % 9) + 9).find(Boolean)!
  await page.locator(".sd-cell").nth(first).click()
  await page.locator(".keypad").getByRole("button", { name: `${rowGiven}`, exact: true }).click()
  await expect(page.locator(".sd-cell").nth(first)).toHaveAttribute("aria-label", /clashes$/)
  await shot(page, "clash flagged")
  await page.locator(".keypad").getByRole("button", { name: "Erase" }).click()
  await expect(page.locator(".sd-cell").nth(first)).toHaveAttribute("aria-label", /empty$/)

  // Friend makes some progress so the race is real.
  for (const i of blanks.slice(0, 3)) {
    await friend.locator(".sd-cell").nth(i).click()
    await friend.keyboard.press(`${solution[i]}`)
  }

  for (const i of blanks) {
    await page.locator(".sd-cell").nth(i).click()
    await page.keyboard.press(`${solution[i]}`)
  }
  await expect(status(page)).toHaveText("You win!")
  await expect(status(friend)).toHaveText("Your friend wins.")
  await shot(page, "winner")
  await shot(friend, "runner-up")
})

test("givens can't be overwritten", async ({ page }) => {
  await page.goto(`/sudoku/${room()}`)
  await page.getByRole("button", { name: "Start" }).click()
  await expect(status(page)).toHaveText("Go!")
  const given = (await readPuzzle(page)).findIndex(Boolean)
  await page.locator(".sd-cell").nth(given).click()
  await page.keyboard.press("5")
  await expect(status(page)).toHaveText("That number is part of the puzzle.")
})
