import { expect, test } from "bun:test"
import { addBot, BOT, botMove, join, legalMoves, move, newGame, parseMessage, resign, timeoutMove, turnKey, type Game, type Piece } from "./logic.ts"

const sq = (r: number, c: number) => r * 8 + c
const ok = (g: Game | string): Game => {
  if (typeof g === "string") throw new Error(g)
  return g
}
const seated = () => join(join(newGame(), "red"), "white")
const custom = (pieces: Record<number, Piece>, turn: Game["turn"] = "red"): Game => ({
  ...seated(),
  board: Array.from({ length: 64 }, (_, i) => pieces[i] ?? null),
  turn
})

test("opening: 12 pieces each, red has 7 moves, wrong turn refused", () => {
  const g = seated()
  expect(g.board.filter((p) => p === "r").length).toBe(12)
  expect(g.board.filter((p) => p === "w").length).toBe(12)
  expect(legalMoves(g).length).toBe(7)
  expect(move(g, "white", sq(2, 1), sq(3, 0))).toBe("not your turn")
  expect(move(g, "red", sq(5, 0), sq(3, 0))).toBe("illegal move")
})

test("captures are mandatory and multi-jumps keep the turn", () => {
  // red man at (5,0); white men at (4,1) and (2,3): double jump available.
  let g = custom({ [sq(5, 0)]: "r", [sq(4, 1)]: "w", [sq(2, 3)]: "w", [sq(7, 6)]: "r", [sq(0, 7)]: "w" })
  expect(legalMoves(g)).toEqual([[sq(5, 0), sq(3, 2)]])
  g = ok(move(g, "red", sq(5, 0), sq(3, 2)))
  expect(g.forced).toBe(sq(3, 2))
  expect(g.turn).toBe("red")
  g = ok(move(g, "red", sq(3, 2), sq(1, 4)))
  expect(g.forced).toBeNull()
  expect(g.turn).toBe("white")
  expect(g.board.filter((p) => p === "w").length).toBe(1)
})

test("crowning ends the turn, kings move backwards, no moves left = loss", () => {
  let g = custom({ [sq(1, 2)]: "r", [sq(0, 7)]: "w", [sq(7, 0)]: "r" })
  g = ok(move(g, "red", sq(1, 2), sq(0, 1)))
  expect(g.board[sq(0, 1)]).toBe("R")
  expect(g.turn).toBe("white")
  // A king can step back down.
  const k = custom({ [sq(3, 4)]: "R", [sq(0, 1)]: "w" })
  expect(legalMoves(k).some(([, t]) => t === sq(4, 3))).toBe(true)
  // White's only piece gets captured -> red wins.
  const end = ok(move(custom({ [sq(5, 2)]: "r", [sq(4, 3)]: "w" }), "red", sq(5, 2), sq(3, 4)))
  expect(end.winner).toBe("red")
  expect(end.score.red).toBe(1)
})

test("resign, timeout, parse", () => {
  const g = seated()
  expect(ok(resign(g, "red")).winner).toBe("white")
  expect(turnKey(g, false)).toBeNull()
  const t = timeoutMove(g, () => 0)
  expect(t.turn).toBe("white")
  expect(turnKey(t, true)).not.toBe(turnKey(g, true))
  expect(parseMessage('{"t":"move","from":40,"to":33}')).toEqual({ t: "move", from: 40, to: 33 })
  expect(parseMessage('{"t":"move","from":"x","to":1}')).toBeNull()
})

test("fuzz: random games always end or keep legal moves", () => {
  let seed = 3
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let game = 0; game < 200; game++) {
    let g = seated()
    for (let ply = 0; ply < 400 && !g.winner; ply++) {
      const moves = legalMoves(g)
      expect(moves.length).toBeGreaterThan(0)
      const [f, t] = moves[Math.floor(rand() * moves.length)]!
      g = ok(move(g, g.seats[g.turn]!, f, t))
      expect(g.board.filter(Boolean).length).toBeLessThanOrEqual(24)
    }
  }
})

test("bot takes the free capture-safe win and plays legal moves", () => {
  const g = ok(addBot(join(newGame(), "red"), "red"))
  expect(g.seats.white).toBe(BOT)
  // White bot can jump red's last piece to win.
  const win = { ...custom({ [sq(4, 3)]: "w", [sq(5, 4)]: "r", [sq(0, 1)]: "w" }, "white"), seats: g.seats }
  expect(botMove(win, () => 0).winner).toBe("white")
  // A few bot replies from the opening are all legal and pass the turn back.
  let r = ok(move(g, "red", sq(5, 0), sq(4, 1)))
  r = botMove(r, Math.random)
  expect(r.turn).toBe("red")
})
