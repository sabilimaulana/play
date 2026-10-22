import { expect, test } from "bun:test"
import { conflicts, generate, join, newGame, parseMessage, set, start, view, type Game } from "./logic.ts"

const ok = (g: Game | string): Game => {
  if (typeof g === "string") throw new Error(g)
  return g
}

test("generator: valid solution, givens match it, harder = fewer clues", () => {
  const counts = (["easy", "medium", "hard"] as const).map((level) => {
    const { puzzle, solution } = generate(level, Math.random)
    expect(conflicts(solution).size).toBe(0)
    expect(solution.every((d) => d >= 1 && d <= 9)).toBe(true)
    expect(puzzle.every((d, i) => !d || d === solution[i])).toBe(true)
    return puzzle.filter(Boolean).length
  })
  expect(counts[0]).toBeGreaterThan(counts[2]!)
})

test("race: first to finish wins, late joiner watches, lone racer can restart", () => {
  const online = new Set(["a", "b"])
  let g = join(join(join(newGame(), "a"), "b"), "c")
  expect(g.seats).toEqual(["a", "b"])
  g = ok(start(g, "a", "easy", online, 1000, Math.random))
  expect(start(g, "b", "hard", online, 1000, Math.random)).toBe("race in progress")
  expect(set(g, "a", g.puzzle!.findIndex((d) => d), 1, 0)).toBe("bad cell")
  // b fills one cell; a solves everything.
  const blank = g.puzzle!.findIndex((d) => !d)
  g = ok(set(g, "b", blank, g.solution![blank]!, 1500))
  for (let i = 0; i < 81; i++) if (!g.puzzle![i]) g = ok(set(g, "a", i, g.solution![i]!, 5000))
  expect(g.winner).toBe("a")
  expect(g.finished.a).toBe(4000)
  const v = view(g, "b", online, 9000, (p) => p)
  expect(v.stage).toBe("done")
  expect(v.winner).toBe(0)
  expect(v.players[1]!.filled).toBe(1)
  expect(v.elapsedMs).toBe(4000)
  expect(set(g, "b", blank, 1, 6000)).toBe("not racing")
  // Solo round can be restarted mid-way.
  const solo = ok(start(g, "a", "hard", new Set(["a"]), 0, Math.random))
  expect(solo.racers).toEqual(["a"])
  expect(typeof start(solo, "a", "easy", new Set(["a"]), 0, Math.random)).not.toBe("string")
  expect(parseMessage('{"t":"start","level":"hard"}')).toEqual({ t: "start", level: "hard" })
  expect(parseMessage('{"t":"start","level":"insane"}')).toBeNull()
})
