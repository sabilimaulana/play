// Pure tic-tac-toe rules, shared by the Durable Object (authority) and the client (types).

export type Mark = "X" | "O"
export type Cell = Mark | null

export interface Game {
  readonly board: ReadonlyArray<Cell>
  readonly turn: Mark
  readonly starter: Mark
  readonly winner: Mark | "draw" | null
  readonly line: ReadonlyArray<number> | null
  readonly seats: { readonly X: string | null; readonly O: string | null }
  readonly score: { readonly X: number; readonly O: number; readonly draw: number }
}

/** What the server sends each client after every change. */
export interface View {
  /** Milliseconds left on the current turn clock (set by the room), null when nobody is on the clock. */
  readonly turnMs?: number | null
  /** "timeout" on the update caused by a turn running out. */
  readonly event?: "timeout"
  readonly board: ReadonlyArray<Cell>
  readonly turn: Mark
  readonly winner: Mark | "draw" | null
  readonly line: ReadonlyArray<number> | null
  readonly you: Mark | null
  readonly online: { readonly X: boolean; readonly O: boolean }
  readonly avatars: { readonly X: string | null; readonly O: string | null }
  /** The seat played by the computer, if any. */
  readonly bot: Mark | null
  readonly score: Game["score"]
}

export type ClientMessage = { readonly t: "move"; readonly i: number } | { readonly t: "rematch" } | { readonly t: "bot" }

/** Player id of the computer opponent. */
export const BOT = "bot"

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
] as const

export const newGame = (): Game => ({
  board: Array<Cell>(9).fill(null),
  turn: "X",
  starter: "X",
  winner: null,
  line: null,
  seats: { X: null, O: null },
  score: { X: 0, O: 0, draw: 0 }
})

export const seatOf = (game: Game, pid: string): Mark | null =>
  game.seats.X === pid ? "X" : game.seats.O === pid ? "O" : null

/** First visitor takes X, second takes O, everyone else watches. */
export const join = (game: Game, pid: string): Game => {
  if (seatOf(game, pid)) return game
  if (!game.seats.X) return { ...game, seats: { ...game.seats, X: pid } }
  if (!game.seats.O) return { ...game, seats: { ...game.seats, O: pid } }
  return game
}

export const move = (game: Game, pid: string, i: number): Game | string => {
  const mark = seatOf(game, pid)
  if (!mark) return "not a player"
  if (!game.seats.X || !game.seats.O) return "waiting for opponent"
  if (game.winner) return "game over"
  if (game.turn !== mark) return "not your turn"
  if (!Number.isInteger(i) || i < 0 || i > 8 || game.board[i]) return "bad cell"

  const board = game.board.map((c, j) => (j === i ? mark : c))
  const line = LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null
  const winner = line ? mark : board.every(Boolean) ? "draw" : null
  const score = winner ? { ...game.score, [winner]: game.score[winner] + 1 } : game.score
  return { ...game, board, line, winner, score, turn: mark === "X" ? "O" : "X" }
}

/** Fresh board after a finished round; the other player starts. */
export const rematch = (game: Game, pid: string): Game | string => {
  if (!seatOf(game, pid)) return "not a player"
  if (!game.winner) return "game not over"
  const starter = game.starter === "X" ? "O" : "X"
  return { ...game, board: Array<Cell>(9).fill(null), winner: null, line: null, starter, turn: starter }
}

export const TURN_MS = 20_000

/** Identifies the current decision; a new key restarts the turn clock. Runs only while both players are here. */
export const turnKey = (game: Game, bothOnline: boolean): string | null =>
  !game.winner && bothOnline ? `${game.board.join()}|${game.turn}` : null

/** Time's up: the player to move gets a random empty square. */
export const timeoutMove = (game: Game, random: () => number): Game => {
  const pid = game.seats[game.turn]
  const empty = game.board.flatMap((c, i) => (c ? [] : [i]))
  if (!pid || game.winner || !empty.length) return game
  const next = move(game, pid, empty[Math.floor(random() * empty.length)]!)
  return typeof next === "string" ? game : next
}

/** A seated player fills the empty seat with the computer. */
export const addBot = (game: Game, pid: string): Game | string => {
  const mark = seatOf(game, pid)
  if (!mark) return "not a player"
  const them = mark === "X" ? "O" : "X"
  if (game.seats[them]) return "seat taken"
  return { ...game, seats: { ...game.seats, [them]: BOT } }
}

const winsWith = (board: ReadonlyArray<Cell>, m: Mark) => LINES.some(([a, b, c]) => board[a] === m && board[b] === m && board[c] === m)

/** Perfect-play score of `m` taking empty square i: 1 win, 0 draw, -1 loss. */
const scoreAt = (board: Cell[], i: number, m: Mark): number => {
  board[i] = m
  const score = winsWith(board, m) ? 1 : board.every(Boolean) ? 0 : -negamax(board, m === "X" ? "O" : "X")
  board[i] = null
  return score
}

const negamax = (board: Cell[], m: Mark): number => {
  let best = -1
  for (let i = 0; i < 9 && best < 1; i++) if (!board[i]) best = Math.max(best, scoreAt(board, i, m))
  return best
}

// ponytail: fixed 20% blunder rate keeps the computer beatable; add difficulty levels if people ask.
const BLUNDER = 0.2

/** The computer's move: best square (random among equals), with the odd random blunder. */
export const botMove = (game: Game, random: () => number): Game => {
  if (game.winner || game.seats[game.turn] !== BOT) return game
  if (random() < BLUNDER) return timeoutMove(game, random)
  const board = [...game.board]
  const m = game.turn
  const scored = board.flatMap((c, i) => (c ? [] : [{ i, score: scoreAt(board, i, m) }]))
  const top = Math.max(...scored.map((s) => s.score))
  const best = scored.filter((s) => s.score === top)
  const next = move(game, BOT, best[Math.floor(random() * best.length)]!.i)
  return typeof next === "string" ? game : next
}

export const parseMessage = (raw: unknown): ClientMessage | null => {
  if (typeof raw !== "string" || raw.length > 64) return null
  try {
    const m: unknown = JSON.parse(raw)
    if (typeof m !== "object" || m === null) return null
    const { t, i } = m as { t?: unknown; i?: unknown }
    if (t === "move" && typeof i === "number") return { t, i }
    if (t === "rematch" || t === "bot") return { t }
  } catch {}
  return null
}
