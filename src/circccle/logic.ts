// Circccle: eat pellets, grow, eat smaller circles, avoid bigger ones. Split to lunge, eject to feed or bait.
import { cleanName } from "../avatar.ts"

// Real time, so unlike the turn-based games this world is mutated in place by `step` 20 times a second.

export const SIZE = 2400 // world is SIZE x SIZE units
export const PELLETS = 400
export const START_MASS = 20
export const TICK_MS = 50
export const RESPAWN_MS = 2000
export const MAX_HUMANS = 20
/** The shared arena everyone can join from the home page; any other room name is a private room. */
export const GLOBAL_ROOM = "global"
/** Computer players keep the arena at least this busy. */
export const MIN_PLAYERS = 8
export const EAT_RATIO = 1.2 // a cell needs 20% more mass to eat another
export const MAX_CELLS = 16
export const MIN_SPLIT = 36 // a cell needs this much mass to split or eject
export const MERGE_MS = 8000 // split cells can rejoin after this long
export const EJECT_COST = 16
export const EJECT_MASS = 12
const LAUNCH = 900 // units/s given to a split cell or ejected blob, bleeding off fast
const FRICTION = 5
const MAX_EJECTA = 200

export interface Cell {
  readonly id: number
  x: number
  y: number
  mass: number
  vx: number // launch velocity, on top of steering
  vy: number
  mergeAt: number // world time (ms) after which it may merge with its siblings
}

export interface Player {
  readonly id: number
  readonly pid: string // "bot-<id>" for computer players
  readonly avatar: string
  readonly color: number // index into the client palette
  name: string // "" until the player picks one
  cells: Cell[] // empty = dead, waiting to respawn
  aimX: number // target, as an offset from the centre of your cells (world units)
  aimY: number
  respawnIn: number
  eatenBy: number | null
  ejectAt: number
}

export interface Ejecta { readonly id: number; x: number; y: number; vx: number; vy: number; readonly color: number; readonly born: number }

export interface World {
  players: Player[]
  pellets: Array<[x: number, y: number, color: number]>
  ejecta: Ejecta[]
  changed: Set<number> // pellet indexes moved since the last snapshot
  roster: number // bumps when players join or leave
  nextId: number
  time: number
}

/** Wire format of a cell: [cellId, playerId, x, y, mass*10]. */
export type CellWire = [number, number, number, number, number]
/** id -> [avatar, isBot, color, name], sent when someone joins, leaves or renames. */
export type Roster = Record<number, [avatar: string, bot: boolean, color: number, name: string]>

export type ServerMessage =
  | { readonly t: "full" } // room at MAX_HUMANS; the client retries until a spot opens
  | { readonly t: "hello"; readonly you: number; readonly pellets: World["pellets"]; readonly roster: Roster }
  | {
      readonly t: "tick"
      readonly cells: ReadonlyArray<CellWire>
      readonly ejecta: ReadonlyArray<[id: number, x: number, y: number, color: number]>
      readonly pellets: ReadonlyArray<[index: number, x: number, y: number, color: number]>
      readonly roster?: Roster
      readonly eatenBy?: number | null // only sent to the player who just died
    }

export type ClientMessage =
  | { readonly t: "aim"; readonly x: number; readonly y: number }
  | { readonly t: "split" }
  | { readonly t: "eject" }
  | { readonly t: "name"; readonly name: string }

export const COLORS = 12
export const radius = (mass: number) => 4 * Math.sqrt(mass)
const speed = (mass: number) => 260 * mass ** -0.2 // units per second

const spot = (random: () => number, margin = 50) => margin + random() * (SIZE - 2 * margin)

export const newWorld = (random: () => number): World => ({
  players: [],
  pellets: Array.from({ length: PELLETS }, () => [spot(random, 10), spot(random, 10), Math.floor(random() * COLORS)]),
  ejecta: [],
  changed: new Set(),
  roster: 0,
  nextId: 1,
  time: 0
})

export const isBot = (p: Player) => p.pid.startsWith("bot-")
export const massOf = (p: Player) => p.cells.reduce((sum, c) => sum + c.mass, 0)

/** Mass-weighted centre of a player's cells. */
export const centre = (p: Player): { x: number; y: number } => {
  const m = massOf(p) || 1
  return { x: p.cells.reduce((s, c) => s + c.x * c.mass, 0) / m, y: p.cells.reduce((s, c) => s + c.y * c.mass, 0) / m }
}

const newCell = (w: World, x: number, y: number, mass: number): Cell => ({ id: w.nextId++, x, y, mass, vx: 0, vy: 0, mergeAt: 0 })

export const addPlayer = (w: World, pid: string | null, avatarOf: (pid: string) => string, random: () => number): Player => {
  const id = w.nextId++
  const key = pid ?? `bot-${id}`
  const p: Player = {
    id, pid: key, avatar: avatarOf(key), color: Math.floor(random() * COLORS), name: pid ? "" : (BOT_NAMES.find((n) => !w.players.some((o) => o.name === n)) ?? `Bot ${id}`),
    cells: [newCell(w, spot(random), spot(random), START_MASS)], aimX: 0, aimY: 0, respawnIn: 0, eatenBy: null, ejectAt: 0
  }
  w.players.push(p)
  w.roster++
  return p
}

const BOT_NAMES = ["Blip", "Orbit", "Pixel", "Bloop", "Nibble", "Gulp", "Dotty", "Muncher", "Ringo", "Zorb", "Puck", "Crumb"]

export const rename = (w: World, p: Player, raw: unknown) => {
  const name = cleanName(raw)
  if (name === p.name) return
  p.name = name
  w.roster++
}

export const removePlayer = (w: World, id: number) => {
  w.players = w.players.filter((p) => p.id !== id)
  w.roster++
}

/** Tops up computer players to MIN_PLAYERS, and drops spare ones as people join. */
export const balanceBots = (w: World, avatarOf: (pid: string) => string, random: () => number) => {
  const bots = w.players.filter(isBot)
  const want = Math.max(0, MIN_PLAYERS - (w.players.length - bots.length))
  for (let k = bots.length; k < want; k++) addPlayer(w, null, avatarOf, random)
  for (const b of bots.slice(want)) removePlayer(w, b.id)
}

export const aim = (p: Player, x: number, y: number) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const len = Math.hypot(x, y)
  const k = len > 1500 ? 1500 / len : 1
  p.aimX = x * k
  p.aimY = y * k
}

const direction = (p: Player, c: Cell) => {
  const { x, y } = centre(p)
  const dx = x + p.aimX - c.x
  const dy = y + p.aimY - c.y
  const d = Math.hypot(dx, dy)
  return d < 1 ? { dx: 0, dy: 0, d } : { dx: dx / d, dy: dy / d, d }
}

/** Every cell big enough splits in two; the new half lunges toward your aim. */
export const split = (w: World, p: Player) => {
  for (const c of [...p.cells]) {
    if (p.cells.length >= MAX_CELLS || c.mass < MIN_SPLIT) continue
    const { dx, dy } = direction(p, c)
    const [ux, uy] = dx || dy ? [dx, dy] : [1, 0]
    c.mass /= 2
    const piece = newCell(w, c.x + ux * radius(c.mass), c.y + uy * radius(c.mass), c.mass)
    piece.vx = ux * LAUNCH
    piece.vy = uy * LAUNCH
    c.mergeAt = piece.mergeAt = w.time + MERGE_MS
    p.cells.push(piece)
  }
}

/** Every cell big enough shoots a small blob of mass toward your aim (at most 10 a second). */
export const eject = (w: World, p: Player) => {
  if (w.time < p.ejectAt) return
  p.ejectAt = w.time + 100
  for (const c of p.cells) {
    if (c.mass < MIN_SPLIT) continue
    const { dx, dy } = direction(p, c)
    const [ux, uy] = dx || dy ? [dx, dy] : [1, 0]
    c.mass -= EJECT_COST
    const r = radius(c.mass) + radius(EJECT_MASS) + 2
    w.ejecta.push({ id: w.nextId++, x: c.x + ux * r, y: c.y + uy * r, vx: ux * LAUNCH, vy: uy * LAUNCH, color: p.color, born: w.time })
  }
  if (w.ejecta.length > MAX_EJECTA) w.ejecta.splice(0, w.ejecta.length - MAX_EJECTA)
}

// ponytail: bots and eating scan every cell, pellet and blob each tick (O(cells * (cells + pellets))); fine at
// a few dozen cells, use a spatial grid if rooms get big.
/** Computer steering: run from anything that can eat you, chase anything you can eat (splitting to lunge), else graze. */
const steer = (w: World, b: Player, random: () => number) => {
  const big = b.cells.reduce((a, c) => (c.mass > a.mass ? c : a))
  const { x, y } = centre(b)
  let fx = 0
  let fy = 0
  let prey: Cell | null = null
  let preyD = 450
  for (const o of w.players) {
    if (o === b) continue
    for (const c of o.cells) {
      const d = Math.hypot(c.x - big.x, c.y - big.y) || 1
      if (c.mass > big.mass * EAT_RATIO && d < 260 + radius(c.mass)) {
        fx -= (c.x - big.x) / d
        fy -= (c.y - big.y) / d
      } else if (big.mass > c.mass * EAT_RATIO && d < preyD) {
        prey = c
        preyD = d
      }
    }
  }
  if (fx || fy) return aim(b, fx * 400, fy * 400)
  if (prey) {
    aim(b, prey.x - x, prey.y - y)
    // Lunge when a half-size piece would still swallow it and it's in reach.
    if (big.mass / 2 > prey.mass * EAT_RATIO && preyD < 250 + radius(big.mass) && b.cells.length < 4 && random() < 0.1) split(w, b)
    return
  }
  let best = Infinity
  let tx = SIZE / 2
  let ty = SIZE / 2
  for (const [px, py] of w.pellets) {
    const d = (px - big.x) ** 2 + (py - big.y) ** 2
    if (d < best) [best, tx, ty] = [d, px, py]
  }
  // A little wobble so bots don't move like rails.
  const r = radius(big.mass)
  aim(b, tx - x + (random() - 0.5) * r * 4, ty - y + (random() - 0.5) * r * 4)
}

const covers = (a: Cell, b: { x: number; y: number }, rb: number) => Math.hypot(a.x - b.x, a.y - b.y) <= radius(a.mass) - rb * 0.4

/** Advances the world by dt ms. */
export const step = (w: World, dt: number, random: () => number) => {
  const s = dt / 1000
  const drag = Math.exp(-FRICTION * s)
  w.time += dt

  for (const p of w.players) {
    if (!p.cells.length) {
      p.respawnIn -= dt
      if (p.respawnIn <= 0) {
        p.cells = [newCell(w, spot(random), spot(random), START_MASS)]
        p.eatenBy = null
      }
      continue
    }
    if (isBot(p)) steer(w, p, random)
    for (const c of p.cells) {
      const { dx, dy, d } = direction(p, c)
      // Full speed when the target is far, easing in as you reach it.
      const v = speed(c.mass) * Math.min(1, d / 60)
      const r = radius(c.mass)
      c.x = Math.min(SIZE - r, Math.max(r, c.x + (dx * v + c.vx) * s))
      c.y = Math.min(SIZE - r, Math.max(r, c.y + (dy * v + c.vy) * s))
      c.vx *= drag
      c.vy *= drag
      // Big cells slowly shrink, so nobody sits on top forever.
      if (c.mass > 100) c.mass -= c.mass * 0.002 * s
    }
    // Siblings: merge once both timers are up, otherwise push apart.
    for (let i = 0; i < p.cells.length; i++)
      for (let j = i + 1; j < p.cells.length; j++) {
        const a = p.cells[i]!
        const b = p.cells[j]!
        if (!a.mass || !b.mass) continue
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 0.01
        const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
        if (w.time >= a.mergeAt && w.time >= b.mergeAt) {
          if (covers(big, small, radius(small.mass))) {
            big.mass += small.mass
            small.mass = 0
          }
          continue
        }
        const overlap = radius(a.mass) + radius(b.mass) - d
        if (overlap <= 0) continue
        const ux = (a.x - b.x) / d
        const uy = (a.y - b.y) / d
        a.x += (ux * overlap) / 2
        a.y += (uy * overlap) / 2
        b.x -= (ux * overlap) / 2
        b.y -= (uy * overlap) / 2
      }
    p.cells = p.cells.filter((c) => c.mass > 0)
  }

  for (const e of w.ejecta) {
    e.x = Math.min(SIZE, Math.max(0, e.x + e.vx * s))
    e.y = Math.min(SIZE, Math.max(0, e.y + e.vy * s))
    e.vx *= drag
    e.vy *= drag
  }

  const cells = w.players.flatMap((p) => p.cells.map((c) => ({ p, c })))
  const eaten = new Set<number>()
  for (const { c } of cells) {
    const r = radius(c.mass)
    w.pellets.forEach((pl, i) => {
      if ((pl[0] - c.x) ** 2 + (pl[1] - c.y) ** 2 > r * r) return
      c.mass += 1
      w.pellets[i] = [spot(random, 10), spot(random, 10), Math.floor(random() * COLORS)]
      w.changed.add(i)
    })
    // Ejected blobs can be eaten by anyone (you too) once they've left the cell that shot them.
    for (const e of w.ejecta) {
      if (eaten.has(e.id) || w.time - e.born < 150 || c.mass < EJECT_MASS * EAT_RATIO || !covers(c, e, radius(EJECT_MASS))) continue
      c.mass += EJECT_MASS
      eaten.add(e.id)
    }
  }
  if (eaten.size) w.ejecta = w.ejecta.filter((e) => !eaten.has(e.id))

  // Eating other players: the bigger cell must cover most of the smaller one.
  for (const a of cells)
    for (const b of cells) {
      if (a.p === b.p || !a.c.mass || !b.c.mass || a.c.mass < b.c.mass * EAT_RATIO || !covers(a.c, b.c, radius(b.c.mass))) continue
      a.c.mass += b.c.mass
      b.c.mass = 0
      b.p.eatenBy = a.p.id
    }
  for (const p of w.players) {
    if (!p.cells.length) continue
    p.cells = p.cells.filter((c) => c.mass > 0)
    if (!p.cells.length) p.respawnIn = RESPAWN_MS
  }
}

export const wire = (w: World): CellWire[] =>
  w.players.flatMap((p) => p.cells.map((c): CellWire => [c.id, p.id, Math.round(c.x), Math.round(c.y), Math.round(c.mass * 10)]))

export const roster = (w: World): Roster => Object.fromEntries(w.players.map((p) => [p.id, [p.avatar, isBot(p), p.color, p.name]]))

export const parseMessage = (raw: unknown): ClientMessage | null => {
  if (typeof raw !== "string" || raw.length > 64) return null
  try {
    const m = JSON.parse(raw) as { t?: unknown; x?: unknown; y?: unknown; name?: unknown }
    if (m?.t === "aim" && typeof m.x === "number" && typeof m.y === "number") return { t: "aim", x: m.x, y: m.y }
    if (m?.t === "split" || m?.t === "eject") return { t: m.t }
    if (m?.t === "name" && typeof m.name === "string") return { t: "name", name: m.name }
  } catch {}
  return null
}
