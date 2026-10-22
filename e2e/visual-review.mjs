// Capture the real local app, including active games, at desktop and mobile sizes.
// Run after `bun run build` with the local Worker running on :8787.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.BASE_URL || 'http://localhost:8787'
const out = 'screenshots/pocket-arcade'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const issues = []
const checks = []
const pages = ['home', 'tictactoe', 'checkers', 'sudoku', 'poker', 'circccle']
const imagesReady = async page => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every(img => img.complete), { timeout: 5000 }).catch(() => {})
}
try {
  for (const width of [1440, 390]) {
    for (const game of pages) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] })
      const page = await context.newPage()
      page.on('pageerror', error => issues.push({ game, width, error: error.message }))
      const id = `visual${Math.random().toString(36).slice(2, 10)}`
      await page.goto(`${base}${game === 'home' ? '/' : `/${game}/${id}`}`)
      if (game !== 'home') await page.waitForFunction(() => !/Connecting|Reconnecting/.test(document.querySelector('.status-main')?.textContent || 'Connecting'))
      if (game === 'tictactoe' || game === 'checkers') {
        if (game === 'tictactoe' && width === 1440) {
          await imagesReady(page)
          await page.screenshot({ path: `${out}/tictactoe-waiting.png`, fullPage: true })
          await page.getByRole('button', { name: 'Copy link', exact: true }).click()
          if (await page.evaluate(() => navigator.clipboard.readText()) !== page.url()) throw new Error('Invite copied a different URL')
        }
        await page.getByRole('button', { name: 'Play the computer' }).click()
        await page.waitForFunction(() => /Your (turn|move)/.test(document.querySelector('.status-main')?.textContent || ''))
        if (game === 'tictactoe') {
          await page.locator('.cell-key').nth(4).focus()
          await page.keyboard.press('Enter')
          await page.waitForFunction(() => document.querySelectorAll('.cell-key[aria-label$="O"]').length > 0)
        }
      } else if (game === 'sudoku') {
        await page.getByRole('button', { name: 'Start', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.status-main')?.textContent === 'Go!')
        await page.locator('.sd-cell[aria-label$="empty"]').first().click()
        await page.getByRole('button', { name: 'Notes off' }).click()
        await page.keyboard.press('2')
        await page.keyboard.press('7')
      } else if (game === 'poker') {
        await page.getByLabel('Your name').fill('Sabil')
        await page.getByRole('button', { name: 'Take a seat' }).click()
        await page.getByRole('button', { name: 'Add a bot' }).click()
        await page.getByRole('button', { name: 'Deal', exact: true }).click()
        await page.waitForFunction(() => /Your turn|won/.test(document.querySelector('.status-main')?.textContent || ''))
        await page.waitForTimeout(800) // Finish the deal animation before inspecting card placement.
      } else if (game === 'circccle') {
        await page.getByLabel('Your name').fill('Sabil')
        await page.getByRole('button', { name: 'Save', exact: true }).click()
        await page.waitForTimeout(700)
      }
      await imagesReady(page)
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
      const label = width === 1440 ? 'desktop' : 'mobile'
      await page.screenshot({ path: `${out}/${game}-${label}.png`, fullPage: true })
      // Validate all intermediate widths on the same live screen.
      for (const size of width === 1440 ? [1440, 1024, 768] : [390, 375, 320, 414]) {
        await page.setViewportSize({ width: size, height: 1000 })
        const overflow = await page.evaluate(() => {
          const width = document.documentElement.clientWidth
          return [...document.querySelectorAll('header, main, footer, .room, .stage, .side, .actions, .panel, .sudoku, .board-frame, .table, .cabinet')].filter(el => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.right > width + 1 || r.left < -1)
          }).map(el => ({ element: el.className, width: el.getBoundingClientRect().width }))
        })
        const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
        checks.push({ game, width: size, documentFits, overflow })
        if (!documentFits || overflow.length) issues.push({ game, width: size, overflow })
      }
      console.log(`${game} ${label}: screenshot captured`)
      await context.close()
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(base)
  await page.locator('.game-menu summary').click()
  if (!(await page.getByRole('navigation', { name: 'Games' }).isVisible())) throw new Error('Game menu did not open')
  await page.keyboard.press('Escape')
  if (await page.locator('.game-menu').getAttribute('open') !== null) throw new Error('Escape did not close game menu')
  await page.locator('.sound').click()
  const muted = await page.locator('.sound').getAttribute('aria-pressed')
  await page.reload()
  if (await page.locator('.sound').getAttribute('aria-pressed') !== muted) throw new Error('Sound preference not remembered')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const duration = await page.locator('.hero-cta').evaluate(el => getComputedStyle(el).transitionDuration)
  if (duration !== '0s') throw new Error('Reduced motion did not disable button transitions')
  await writeFile(`${out}/validation.json`, JSON.stringify({ base, checks, issues, menu: 'pass', clipboard: 'pass', soundPreference: 'pass', reducedMotion: 'pass' }, null, 2) + '\n')
  if (issues.length) throw new Error(`${issues.length} issues: ${JSON.stringify(issues)}`)
} finally {
  await browser.close()
}
