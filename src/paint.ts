// Pixel painting on plain canvases (no Pixi), so the home page can draw art without the game engine.

/** Pocket Arcade art palette, paired with the interface roles in tokens.css. */
export const ARCADE = {
  ink: "#101020",
  plum: "#ac94eb",
  red: "#b84867",
  orange: "#ff6c72",
  gold: "#ffcf5f",
  lime: "#8aefb0",
  green: "#237b62",
  teal: "#194c40",
  navy: "#29263f",
  blue: "#287fa5",
  sky: "#56bde5",
  cyan: "#96e3f3",
  white: "#f7f3e9",
  mist: "#b7b0ca",
  slate: "#5c5187",
  dusk: "#23223d",
  lavender: "#ac94eb",
  mint: "#8aefb0",
  pink: "#e4a3c3",
  edge: "#403956"
} as const

export type Pixels = (x: number, y: number) => string | undefined

/** One canvas, one pixel at a time: `color(x, y)` returns a colour or undefined (transparent). */
export const paint = (width: number, height: number, color: Pixels): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = color(x, y)
      if (!c) continue
      ctx.fillStyle = c
      ctx.fillRect(x, y, 1, 1)
    }
  return canvas
}

/** Character-map sprite: one char per pixel, looked up in `palette`; "." is transparent. */
export const sprite = (rows: ReadonlyArray<string>, palette: Record<string, string>): HTMLCanvasElement =>
  paint(rows[0]!.length, rows.length, (x, y) => palette[rows[y]![x]!])

/** Composes canvases onto a new canvas of the given size. */
export const compose = (
  width: number,
  height: number,
  background: string | undefined,
  layers: ReadonlyArray<readonly [HTMLCanvasElement, number, number]>
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  for (const [layer, x, y] of layers) ctx.drawImage(layer, x, y)
  return canvas
}

/** True when the glyph (rows of "#") covers (x, y) drawn at (ox, oy) with integer zoom k. */
export const inked = (glyph: ReadonlyArray<string>, ox: number, oy: number, x: number, y: number, k = 1): boolean =>
  x >= ox && y >= oy && glyph[Math.floor((y - oy) / k)]?.[Math.floor((x - ox) / k)] === "#"

/** A canvas as an <img>-like element for the DOM: crisp scaling, decorative. */
export const pixelArt = (canvas: HTMLCanvasElement, className: string): HTMLCanvasElement => {
  canvas.className = className
  canvas.setAttribute("aria-hidden", "true")
  return canvas
}
