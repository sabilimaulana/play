import { test as base, expect, type Page, type TestInfo } from "@playwright/test"

// Any uncaught error in a player's page fails the test, even if the assertions happened to pass.
// Every room-socket frame is logged and attached, so a lost move shows which side dropped it.
const noPageErrors = async (page: Page, use: (page: Page) => Promise<void>, testInfo: TestInfo, who: string) => {
  const errors: string[] = []
  const log: string[] = []
  const t0 = Date.now()
  const at = () => `${String(Date.now() - t0).padStart(6)}ms`
  page.on("pageerror", (e) => errors.push(e.stack ?? e.message))
  page.on("websocket", (ws) => {
    log.push(`${at()} open  ${ws.url()}`)
    ws.on("framesent", (f) => log.push(`${at()} -> ${String(f.payload).slice(0, 160)}`))
    ws.on("framereceived", (f) => log.push(`${at()} <- ${String(f.payload).slice(0, 160)}`))
    ws.on("socketerror", (e) => log.push(`${at()} error ${e}`))
    ws.on("close", () => log.push(`${at()} close`))
  })
  await use(page)
  if (log.length) await testInfo.attach(`${who} socket log`, { body: log.join("\n"), contentType: "text/plain" })
  expect(errors, "uncaught page errors").toEqual([])
}

// `page` is player one. `friend` is a second browser (own storage = own player id), with its
// own video attached to the report, so multiplayer runs have proof from both sides.
export const test = base.extend<{ friend: Page; shot: (page: Page, name: string) => Promise<void> }>({
  page: async ({ page }, use, testInfo) => noPageErrors(page, use, testInfo, "player one"),
  friend: async ({ browser, baseURL, viewport }, use, testInfo) => {
    const context = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
      viewport,
      recordVideo: { dir: testInfo.outputPath("friend-video"), size: { width: 1280, height: 800 } }
    })
    const page = await context.newPage()
    await noPageErrors(page, use, testInfo, "friend")
    await context.close()
    const video = await page.video()?.path()
    if (video) await testInfo.attach("friend video", { path: video, contentType: "video/webm" })
  },
  // Named full-page screenshot attached to the report as a proof step.
  shot: async ({}, use, testInfo) => {
    let shots = 0
    await use(async (page, name) => {
      const path = testInfo.outputPath(`shot-${String(++shots).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`)
      await page.screenshot({ path, fullPage: true })
      await testInfo.attach(name, { path, contentType: "image/png" })
    })
  }
})

export { expect }

export const room = () => Math.random().toString(36).slice(2, 12)

export const status = (page: Page) => page.locator(".status-main")
