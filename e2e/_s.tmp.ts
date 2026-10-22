import { chromium } from "@playwright/test"
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await b.newPage()
const errors: string[] = []
page.on("pageerror", (e) => errors.push(e.message))
// Log which band-pass / oscillator frequencies get scheduled, so each sound leaves a fingerprint.
await page.addInitScript(() => {
  const w = window as any
  w.__noise = 0; w.__osc = 0
  const bs = AudioContext.prototype.createBufferSource
  AudioContext.prototype.createBufferSource = function () { w.__noise++; return bs.call(this) }
  const os = AudioContext.prototype.createOscillator
  AudioContext.prototype.createOscillator = function () { w.__osc++; return os.call(this) }
})
await page.goto(`http://localhost:8787/poker/sfx${Date.now().toString(36)}`)
await page.getByLabel("Your name").fill("Sabili")
await page.getByRole("button", { name: "Take a seat" }).click()
for (let k = 0; k < 3; k++) { await page.getByRole("button", { name: "Add a bot" }).click(); await page.waitForTimeout(200) }
const snap = async (label: string) => console.log(label, await page.evaluate(() => [(window as any).__noise, (window as any).__osc]))
await snap("before deal  [noise, osc]")
await page.getByRole("button", { name: "Deal" }).click()
await page.waitForTimeout(1200)
await snap("after deal   [noise, osc]")
await page.getByRole("button", { name: "🔥" }).click()
await page.waitForTimeout(200)
await snap("after emote  [noise, osc]")
const call = page.locator(".act-buttons .btn--quiet").filter({ hasText: /^(Check|Call \d+)$/ })
while (!(await page.locator(".pod-tag.is-win").count())) {
  if (await call.count()) await call.first().click().catch(() => {})
  await page.waitForTimeout(60)
}
await page.waitForTimeout(2000)
await snap("after hand   [noise, osc]")
console.log("page errors:", errors.length ? errors : "none")
await b.close()
