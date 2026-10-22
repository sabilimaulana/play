import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch();
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const results = [];
try {
  for (const direction of ['pocket', 'playroom', 'afterhours']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = async view => {
      await page.goto(`${base}/design-candidates/?direction=${direction}&view=${view}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
    };
    await open('home');
    await page.screenshot({ path: `design-candidates/screenshots/${direction}-desktop.png`, fullPage: true });
    await open('room');
    const cells = page.locator('[data-cell]');
    await cells.nth(0).click();
    await cells.nth(4).click();
    await page.screenshot({ path: `design-candidates/screenshots/${direction}-room.png`, fullPage: true });
    await page.locator('#reset').click();
    for (const cell of [0, 3, 1, 4, 2]) await cells.nth(cell).click();
    if (await page.locator('#turn-heading').textContent() !== 'You win!') throw new Error(`${direction}: win state failed`);
    if (await page.locator('.winning').count() !== 3) throw new Error(`${direction}: winning line failed`);
    if (await page.locator('#score-x').textContent() !== '1') throw new Error(`${direction}: score failed`);
    await page.locator('#reset').click();
    for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await cells.nth(cell).click();
    if (await page.locator('#score-draw').textContent() !== '1') throw new Error(`${direction}: draw state failed`);
    await page.locator('#reset').click();
    await cells.nth(0).focus();
    await page.keyboard.press('Enter');
    if (!(await cells.nth(0).getAttribute('aria-label')).endsWith('X')) throw new Error(`${direction}: keyboard failed`);
    const widths = [];
    for (const width of [320, 375, 390, 414, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      for (const view of ['home', 'room']) {
        await open(view);
        const measure = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
        if (measure.scroll > measure.viewport) throw new Error(`${direction}/${view} overflows at ${width}: ${measure.scroll}`);
        if (width === 390) await page.screenshot({ path: `design-candidates/screenshots/${direction}-${view === 'home' ? 'mobile' : 'room-mobile'}.png`, fullPage: true });
      }
      widths.push(width);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open('room');
    if (await cells.nth(0).evaluate(el => getComputedStyle(el).transitionDuration) !== '0s') throw new Error(`${direction}: reduced motion failed`);
    if (errors.length) throw new Error(errors.join('\n'));
    results.push({ direction, widths, screens: ['library', 'room'], win: 'pass', draw: 'pass', reset: 'pass', keyboard: 'pass', reducedMotion: 'pass', browserErrors: errors });
    console.log(`${direction}: captures and checks passed`);
    await page.close();
  }
  await writeFile('design-candidates/validation.json', JSON.stringify(results, null, 2) + '\n');
} finally {
  await browser.close();
}
