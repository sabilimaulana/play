import { paint, ARCADE as S } from "../paint.ts"

/** Quiet indigo tiles and inset, generously sized marks in the Pocket Arcade palette. */
const mark = (kind: "X" | "O") => paint(16, 16, (x, y) => {
  const px = x - 7.5
  const py = y - 7.5
  if (Math.max(Math.abs(px), Math.abs(py)) > 5.5) return undefined
  if (kind === "X") {
    if (Math.min(Math.abs(px - py), Math.abs(px + py)) > 1.5) return undefined
    return py < -3 ? S.pink : S.orange
  }
  const d = Math.hypot(px, py)
  if (d > 5.7 || d < 3.2) return undefined
  return py < -3.5 ? S.cyan : S.sky
})

const tile = (winning: boolean) => paint(16, 16, (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return winning ? S.mint : S.slate
  if (y === 14) return S.ink
  return winning ? S.teal : S.dusk
})

export const tttArt = () => ({
  X: mark("X"), O: mark("O"), tile: tile(false), win: tile(true)
})
