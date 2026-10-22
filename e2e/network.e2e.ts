import type { Page } from "@playwright/test"
import { expect, room, status, test } from "./fixtures.ts"

// Regression: buttons that are live before the room socket opens used to drop the click silently
// on slow networks (prod), while localhost connected too fast to notice.
// Every WebSocket stays CONNECTING for 1.5s before the real one is dialled (CDP throttling skips localhost WS).
const slowNetwork = (page: Page) =>
  page.addInitScript(() => {
    const Real = window.WebSocket
    class Slow {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 3
      readyState = 0
      onopen: ((e: Event) => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      onclose: ((e: CloseEvent) => void) | null = null
      private ws: WebSocket | null = null
      constructor(url: string) {
        setTimeout(() => {
          const ws = (this.ws = new Real(url))
          ws.onopen = (e) => ((this.readyState = 1), this.onopen?.(e))
          ws.onmessage = (e) => this.onmessage?.(e)
          ws.onclose = (e) => ((this.readyState = 3), this.onclose?.(e))
        }, 1500)
      }
      send(data: string) {
        if (this.readyState !== 1) throw new DOMException("Still in CONNECTING state.", "InvalidStateError")
        this.ws!.send(data)
      }
    }
    window.WebSocket = Slow as unknown as typeof WebSocket
  })

test("sudoku: Start pressed while still connecting still starts", async ({ page, shot }) => {
  await slowNetwork(page)
  await page.goto(`/sudoku/${room()}`)
  await expect(status(page)).toHaveText("Connecting…")
  await page.getByRole("button", { name: "Start" }).click()
  await expect(status(page)).toHaveText("Go!", { timeout: 20_000 })
  await shot(page, "started over a slow link")
})

test("checkers: Play the computer pressed while still connecting still seats it", async ({ page }) => {
  await slowNetwork(page)
  await page.goto(`/checkers/${room()}`)
  await expect(status(page)).toHaveText("Connecting…")
  await page.getByRole("button", { name: "Play the computer" }).click()
  await expect(status(page)).toHaveText("Your move", { timeout: 20_000 })
})
