import { inked, paint, ARCADE as S } from "../paint.ts"
import { RANKS, SUITS, type Card } from "./hand.ts"

// The table canvas is 480x360; the felt is painted at half size and drawn at 2x,
// so every art pixel on the table (felt, cards, chip) is the same 2x2 block.
export const TABLE_W = 480
export const TABLE_H = 360
export const TABLE_CX = 240
export const TABLE_CY = 176
export const BOARD_Y = 156
export const boardX = (i: number) => TABLE_CX + (i - 2) * 52

/** Racetrack (stadium) shape: straight sides of half-length `half`, round ends of radius `r`. */
export const stadium = (cx: number, cy: number, half: number) => (x: number, y: number) =>
  Math.hypot(Math.max(0, Math.abs(x - cx) - half), y - cy)

/** Point at fraction t (0 = bottom centre, clockwise on screen) along a stadium path. */
export const alongStadium = (cx: number, cy: number, half: number, r: number, t: number) => {
  const arc = Math.PI * r
  const total = 4 * half + 2 * arc
  let d = (((t % 1) + 1) % 1) * total
  if (d < half) return { x: cx - d, y: cy + r } // bottom, heading left
  d -= half
  if (d < arc) return { x: cx - half - r * Math.sin(d / r), y: cy + r * Math.cos(d / r) } // left end
  d -= arc
  if (d < 2 * half) return { x: cx - half + d, y: cy - r } // top
  d -= 2 * half
  if (d < arc) return { x: cx + half + r * Math.sin(d / r), y: cy - r * Math.cos(d / r) } // right end
  d -= arc
  return { x: cx + half - d, y: cy + r } // bottom, back to centre
}

// 5x7 rank glyphs ("10" is 7 wide) and 7x7 suits. "#" = ink.
const RANK_GLYPHS: Record<string, ReadonlyArray<string>> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  T: [".#..##.", "##.#..#", ".#.#..#", ".#.#..#", ".#.#..#", ".#.#..#", ".#..##."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"]
}

const SUIT_GLYPHS: Record<string, ReadonlyArray<string>> = {
  h: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
  d: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  s: ["...#...", "..###..", ".#####.", "#######", "#######", "...#...", "..###.."],
  c: ["..###..", "..###..", "##.#.##", "#######", "##.#.##", "...#...", "..###.."]
}

// Balatro-style cards, drawn 1:1 on the table canvas (twice the detail of the 2x felt):
// bold corner index (rank over suit, mirrored bottom-right), real pip layouts, outline and drop shadow.
const FW = 48
const FH = 64
const SHADOW = "rgba(16, 16, 32, 0.45)"
const SUIT_COLOR: Record<string, string> = { s: S.navy, h: S.red, d: S.orange, c: S.teal }

/** Rounded card body (2px corners) with an ink edge; `inner` paints the paper. Shadow falls 2px down-right. */
const card = (w: number, h: number, inner: (x: number, y: number) => string | undefined, shadow = 0) => {
  const at = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return "out"
    const cx = Math.min(x, w - 1 - x)
    const cy = Math.min(y, h - 1 - y)
    if (cx + cy < 2) return "out"
    return cx === 0 || cy === 0 || cx + cy === 2 ? "edge" : "in"
  }
  return paint(w + shadow, h + shadow, (x, y) => {
    const b = at(x, y)
    if (b === "edge") return S.ink
    if (b === "in") return inner(x, y)
    return shadow && at(x - shadow, y - shadow) !== "out" ? SHADOW : undefined
  })
}

const paper = (w: number, h: number, x: number, y: number) => (x === w - 2 || y === h - 2 ? S.mist : S.white)

/** Pip spots as [column 0..2, row 0..1]; pips in the lower half are drawn upside down, like a real deck. */
const PIPS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "2": [[1, 0], [1, 1]],
  "3": [[1, 0], [1, 0.5], [1, 1]],
  "4": [[0, 0], [2, 0], [0, 1], [2, 1]],
  "5": [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
  "6": [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  "7": [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  "8": [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
  "9": [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
  T: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]]
}
const CROWN = ["#.#.#", "#####", "#####"]

/** Glyph at (ox, oy), optionally turned 180°. */
const glyph = (g: ReadonlyArray<string>, ox: number, oy: number, x: number, y: number, k = 1, turned = false) => {
  const w = g[0]!.length * k
  const h = g.length * k
  return turned ? inked(g, ox, oy, 2 * ox + w - 1 - x, 2 * oy + h - 1 - y, k) : inked(g, ox, oy, x, y, k)
}

// Ceki's jokers ("Xs", "Xh", ...): a star, red for hearts/diamonds and dark for spades/clubs, like a real deck.
const STAR = ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", "##...##"]
const jokerColor = (s: string) => (s === "h" || s === "d" ? S.red : S.navy)

/** Full-size card face, 48x64 with shadow. */
export const face = (c: Card) => {
  const [r, s] = [c[0]!, c[1]!]
  if (r === "X")
    return card(FW, FH, (x, y) =>
      glyph(STAR, 3, 3, x, y, 1) || glyph(STAR, 3, 3, FW - 1 - x, FH - 1 - y, 1) || glyph(STAR, 10, 18, x, y, 4) ? jokerColor(s) : paper(FW, FH, x, y), 2)
  const rank = RANK_GLYPHS[r]!
  const suit = SUIT_GLYPHS[s]!
  const color = SUIT_COLOR[s]!
  // Corner index: big top-left for reading, a small copy turned 180° bottom-right.
  const index = (x: number, y: number, k: number) => {
    const ix = k === 2 && r === "T" ? 1 : 3
    return glyph(rank, ix, 3, x, y, k) || glyph(suit, ix + Math.floor((rank[0]!.length * k - 7) / 2), 5 + 7 * k, x, y)
  }
  const corner = (x: number, y: number) => index(x, y, 2) || index(FW - 1 - x, FH - 1 - y, 1)
  const royal = r === "J" || r === "Q" || r === "K"
  // Court cards: a framed panel in the suit colour, big white letter, gold crown for K and Q.
  const panel = (x: number, y: number) => {
    if (x < 15 || x > 32 || y < 7 || y > 56) return undefined
    if (x === 15 || x === 32 || y === 7 || y === 56) return color
    if (x === 16 || x === 31 || y === 8 || y === 55) return S.white
    if ((r === "K" || r === "Q") && glyph(CROWN, 19, 12, x, y, 2)) return S.gold
    if (glyph(rank, 17, 20, x, y, 3) || glyph(suit, 20, 45, x, y)) return S.white
    return color
  }
  const pips = PIPS[r] ?? []
  const cols = r === "T" ? [16, 21, 26] : [15, 21, 27] // the wide "10" index needs a narrower spread
  const pip = (x: number, y: number) => pips.some(([col, row]) => glyph(suit, cols[col]!, Math.round(9 + row * 39), x, y, 1, row > 0.5))
  return card(FW, FH, (x, y) => {
    if (corner(x, y)) return color
    if (royal) return panel(x, y) ?? paper(FW, FH, x, y)
    if (r === "A" ? glyph(suit, 13, 21, x, y, 3) : pip(x, y)) return color
    return paper(FW, FH, x, y)
  }, 2)
}

/** 24x32 card for opponents' fanned hands: just the corner index, which the fan leaves visible. */
export const mini = (c: Card | null) => {
  if (!c) return card(24, 32, (x, y) => backPattern(24, 32, x, y))
  if (c[0] === "X") return card(24, 32, (x, y) => (glyph(STAR, 5, 9, x, y, 2) ? jokerColor(c[1]!) : paper(24, 32, x, y)))
  const rank = RANK_GLYPHS[c[0]!]!
  const rw = rank[0]!.length * 2
  const rx = c[0] === "T" ? 1 : 2
  return card(24, 32, (x, y) =>
    glyph(rank, rx, 2, x, y, 2) || glyph(SUIT_GLYPHS[c[1]!]!, rx + Math.floor((rw - 7) / 2), 18, x, y) ? SUIT_COLOR[c[1]!] : paper(24, 32, x, y))
}

/** Lavender arcade deck: an ivory frame, indigo lattice, and a mint diamond. */
const backPattern = (w: number, h: number, x: number, y: number) => {
  if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3) return x === 1 || y === 1 || x === w - 2 || y === h - 2 ? S.white : S.slate
  if (x === 3 || y === 3 || x === w - 4 || y === h - 4) return S.white
  const d = Math.abs(x - (w - 1) / 2) + Math.abs(y - (h - 1) / 2)
  if (d < w / 6) return S.mint
  if (d < w / 6 + 1) return S.ink
  return (x + y) % 6 === 0 || (x - y + 120) % 6 === 0 ? S.lavender : S.slate
}
export const back = () => card(FW, FH, (x, y) => backPattern(FW, FH, x, y), 2)

// Chips: seen from straight above, like real chips tossed on felt. Hand-placed 13x13 sprite: ink outline,
// chip colour, eight white rim marks and a white inner ring. Several chips fall in a loose overlapping pile.
// o = ink · f = chip colour · s = marks
const CHIP_SPRITE = [
  "....ooooo....",
  "..oofsssfoo..",
  ".osfffffffso.",
  ".offsssssffo.",
  "offsfffffsffo",
  "osfsfffffsfso",
  "osfsfffffsfso",
  "osfsfffffsfso",
  "offsfffffsffo",
  ".offsssssffo.",
  ".osfffffffso.",
  "..oofsssfoo..",
  "....ooooo...."
]
const CHIP_SIZE = CHIP_SPRITE.length
/** Where chip i of a pile lands (top-left, px): a tight golden-angle spiral out from the centre, so a pot that
 * keeps merging bets visibly grows. The first chip sits in the middle, on top. */
const pileSpot = (i: number, spread: number): readonly [number, number] => {
  const r = spread * Math.sqrt(i)
  const a = i * 2.4
  return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a) * 0.85)]
}
/** Casino colours that stay readable on green felt (100 is the dark "black chip", never green). */
const CHIP: Record<number, { f: string; s: string }> = {
  10: { f: S.white, s: S.blue },
  50: { f: S.red, s: S.white },
  100: { f: S.dusk, s: S.white },
  500: { f: S.plum, s: S.white },
  1000: { f: S.gold, s: S.white },
  5000: { f: S.sky, s: S.white }
}
const piles = new Map<string, { url: string; w: number; h: number }>()

/** Data URL of a chip pile for these denominations (largest first = centre, on top), cached. */
export const chipStack = (coins: ReadonlyArray<number>, spread = 3.6) => {
  const key = `${spread}:${coins.join()}`
  let art = piles.get(key)
  if (!art) {
    const spots = coins.map((_, i) => pileSpot(i, spread))
    const ox = Math.min(...spots.map(([x]) => x))
    const oy = Math.min(...spots.map(([, y]) => y))
    const w = Math.max(...spots.map(([x]) => x)) - ox + CHIP_SIZE
    const h = Math.max(...spots.map(([, y]) => y)) - oy + CHIP_SIZE
    const canvas = paint(w, h, (x, y) => {
      for (let k = 0; k < coins.length; k++) {
        const c = CHIP_SPRITE[y + oy - spots[k]![1]]?.[x + ox - spots[k]![0]]
        if (!c || c === ".") continue
        const d = CHIP[coins[k]!]!
        return c === "o" ? S.ink : c === "f" ? d.f : d.s
      }
      return undefined
    })
    art = { url: canvas.toDataURL(), w, h }
    piles.set(key, art)
  }
  return art
}

/** Gold dealer button with a "D". */
const DEALER_D = ["###.", "#..#", "#..#", "#..#", "###."]
const dealer = () =>
  paint(11, 11, (x, y) => {
    const d = (x - 5) ** 2 + (y - 5) ** 2
    if (d > 30) return undefined
    if (d > 22) return S.ink
    if (inked(DEALER_D, 4, 3, x, y)) return S.ink
    return y < 4 ? S.white : S.gold
  })

// 4x4 Bayer matrix for ordered dithering.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/**
 * Casino racetrack table, painted at half size (240x180) and drawn at 2x:
 * ink outline, padded leather rail lit along its top, a thin wood trim, then felt that is
 * lighter in the middle and falls off to the trim (ordered dither), a betting line, and
 * five faint slots where the community cards land.
 */
export const felt = () => {
  const W = TABLE_W / 2
  const H = TABLE_H / 2
  const cx = TABLE_CX / 2
  const cy = TABLE_CY / 2
  const dist = stadium(cx, cy, 58)
  const R = 62 // outer radius
  const slots = [0, 1, 2, 3, 4].map((i) => ({ x: boardX(i) / 2 - 12, y: BOARD_Y / 2 - 16 }))
  return paint(W, H, (x, y) => {
    const d = dist(x + 0.5, y + 0.5)
    if (d > R) return undefined
    if (d > R - 1) return S.ink
    // Rail: dark padded leather, a highlight along the upper outer edge, darker underside.
    if (d > R - 9) {
      if (y < cy && d > R - 3) return S.slate
      if (y > cy + 30 && d > R - 3) return S.ink
      return d < R - 7 ? S.ink : S.dusk
    }
    // Lavender trim connects the felt to the arcade's other boards.
    if (d > R - 11) return y < cy ? S.lavender : S.slate
    if (d > R - 12) return S.ink
    // Betting line.
    if (Math.abs(d - 38) < 0.5) return x % 2 === 0 ? S.mint : S.green
    // Card slots: thin dark outline.
    for (const s of slots) {
      const inside = x >= s.x && x <= s.x + 23 && y >= s.y && y <= s.y + 31
      if (inside && (x === s.x || x === s.x + 23 || y === s.y || y === s.y + 31)) return S.teal
    }
    // Felt: green in the middle, dithering to teal toward the edge.
    const t = Math.max(0, (d - 22) / (R - 12 - 22)) // 0 centre .. 1 trim
    return BAYER[(y % 4) * 4 + (x % 4)]! / 16 < t * 0.85 ? S.teal : S.green
  })
}

export const pokerArt = () => ({
  faces: new Map<string, HTMLCanvasElement>([...RANKS].flatMap((r) => [...SUITS].map((s) => [r + s, face(r + s)] as const))),
  back: back(),
  mini: new Map<string, HTMLCanvasElement>([["back", mini(null)], ...[...RANKS].flatMap((r) => [...SUITS].map((s) => [r + s, mini(r + s)] as const))]),
  dealer: dealer(),
  felt: felt()
})
