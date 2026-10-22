import type { Page } from "@playwright/test"

// Boards are Pixi canvases; the invisible .cell-key grid sits exactly over the squares (pointer-events: none).
// Clicking its centre with the real mouse exercises the canvas hit-testing, like a player would.
export const clickCell = async (page: Page, i: number) => {
  const box = (await page.locator(".cell-key").nth(i).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(60) // hold across a frame so the ECS pointer system sees the press
  await page.mouse.up()
}
