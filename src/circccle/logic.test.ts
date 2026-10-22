import { expect, test } from "bun:test"
import {
  addPlayer, aim, balanceBots, eject, EJECT_COST, EJECT_MASS, isBot, massOf, MERGE_MS, MIN_PLAYERS, newWorld,
  parseMessage, rename, RESPAWN_MS, roster, split, START_MASS, step, type Player, type World
} from "./logic.ts"

const avatar = (p: string) => p
const empty = (): World => ({ ...newWorld(Math.random), pellets: [] })
const put = (p: Player, x: number, y: number, mass: number) => Object.assign(p.cells[0]!, { x, y, mass })
const run = (w: World, ms: number) => {
  for (let t = 0; t < ms; t += 50) step(w, 50, Math.random)
}

test("moving toward the aim and eating a pellet", () => {
  const w = empty()
  const a = addPlayer(w, "human01", avatar, Math.random)
  put(a, 500, 500, START_MASS)
  w.pellets = [[540, 500, 0]]
  aim(a, 300, 0)
  run(w, 500)
  expect(a.cells[0]!.x).toBeGreaterThan(500)
  expect(massOf(a)).toBeGreaterThan(START_MASS)
  expect(w.changed.has(0)).toBe(true)
})

test("bigger eats smaller (not the other way), then the eaten one respawns", () => {
  const w = empty()
  const big = addPlayer(w, "big00001", avatar, Math.random)
  const small = addPlayer(w, "small001", avatar, Math.random)
  const twin = addPlayer(w, "twin0001", avatar, Math.random)
  put(big, 1000, 1000, 100)
  put(small, 1005, 1000, 20)
  put(twin, 2000, 2000, 100)
  step(w, 50, Math.random)
  expect(small.cells.length).toBe(0)
  expect(small.eatenBy).toBe(big.id)
  expect(massOf(big)).toBeCloseTo(120, 0)
  put(twin, 1000, 1000, massOf(big))
  step(w, 50, Math.random)
  expect(twin.cells.length && big.cells.length).toBe(1)
  run(w, RESPAWN_MS + 50)
  expect(massOf(small)).toBe(START_MASS)
})

test("split halves and lunges, siblings stay apart, then merge back", () => {
  const w = empty()
  const p = addPlayer(w, "split001", avatar, Math.random)
  put(p, 1000, 1000, 80)
  aim(p, 500, 0)
  split(w, p)
  expect(p.cells.map((c) => c.mass)).toEqual([40, 40])
  split(w, p) // 40 >= MIN_SPLIT: both split again
  expect(p.cells.length).toBe(4)
  run(w, 300)
  expect(Math.max(...p.cells.map((c) => c.x))).toBeGreaterThan(1150) // a piece shot forward
  aim(p, 0, 0)
  run(w, MERGE_MS + 3000)
  expect(p.cells.length).toBe(1)
  expect(massOf(p)).toBeGreaterThan(75)
  // Too small to split.
  const tiny = addPlayer(w, "tiny0001", avatar, Math.random)
  split(w, tiny)
  expect(tiny.cells.length).toBe(1)
})

test("eject shoots edible mass that someone else can eat", () => {
  const w = empty()
  const p = addPlayer(w, "eject001", avatar, Math.random)
  const q = addPlayer(w, "eater001", avatar, Math.random)
  put(p, 1000, 1000, 60)
  put(q, 1200, 1000, 30)
  aim(p, 500, 0)
  eject(w, p)
  eject(w, p) // cooldown: ignored
  expect(massOf(p)).toBe(60 - EJECT_COST)
  expect(w.ejecta.length).toBe(1)
  run(w, 1000)
  expect(w.ejecta.length).toBe(0)
  expect(massOf(q)).toBeGreaterThanOrEqual(30 + EJECT_MASS)
})

test("bots fill the arena, make way for people, and run from danger", () => {
  const w = empty()
  addPlayer(w, "human01", avatar, Math.random)
  balanceBots(w, avatar, Math.random)
  expect(w.players.length).toBe(MIN_PLAYERS)
  addPlayer(w, "human02", avatar, Math.random)
  balanceBots(w, avatar, Math.random)
  expect(w.players.length).toBe(MIN_PLAYERS)
  expect(w.players.filter((p) => !isBot(p)).length).toBe(2)

  const v = empty()
  const bot = addPlayer(v, null, avatar, Math.random)
  const shark = addPlayer(v, "shark001", avatar, Math.random)
  put(bot, 1000, 1000, 20)
  put(shark, 900, 1000, 200)
  run(v, 200)
  expect(bot.cells[0]!.x).toBeGreaterThan(1000) // fled to the right
  expect(parseMessage('{"t":"aim","x":50,"y":-10}')).toEqual({ t: "aim", x: 50, y: -10 })
  expect(parseMessage('{"t":"split"}')).toEqual({ t: "split" })
  expect(parseMessage('{"t":"aim","x":"a","y":1}')).toBeNull()
})

test("names: bots get one, players set theirs (sanitized), roster carries it", () => {
  const w = empty()
  const bot = addPlayer(w, null, avatar, Math.random)
  const p = addPlayer(w, "named001", avatar, Math.random)
  expect(bot.name).not.toBe("")
  const bots = Array.from({ length: 13 }, () => addPlayer(w, null, avatar, Math.random).name)
  expect(new Set([bot.name, ...bots]).size).toBe(14) // 12 names, then "Bot <id>"
  expect(p.name).toBe("")
  const before = w.roster
  rename(w, p, "  Ana\u0000   the   Great and Powerful ")
  expect(p.name).toBe("Ana the Great")
  expect(w.roster).toBe(before + 1)
  expect(roster(w)[p.id]![3]).toBe("Ana the Great")
  expect(parseMessage('{"t":"name","name":"Ana"}')).toEqual({ t: "name", name: "Ana" })
})
