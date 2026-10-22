// American checkers (English draughts), pure rules. 8x8 board as a 64-array, row 0 at the top.
// Red starts at the bottom (rows 5-7) and moves first; white starts at the top.

export type Side = "red" | "white"
export type Piece = "r" | "R" | "w" | "W" | null // capital = king
export type Step = readonly [from: number, to: number]

export interface Game {
  readonly board: ReadonlyArray<Piece>
  readonly turn: Side
  readonly starter: Side
  readonly forced: number | null // piece that must keep jumping (multi-jump in progress)
  readonly last: { readonly from: number; readonly to: number; readonly captured: number | null } | null
  readonly winner: Side | null
  readonly seats: { readonly red: string | null; readonly white: string | null }
  readonly score: { readonly red: number; readonly white: number }
}

export interface View {
  readonly turnMs?: number | null
  readonly event?: "timeout"
  readonly board: ReadonlyArray<Piece>
  readonly turn: Side
  readonly forced: number | null
  readonly last: Game["last"]
  readonly winner: Side | null
  readonly you: Side | null
  readonly online: { readonly red: boolean; readonly white: boolean }
  readonly avatars: { readonly red: string | null; readonly white: string | null }
  /** The side played by the computer, if any. */
  readonly bot: Side | null
  readonly score: Game["score"]
  /** Your legal steps right now (empty when it isn't your move). */
  readonly moves: ReadonlyArray<Step>
}

export type ClientMessage =
  | { readonly t: "move"; readonly from: number; readonly to: number }
  | { readonly t: "rematch" }
  | { readonly t: "resign" }
  | { readonly t: "bot" }

/** Player id of the computer opponent. */
export const BOT = "bot"

export const TURN_MS = 30_000

export const other = (s: Side): Side => (s === "red" ? "white" : "red")
export const sideOf = (p: Piece): Side | null => (p === "r" || p === "R" ? "red" : p === "w" || p === "W" ? "white" : null)
const isKing = (p: Piece) => p === "R" || p === "W"
const dark = (r: number, c: number) => (r + c) % 2 === 1

const DIRS = {
  red: [[-1, -1], [-1, 1]],
  white: [[1, -1], [1, 1]],
  king: [[-1, -1], [-1, 1], [1, -1], [1, 1]]
} as const

const dirsOf = (p: Piece) => (isKing(p) ? DIRS.king : DIRS[sideOf(p)!])
const at = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1)

export const newBoard = (): Piece[] =>
  Array.from({ length: 64 }, (_, i) => {
    const r = i >> 3
    const c = i & 7
    if (!dark(r, c)) return null
    return r < 3 ? "w" : r > 4 ? "r" : null
  })

export const newGame = (): Game => ({
  board: newBoard(),
  turn: "red",
  starter: "red",
  forced: null,
  last: null,
  winner: null,
  seats: { red: null, white: null },
  score: { red: 0, white: 0 }
})

const jumpsFrom = (board: ReadonlyArray<Piece>, i: number): Step[] => {
  const p = board[i] ?? null
  const side = sideOf(p)
  if (!side) return []
  const r = i >> 3
  const c = i & 7
  return dirsOf(p).flatMap(([dr, dc]) => {
    const mid = at(r + dr, c + dc)
    const dest = at(r + 2 * dr, c + 2 * dc)
    return mid >= 0 && dest >= 0 && sideOf(board[mid] ?? null) === other(side) && board[dest] === null ? [[i, dest] as const] : []
  })
}

const stepsFrom = (board: ReadonlyArray<Piece>, i: number): Step[] => {
  const p = board[i] ?? null
  const r = i >> 3
  const c = i & 7
  return dirsOf(p).flatMap(([dr, dc]) => {
    const dest = at(r + dr, c + dc)
    return dest >= 0 && board[dest] === null ? [[i, dest] as const] : []
  })
}

/** Legal steps for the side to move: the forced piece's jumps, else any jumps (mandatory), else plain moves. */
export const legalMoves = (g: Pick<Game, "board" | "turn" | "forced">): Step[] => {
  if (g.forced !== null) return jumpsFrom(g.board, g.forced)
  const mine = g.board.flatMap((p, i) => (sideOf(p) === g.turn ? [i] : []))
  const jumps = mine.flatMap((i) => jumpsFrom(g.board, i))
  return jumps.length ? jumps : mine.flatMap((i) => stepsFrom(g.board, i))
}

export const seatOf = (g: Game, pid: string): Side | null => (g.seats.red === pid ? "red" : g.seats.white === pid ? "white" : null)

export const join = (g: Game, pid: string): Game => {
  if (seatOf(g, pid)) return g
  if (!g.seats.red) return { ...g, seats: { ...g.seats, red: pid } }
  if (!g.seats.white) return { ...g, seats: { ...g.seats, white: pid } }
  return g
}

const win = (g: Game, side: Side): Game => ({ ...g, winner: side, forced: null, score: { ...g.score, [side]: g.score[side] + 1 } })

export const move = (g: Game, pid: string, from: number, to: number): Game | string => {
  const side = seatOf(g, pid)
  if (!side) return "not a player"
  if (!g.seats.red || !g.seats.white) return "waiting for opponent"
  if (g.winner) return "game over"
  if (g.turn !== side) return "not your turn"
  if (!legalMoves(g).some(([f, t]) => f === from && t === to)) return "illegal move"

  const board = [...g.board]
  const piece = board[from]!
  board[to] = piece
  board[from] = null
  const jump = Math.abs((to >> 3) - (from >> 3)) === 2
  const captured = jump ? ((from + to) >> 1) : null
  if (captured !== null) board[captured] = null
  const row = to >> 3
  const promoted = (piece === "r" && row === 0) || (piece === "w" && row === 7)
  if (promoted) board[to] = piece === "r" ? "R" : "W"

  const last = { from, to, captured }
  // Multi-jump: the same piece keeps going unless it was just crowned.
  if (jump && !promoted && jumpsFrom(board, to).length) return { ...g, board, last, forced: to }
  const next: Game = { ...g, board, last, forced: null, turn: other(side) }
  return legalMoves(next).length ? next : win(next, side)
}

export const resign = (g: Game, pid: string): Game | string => {
  const side = seatOf(g, pid)
  if (!side) return "not a player"
  if (g.winner) return "game over"
  return win(g, other(side))
}

/** Fresh board after a finished game; the other side starts (colours stay with their players). */
export const rematch = (g: Game, pid: string): Game | string => {
  if (!seatOf(g, pid)) return "not a player"
  if (!g.winner) return "game not over"
  const starter = other(g.starter)
  return { ...g, board: newBoard(), winner: null, forced: null, last: null, starter, turn: starter }
}

export const turnKey = (g: Game, bothOnline: boolean): string | null =>
  !g.winner && bothOnline ? `${g.board.join()}|${g.turn}|${g.forced}` : null

/** Time's up: a random legal step for the side to move. */
export const timeoutMove = (g: Game, random: () => number): Game => {
  const pid = g.seats[g.turn]
  const moves = legalMoves(g)
  if (!pid || g.winner || !moves.length) return g
  const [from, to] = moves[Math.floor(random() * moves.length)]!
  const next = move(g, pid, from, to)
  return typeof next === "string" ? g : next
}

/** A seated player fills the empty seat with the computer. */
export const addBot = (g: Game, pid: string): Game | string => {
  const side = seatOf(g, pid)
  if (!side) return "not a player"
  if (g.seats[other(side)]) return "seat taken"
  return { ...g, seats: { ...g.seats, [other(side)]: BOT } }
}

/** Material from `side`'s point of view: men 2, kings 3. */
const material = (board: ReadonlyArray<Piece>, side: Side) =>
  board.reduce((sum, p) => (p ? sum + (sideOf(p) === side ? 1 : -1) * (isKing(p) ? 3 : 2) : sum), 0)

/** Negamax score for the side to move. A multi-jump continuation is the same turn, so it doesn't use up depth. */
const search = (g: Game, depth: number): number => {
  if (g.winner) return g.winner === g.turn ? 1000 : -1000
  if (depth === 0) return material(g.board, g.turn)
  let best = -Infinity
  for (const [from, to] of legalMoves(g)) {
    const n = move(g, g.seats[g.turn]!, from, to) as Game
    best = Math.max(best, n.turn === g.turn && !n.winner ? search(n, depth) : -search(n, depth - 1))
  }
  return best
}

// ponytail: 4-ply material search, no move ordering or pruning; add alpha-beta if it needs to look deeper.
const DEPTH = 4

/** The computer's step: best by a short look-ahead, random among equals. */
export const botMove = (g: Game, random: () => number): Game => {
  if (g.winner || g.seats[g.turn] !== BOT) return g
  const scored = legalMoves(g).map(([from, to]) => {
    const n = move(g, BOT, from, to) as Game
    return { n, score: n.turn === g.turn && !n.winner ? search(n, DEPTH) : -search(n, DEPTH - 1) }
  })
  const top = Math.max(...scored.map((s) => s.score))
  const best = scored.filter((s) => s.score === top)
  return best[Math.floor(random() * best.length)]?.n ?? g
}

export const parseMessage = (raw: unknown): ClientMessage | null => {
  if (typeof raw !== "string" || raw.length > 64) return null
  try {
    const m = JSON.parse(raw) as { t?: unknown; from?: unknown; to?: unknown }
    if (m?.t === "move" && Number.isInteger(m.from) && Number.isInteger(m.to)) return { t: "move", from: m.from as number, to: m.to as number }
    if (m?.t === "rematch" || m?.t === "resign" || m?.t === "bot") return { t: m.t }
  } catch {}
  return null
}
