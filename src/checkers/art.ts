import { paint, ARCADE as S } from "../paint.ts"

// 16x16 sprites, drawn at 4x. Pieces are discs with a raised rim and a ridge ring; kings get a gold crown.

const CROWN = ["#..#..#", "##.#.##", "#######", ".#####."]

const disc = (face: string, light: string, ridge: string, rim: string, king: boolean) =>
  paint(16, 16, (x, y) => {
    const px = x + 0.5
    const py = y + 0.5
    const top = Math.hypot(px - 8, py - 7)
    const bottom = Math.hypot(px - 8, py - 9)
    const inside = top <= 6.6 || bottom <= 6.6
    if (!inside) return undefined
    if (top > 5.8 && bottom > 5.8) return S.ink // outline
    if (top > 5.8) return rim // visible thickness under the face
    if (king) {
      const cx = x - 5
      const cy = y - 5
      if (cy >= 0 && cy < 4 && cx >= 0 && cx < 7 && CROWN[cy]![cx] === "#") return cy === 0 ? S.white : S.gold
    }
    if (top > 3.6 && top < 4.5) return ridge
    return top < 5 && px + py < 12 ? light : face
  })

const square = (fill: string | undefined, edge?: string) => paint(16, 16, (x, y) => (edge && (x === 0 || y === 0 || x === 15 || y === 15) ? edge : fill))

export const checkersArt = () => ({
  r: disc(S.orange, S.pink, S.red, S.red, false),
  R: disc(S.orange, S.pink, S.red, S.red, true),
  w: disc(S.white, S.white, S.lavender, S.slate, false),
  W: disc(S.white, S.white, S.lavender, S.slate, true),
  light: square(S.slate, S.edge),
  dark: square(S.dusk),
  lastMove: square(S.teal),
  select: square(undefined, S.mint),
  dot: paint(16, 16, (x, y) => {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8)
    return d <= 2.6 ? (d > 1.6 ? S.ink : S.mint) : undefined
  }),
  movable: paint(16, 16, (x, y) => ((x === 1 || y === 1 || x === 14 || y === 14) && (x + y) % 2 === 0 ? S.mint : undefined))
})
