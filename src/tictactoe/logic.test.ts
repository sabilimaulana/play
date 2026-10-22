import { expect, test } from "bun:test"
import { addBot, BOT, botMove, join, move, newGame, parseMessage, rematch, timeoutMove, turnKey, type Game } from "./logic.ts"

const play = (game: Game, moves: Array<[string, number]>): Game =>
  moves.reduce<Game>((g, [pid, i]) => {
    const next = move(g, pid, i)
    if (typeof next === "string") throw new Error(next)
    return next
  }, game)

test("seats, turns, win, rematch", () => {
  let g = join(join(join(newGame(), "a"), "b"), "c")
  expect(g.seats).toEqual({ X: "a", O: "b" })
  expect(move(g, "c", 0)).toBe("not a player")
  expect(move(g, "b", 0)).toBe("not your turn")

  g = play(g, [["a", 0], ["b", 3], ["a", 1], ["b", 4], ["a", 2]])
  expect(g.winner).toBe("X")
  expect(g.line).toEqual([0, 1, 2])
  expect(g.score.X).toBe(1)
  expect(move(g, "b", 5)).toBe("game over")

  const r = rematch(g, "b")
  if (typeof r === "string") throw new Error(r)
  expect(r.turn).toBe("O")
  expect(r.board.every((c) => c === null)).toBe(true)
})

test("draw and bad input", () => {
  const g = play(join(join(newGame(), "a"), "b"), [
    ["a", 0], ["b", 1], ["a", 2], ["b", 4], ["a", 3], ["b", 5], ["a", 7], ["b", 6], ["a", 8]
  ])
  expect(g.winner).toBe("draw")
  expect(move(join(join(newGame(), "a"), "b"), "a", 9)).toBe("bad cell")
  expect(move(join(newGame(), "a"), "a", 0)).toBe("waiting for opponent")
  expect(parseMessage('{"t":"move","i":4}')).toEqual({ t: "move", i: 4 })
  expect(parseMessage("nope")).toBeNull()
})

test("timeout plays a random empty square for the player on the clock", () => {
  const g = join(join(newGame(), "a"), "b")
  expect(turnKey(g, false)).toBeNull()
  const k = turnKey(g, true)
  const next = timeoutMove(g, () => 0)
  expect(next.board[0]).toBe("X")
  expect(turnKey(next, true)).not.toBe(k)
})

test("bot takes the empty seat, blocks a win, never loses with no blunders", () => {
  const g = addBot(join(newGame(), "p1"), "p1") as Game
  expect(g.seats.O).toBe(BOT)
  expect(addBot(g, "p1")).toBe("seat taken")
  // X threatens 0-1-2; the bot must block at 2.
  const threat = play(g, [["p1", 0], [BOT, 4], ["p1", 1]])
  expect(botMove(threat, () => 0.5).board[2]).toBe("O")
  // Random human vs perfect bot (random() >= blunder rate): the human never wins.
  for (let k = 0; k < 50; k++) {
    let r = g
    while (!r.winner) r = r.turn === "X" ? timeoutMove(r, Math.random) : botMove(r, () => 0.99)
    expect(r.winner).not.toBe("X")
  }
})
