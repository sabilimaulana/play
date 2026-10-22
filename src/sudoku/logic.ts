// Sudoku race, pure rules. Everyone in the round solves the same puzzle on their own grid;
// the first to finish wins. Alone it's a solo time trial. Grids are 81-arrays, 0 = empty.

export type Level = "easy" | "medium" | "hard"
export const LEVELS: ReadonlyArray<Level> = ["easy", "medium", "hard"]
/** Target clue count per level (a unique solution is always kept, so it can end up a few higher). */
const CLUES: Record<Level, number> = { easy: 40, medium: 32, hard: 25 }
export const MAX_PLAYERS = 2

export interface Game {
  readonly seats: ReadonlyArray<string> // up to MAX_PLAYERS, in join order
  readonly wins: Readonly<Record<string, number>>
  readonly level: Level
  readonly puzzle: ReadonlyArray<number> | null // null until the first round starts
  readonly solution: ReadonlyArray<number> | null
  readonly startedAt: number | null
  readonly racers: ReadonlyArray<string> // seats playing this round
  readonly grids: Readonly<Record<string, ReadonlyArray<number>>>
  readonly finished: Readonly<Record<string, number>> // ms from start
  readonly winner: string | null
}

export interface PlayerView {
  readonly you: boolean
  readonly avatar: string
  readonly online: boolean
  readonly racing: boolean
  readonly filled: number // cells filled in (not whether they're right)
  readonly finishedMs: number | null
  readonly wins: number
}

export interface View {
  readonly turnMs?: number | null
  readonly event?: "timeout"
  readonly stage: "waiting" | "racing" | "done"
  readonly level: Level
  readonly puzzle: ReadonlyArray<number> | null
  /** Your grid this round (the puzzle when you're not racing). */
  readonly grid: ReadonlyArray<number> | null
  readonly seated: boolean
  readonly racing: boolean
  /** Ms since the round started; the client counts up from here. */
  readonly elapsedMs: number | null
  readonly players: ReadonlyArray<PlayerView>
  readonly winner: number | null // index into players
  /** Cells left to fill in the round (puzzle blanks). */
  readonly blanks: number
}

export type ClientMessage =
  | { readonly t: "start"; readonly level: Level }
  | { readonly t: "set"; readonly i: number; readonly v: number }

export const newGame = (): Game => ({
  seats: [], wins: {}, level: "easy", puzzle: null, solution: null, startedAt: null, racers: [], grids: {}, finished: {}, winner: null
})

export const join = (g: Game, pid: string): Game =>
  g.seats.includes(pid) || g.seats.length >= MAX_PLAYERS ? g : { ...g, seats: [...g.seats, pid] }

const racing = (g: Game) => g.puzzle !== null && g.winner === null

// --- Solver / generator ----------------------------------------------------

const box = (i: number) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)

/** Bitmask of digits 1-9 that can go in empty cell i. */
const candidates = (grid: ReadonlyArray<number>, i: number) => {
  let used = 0
  const r = Math.floor(i / 9)
  const c = i % 9
  for (let k = 0; k < 81; k++) if (grid[k] && (Math.floor(k / 9) === r || k % 9 === c || box(k) === box(i))) used |= 1 << grid[k]!
  return ~used & 0b1111111110
}

/** Counts solutions up to `limit`, filling `grid` in place with the last one found. Tries digits in `order`. */
const solve = (grid: number[], limit: number, order: ReadonlyArray<number>): number => {
  // Most constrained empty cell first keeps this fast.
  let best = -1
  let bestMask = 0
  let bestCount = 10
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue
    const mask = candidates(grid, i)
    let n = 0
    for (let m = mask; m; m &= m - 1) n++
    if (n < bestCount) [best, bestMask, bestCount] = [i, mask, n]
    if (n === 0) return 0
  }
  if (best < 0) return 1
  let found = 0
  for (const d of order) {
    if (!(bestMask & (1 << d))) continue
    grid[best] = d
    found += solve(grid, limit - found, order)
    if (found >= limit) return found
  }
  grid[best] = 0
  return found
}

const shuffled = <T>(xs: ReadonlyArray<T>, random: () => number): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** A random full grid, then clues removed one at a time while the solution stays unique. */
export const generate = (level: Level, random: () => number): { puzzle: number[]; solution: number[] } => {
  const solution = Array<number>(81).fill(0)
  solve(solution, 1, shuffled(DIGITS, random))
  const puzzle = [...solution]
  let clues = 81
  for (const i of shuffled([...Array(81).keys()], random)) {
    if (clues <= CLUES[level]) break
    const keep = puzzle[i]!
    puzzle[i] = 0
    if (solve([...puzzle], 2, DIGITS) === 1) clues--
    else puzzle[i] = keep
  }
  return { puzzle, solution }
}

// --- Actions ---------------------------------------------------------------

/** New round for the seated players who are here. Mid-race only a lone racer may restart. */
export const start = (g: Game, pid: string, level: Level, online: ReadonlySet<string>, now: number, random: () => number): Game | string => {
  if (!g.seats.includes(pid)) return "not a player"
  if (racing(g) && g.racers.length > 1) return "race in progress"
  const { puzzle, solution } = generate(level, random)
  const racers = g.seats.filter((p) => online.has(p))
  return { ...g, level, puzzle, solution, startedAt: now, racers, grids: Object.fromEntries(racers.map((p) => [p, puzzle])), finished: {}, winner: null }
}

export const set = (g: Game, pid: string, i: number, v: number, now: number): Game | string => {
  const grid = g.grids[pid]
  if (!racing(g) || !grid) return "not racing"
  if (!Number.isInteger(i) || i < 0 || i > 80 || g.puzzle![i]) return "bad cell"
  if (!Number.isInteger(v) || v < 0 || v > 9) return "bad digit"
  const next = grid.map((d, k) => (k === i ? v : d))
  const g2 = { ...g, grids: { ...g.grids, [pid]: next } }
  if (next.some((d, k) => d !== g.solution![k])) return g2
  return { ...g2, finished: { [pid]: now - g.startedAt! }, winner: pid, wins: { ...g.wins, [pid]: (g.wins[pid] ?? 0) + 1 } }
}

export const view = (g: Game, pid: string, online: ReadonlySet<string>, now: number, avatarOf: (pid: string) => string): View => {
  const blanks = g.puzzle?.filter((d) => !d).length ?? 0
  const players = g.seats.map((p): PlayerView => ({
    you: p === pid,
    avatar: avatarOf(p),
    online: online.has(p),
    racing: g.racers.includes(p),
    filled: g.grids[p] && g.puzzle ? g.grids[p].filter((d, k) => d && !g.puzzle![k]).length : 0,
    finishedMs: g.finished[p] ?? null,
    wins: g.wins[p] ?? 0
  }))
  return {
    stage: !g.puzzle ? "waiting" : g.winner ? "done" : "racing",
    level: g.level,
    puzzle: g.puzzle,
    grid: g.grids[pid] ?? g.puzzle,
    seated: g.seats.includes(pid),
    racing: racing(g) && g.racers.includes(pid),
    elapsedMs: g.startedAt === null ? null : g.winner ? g.finished[g.winner]! : now - g.startedAt,
    players,
    winner: g.winner ? g.seats.indexOf(g.winner) : null,
    blanks
  }
}

export const parseMessage = (raw: unknown): ClientMessage | null => {
  if (typeof raw !== "string" || raw.length > 64) return null
  try {
    const m = JSON.parse(raw) as { t?: unknown; i?: unknown; v?: unknown; level?: unknown }
    if (m?.t === "set" && typeof m.i === "number" && typeof m.v === "number") return { t: "set", i: m.i, v: m.v }
    if (m?.t === "start" && LEVELS.includes(m.level as Level)) return { t: "start", level: m.level as Level }
  } catch {}
  return null
}

/** Cells that clash with another cell in their row, column or box (mistakes you can see without the answer). */
export const conflicts = (grid: ReadonlyArray<number>): Set<number> => {
  const bad = new Set<number>()
  for (let a = 0; a < 81; a++)
    for (let b = a + 1; b < 81; b++)
      if (grid[a] && grid[a] === grid[b] && (Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 || box(a) === box(b))) bad.add(a).add(b)
  return bad
}
