import { Application, Container, Sprite, type Texture } from "pixi.js"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { InputCapture } from "@typeonce/bevy-ts-browser"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-render"
import { PixiNodeRegistry } from "@typeonce/bevy-ts-pixi"
import { connectRoom } from "../net.ts"
import { makeMotion, texture, type Motion } from "../pixel.ts"
import { play, type Sound } from "../sfx.ts"
import { avatarImg, el, rulesButton, sheet, type RoomUI } from "../ui.ts"
import { BOARD_Y, boardX, chipStack, pokerArt, TABLE_CX as CX, TABLE_H, TABLE_W } from "./art.ts"
import { handName } from "./hand.ts"
import { BIG_BLIND, EMOTES, IDLE_KICK, MAX_SEATS, SMALL_BLIND, START_CHIPS, TURN_MS, type Action, type Card, type RoundView, type View } from "./logic.ts"

// --- Layout (canvas px, 480x360) ---------------------------------------------
// Fixed ring like every online client; you always sit in spot 0 (bottom centre).
// pod = avatar + nameplate on the rail · cards = beside the avatar, facing the table · bet = chips on the felt.

type Pt = { readonly x: number; readonly y: number }
type Spot = { readonly pod: Pt; readonly cards: Pt; readonly bet: Pt }
const SPOTS: ReadonlyArray<Spot> = [
  { pod: { x: 240, y: 318 }, cards: { x: 240, y: 240 }, bet: { x: 240, y: 198 } }, // bottom (you)
  { pod: { x: 88, y: 286 }, cards: { x: 140, y: 272 }, bet: { x: 160, y: 226 } }, // bottom-left
  { pod: { x: 26, y: 176 }, cards: { x: 78, y: 162 }, bet: { x: 92, y: 214 } }, // left
  { pod: { x: 88, y: 62 }, cards: { x: 140, y: 48 }, bet: { x: 186, y: 118 } }, // top-left
  { pod: { x: 240, y: 36 }, cards: { x: 292, y: 22 }, bet: { x: 296, y: 92 } }, // top
  { pod: { x: 392, y: 62 }, cards: { x: 340, y: 48 }, bet: { x: 294, y: 118 } }, // top-right
  { pod: { x: 454, y: 176 }, cards: { x: 402, y: 162 }, bet: { x: 388, y: 214 } }, // right
  { pod: { x: 392, y: 286 }, cards: { x: 340, y: 272 }, bet: { x: 320, y: 226 } }, // bottom-right
  // 9-handed: four across the top, cards tucked under the pods.
  { pod: { x: 98, y: 52 }, cards: { x: 98, y: 108 }, bet: { x: 140, y: 120 } }, // top-left
  { pod: { x: 194, y: 36 }, cards: { x: 194, y: 92 }, bet: { x: 196, y: 128 } }, // top-centre-left
  { pod: { x: 286, y: 36 }, cards: { x: 286, y: 92 }, bet: { x: 284, y: 128 } }, // top-centre-right
  { pod: { x: 382, y: 52 }, cards: { x: 382, y: 108 }, bet: { x: 340, y: 120 } } // top-right
]
/** Which spots a table of n players uses, clockwise from you. */
const SPOTS_FOR: Record<number, ReadonlyArray<number>> = {
  1: [0],
  2: [0, 4],
  3: [0, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 5, 7],
  6: [0, 1, 3, 4, 5, 7],
  7: [0, 1, 2, 3, 5, 6, 7],
  8: [0, 1, 2, 3, 4, 5, 6, 7],
  9: [0, 1, 2, 8, 9, 10, 11, 6, 7]
}
const POT: Pt = { x: CX, y: 108 }
// The hide toggle sits on the lower-right corner of your second card (card edge = +26 offset + 24 half-width).
const PEEK: Pt = { x: SPOTS[0]!.cards.x + 60, y: SPOTS[0]!.cards.y + 16 }

/** 16x16 pixel icon as an SVG path ("#" = filled). */
const pixelIcon = (rows: ReadonlyArray<string>) =>
  `<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="${rows
    .flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [`M${x} ${y + 3}h1v1h-1z`] : [])))
    .join("")}"/></svg>`
const EYE_OPEN = pixelIcon([
  ".....######.....",
  "...##......##...",
  "..#....##....#..",
  ".#....####....#.",
  ".#....####....#.",
  "..#....##....#..",
  "...##......##...",
  ".....######....."
])
const EYE_SHUT = pixelIcon([
  "",
  "",
  ".#............#.",
  "..##........##..",
  "....########....",
  "...#..#..#..#...",
  "..#...#..#...#..",
  ""
])

const spotOf = (i: number, v: View): Spot => {
  const n = v.seats.length
  const rel = v.you === null ? i : (i - v.you + n) % n
  // Watching (not seated): nobody is "you", so use the ring for one more player and skip the bottom.
  const order = SPOTS_FOR[v.you === null ? Math.min(n + 1, MAX_SEATS) : n] ?? SPOTS_FOR[MAX_SEATS]!
  return SPOTS[order[v.you === null ? (rel + 1) % order.length : rel]!]!
}

type Face = Card | null // null = face-down card
type Placed = { readonly x: number; readonly y: number; readonly face: Face; readonly dim: boolean; readonly mini: boolean }

/** Every card on the felt, keyed by slot ("board2", "seat3/1"). Opponents get fanned mini cards. */
const layout = (v: View): Map<string, Placed> => {
  const out = new Map<string, Placed>()
  v.board.forEach((face, i) => out.set(`board${i}`, { x: boardX(i), y: BOARD_Y, face, dim: false, mini: false }))
  v.seats.forEach((s, i) => {
    const { cards } = spotOf(i, v)
    const mine = i === v.you
    s.cards.forEach((face, k) =>
      out.set(`seat${i}/${k}`, { x: cards.x + (mine ? (k ? 26 : -26) : k ? 7 : -7), y: cards.y, face, dim: s.folded, mini: !mine })
    )
  })
  return out
}

// --- ECS world -------------------------------------------------------------

const Slot = Descriptor.Component<{ readonly key: string }>()("Poker/Slot")
const Placement = Descriptor.Component<{ readonly x: number; readonly y: number }>()("Poker/Placement")
const Showing = Descriptor.Component<{ readonly face: Face; readonly dim: boolean; readonly mini: boolean }>()("Poker/Showing")

const ServerView = Descriptor.TransientResource<View | null>()("Poker/ServerView")
const ViewSource = Descriptor.Service<{ snapshot(): View | null }>()("Poker/ViewSource")
const Art = Descriptor.Service<{ face(f: Face, mini: boolean): Texture }>()("Poker/Art")
const MotionService = Descriptor.Service<Motion>()("Poker/Motion")
const Dealer = Descriptor.Service<Deal>()("Poker/Dealer")
const Cards = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Poker/Cards")

const Game = Schema.bind(Schema.fragment({
  components: { Slot, Placement, Showing },
  resources: { ServerView }
}))

const CaptureView = InputCapture.system(Game, { name: "Poker/CaptureView", source: ViewSource, resource: ServerView })

// Server view -> one entity per visible card. Spawn new slots, update changed ones, despawn the rest.
const SyncTable = Game.System("Poker/SyncTable", {
  queries: {
    items: Game.Query({ selection: { slot: Game.Query.read(Slot), placement: Game.Query.write(Placement), showing: Game.Query.write(Showing) } })
  },
  resources: { view: Game.System.readResource(ServerView) }
}, ({ queries, resources, commands }) => {
  const view = resources.view.get()
  if (!view) return
  const want = layout(view)
  for (const { entity, data } of queries.items.each()) {
    const { key } = data.slot.get()
    const target = want.get(key)
    want.delete(key)
    if (!target) {
      commands.despawn(entity.id)
      continue
    }
    const p = data.placement.get()
    if (p.x !== target.x || p.y !== target.y) data.placement.set({ x: target.x, y: target.y })
    const shown = data.showing.get()
    if (shown.face !== target.face || shown.dim !== target.dim || shown.mini !== target.mini)
      data.showing.set({ face: target.face, dim: target.dim, mini: target.mini })
  }
  for (const [key, { face, dim, mini, x, y }] of want)
    commands.spawn(Game.Command.spawn([Slot, { key }], [Placement, { x, y }], [Showing, { face, dim, mini }]))
})

// Dealing: a new card flies in face down from the deck (one after another), then flips; a card that
// turns over in place (showdown, hide toggle) flips. Re-layout slides use the shared glide.
const DEAL_MS = 300
const FLIP_MS = 200
const STAGGER_MS = 90
type Deal = ReturnType<typeof makeDealer>
const makeDealer = (motion: Motion) => {
  const flights = new Map<Sprite, { t: number; to: Pt; face: Texture; launched: boolean }>()
  const flips = new Map<Sprite, { t: number; to: Texture; ticked: boolean }>()
  let lastAt = -Infinity
  let queued = 0
  // Cards (or flips) started in the same burst (a deal, the flop, a showdown) go one after another.
  const nextDelay = () => {
    const now = performance.now()
    queued = now - lastAt < 50 ? queued + 1 : 0
    lastAt = now
    return queued * STAGGER_MS
  }
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches
  const land = (sprite: Sprite, to: Pt, face: Texture) => {
    flights.delete(sprite)
    sprite.position.set(to.x, to.y)
    sprite.rotation = 0
    sprite.scale.set(1)
    motion.glide(sprite, to.x, to.y) // registers it, so later re-layouts slide from here
    if (face !== sprite.texture) flips.set(sprite, { t: 0, to: face, ticked: false })
  }
  return {
    deal(sprite: Sprite, to: Pt, face: Texture, back: Texture) {
      sprite.texture = back
      const delay = nextDelay()
      if (reduced()) {
        if (!delay) play("swish")
        sprite.texture = face
        return land(sprite, to, face)
      }
      sprite.position.set(CX, BOARD_Y)
      sprite.visible = false
      flights.set(sprite, { t: -delay, to, face, launched: false })
    },
    /** Retarget a card in flight, or flip / slide one that's already down. */
    update(sprite: Sprite, to: Pt, face: Texture) {
      const f = flights.get(sprite)
      if (f) return void Object.assign(f, { to, face })
      const flip = flips.get(sprite)
      if (flip) flip.to = face
      else if (face !== sprite.texture) reduced() ? (sprite.texture = face) : flips.set(sprite, { t: -nextDelay(), to: face, ticked: false })
      motion.glide(sprite, to.x, to.y)
    },
    tick(ms: number) {
      for (const [sprite, f] of flights) {
        if (sprite.destroyed) {
          flights.delete(sprite)
          continue
        }
        f.t += ms
        if (f.t < 0) continue
        if (!f.launched) play("swish")
        f.launched = true
        sprite.visible = true
        const p = Math.min(1, f.t / DEAL_MS)
        const e = 1 - (1 - p) ** 3
        sprite.position.set(Math.round(CX + (f.to.x - CX) * e), Math.round(BOARD_Y + (f.to.y - BOARD_Y) * e))
        sprite.rotation = (1 - e) * -0.6
        sprite.scale.set(0.7 + 0.3 * e)
        if (p === 1) land(sprite, f.to, f.face)
      }
      for (const [sprite, f] of flips) {
        if (sprite.destroyed) {
          flips.delete(sprite)
          continue
        }
        f.t += ms
        if (f.t < 0) continue
        const p = Math.min(1, f.t / FLIP_MS)
        if (p >= 0.5 && !f.ticked) {
          sprite.texture = f.to
          f.ticked = true
          play("flip")
        }
        sprite.scale.x = Math.max(0.05, Math.abs(1 - 2 * p))
        if (p === 1) flips.delete(sprite)
      }
    }
  }
}

const dealt = new WeakSet<Sprite>()
const Render = RenderSync.system(Game, {
  name: "Poker/Render",
  renderable: Showing,
  transform: Placement,
  redrawOn: [Showing],
  registry: Cards,
  services: { art: Art, dealer: Dealer },
  create: () => {
    const sprite = new Sprite()
    sprite.anchor.set(0.5) // cards are painted 1:1, twice the felt's pixel detail
    return sprite
  },
  apply: (sprite, { renderable, transform, services }) => {
    const face = services.art.face(renderable.face, renderable.mini)
    sprite.alpha = renderable.dim ? 0.45 : 1
    const to = { x: transform.x, y: transform.y }
    if (dealt.has(sprite)) return services.dealer.update(sprite, to, face)
    dealt.add(sprite)
    services.dealer.deal(sprite, to, face, services.art.face(null, renderable.mini))
  }
})

const update = Game.Schedule(CaptureView, SyncTable, Game.Schedule.applyDeferred(), Render)

// --- Host ------------------------------------------------------------------

const button = (text: string, onClick: () => void, variant = "") => {
  const b = el("button", `btn${variant ? ` btn--${variant}` : ""}`, text)
  b.type = "button"
  b.onclick = onClick
  return b
}

/** Position a DOM overlay element at a canvas point (percentages follow CSS scaling). */
const at = <T extends HTMLElement>(node: T, p: Pt): T => {
  node.style.left = `${(p.x / TABLE_W) * 100}%`
  node.style.top = `${(p.y / TABLE_H) * 100}%`
  return node
}

/** Casino denominations; each has its own chip colour (art.ts). */
const DENOMS = [5000, 1000, 500, 100, 50, 10]

/** The amount as a chip pile (largest at the bottom; a bet shows up to 5 chips, the pot up to 12) and the number. */
const chips = (amount: number, className: string, max = className === "pot" ? 12 : 5) => {
  const node = el("span", className)
  const coins: number[] = []
  let left = amount
  for (const d of DENOMS)
    while (left >= d && coins.length < max) {
      coins.push(d)
      left -= d
    }
  // Largest first = centre of the pile, on top. The pot spreads wider: a heap that grows as bets merge in.
  const art = chipStack(coins.length ? coins : [10], className === "pot" ? 5.5 : 3.6)
  const img = el("img", "chip-stack")
  img.src = art.url
  img.alt = ""
  // 1 art px = 1.5 table canvas px: a chip reads about a third of a card wide, like real chips.
  img.style.width = `${((art.w * 1.5) / TABLE_W) * 100}cqw`
  node.append(img, el("span", "", `${amount}`))
  return node
}

export const mountPoker = async (ui: RoomUI, room: string): Promise<void> => {
  const painted = pokerArt()
  const faces = new Map([...painted.faces].map(([k, c]) => [k, texture(c)] as const))
  const minis = new Map([...painted.mini].map(([k, c]) => [k, texture(c)] as const))
  const back = texture(painted.back)
  const art = { face: (f: Face, mini: boolean) => (mini ? minis.get(f ?? "back")! : f ? faces.get(f)! : back) }

  const app = new Application()
  await app.init({ width: TABLE_W, height: TABLE_H, backgroundAlpha: 0, antialias: false, roundPixels: true })
  app.canvas.setAttribute("role", "img")
  app.canvas.setAttribute("aria-label", "Poker table")
  const table = el("div", "table")
  const felt = el("div", "felt")
  const overlay = el("div", "felt-overlay")
  felt.append(app.canvas, overlay)
  table.append(felt)
  const voteBox = el("section", "vote")
  voteBox.hidden = true
  voteBox.setAttribute("aria-live", "polite")
  ui.stage.append(voteBox, table)
  const feltSprite = new Sprite(texture(painted.felt))
  feltSprite.scale.set(2)
  app.stage.addChild(feltSprite)
  const cards = new Container<Sprite>()
  app.stage.addChild(cards)

  const fx = el("div", "fx")
  felt.append(fx)

  // The hide toggle lives on the felt beside your cards, in its own layer so table re-renders keep its focus.
  const eye = el("button", "peek")
  eye.type = "button"
  eye.onclick = () => {
    hidden = !hidden
    try {
      localStorage.setItem("poker-hide", hidden ? "1" : "0")
    } catch {}
    if (view) {
      shown = mask(view)
      renderMine(view)
    }
  }
  eye.setAttribute("aria-label", "Hide my cards")
  eye.title = "Hide my cards"
  const hud = el("div", "felt-hud")
  hud.append(at(eye, PEEK))
  felt.append(hud)

  // Your hand so far and the taunt bar: updated every view, never rebuilt mid-click.
  const mine = el("div", "my-hand")
  const strength = el("span", "my-hand-name")
  const hold = el("p", "my-hand-hold")
  hold.append(el("span", "fine", "Your hand"), strength)
  mine.append(hold)
  const taunts = el("div", "taunts")
  taunts.setAttribute("aria-label", "Taunt")
  for (const e of EMOTES) {
    const b = button(e, () => {
      send({ t: "emote", e })
      // ponytail: client-side cooldown only; a server rate limit if anyone scripts spam.
      taunts.querySelectorAll("button").forEach((n) => (n.disabled = true))
      setTimeout(() => taunts.querySelectorAll("button").forEach((n) => (n.disabled = !connected)), 1500)
    }, "chip")
    taunts.append(b)
  }
  const controls = el("section", "actions")
  // Vote kick (CS/Valorant style): frees a seat held by someone who's gone; they can sit again.
  const kick = sheet("Vote kick", "Vote kick")
  const kickRow = el("div", "kick")
  kick.body.append(kickRow)
  kick.open.hidden = true
  let kickKey = ""
  // Past hands, newest first, each frozen the way the table looked when it ended.
  const hands = sheet("Hand history", "Hand history", () => view && renderHistory(view))
  const openHistory = hands.open
  const dialog = hands.dialog
  openHistory.hidden = true
  const historyList = el("ol", "history-list")
  hands.body.append(historyList)
  let historyKey = ""
  const tools = el("div", "side-tools")
  tools.append(rulesButton(`No-limit hold'em · blinds ${SMALL_BLIND}/${BIG_BLIND} · ${START_CHIPS} play chips each · up to ${MAX_SEATS} seats · time out ${IDLE_KICK} turns in a row or get voted off and you leave the table; sit again to get your chips back`), kick.open, openHistory)
  // One console under the status: your hand, the decision, then the taunts. Extras sit below it.
  const seat = el("section", "console")
  seat.setAttribute("aria-label", "Your seat")
  seat.append(mine, controls, taunts)
  ui.side.append(seat, tools)

  let view: View | null = null
  let connected = false
  // Hide your own cards on this screen (people sharing a room in real life).
  let hidden = false
  try {
    hidden = localStorage.getItem("poker-hide") === "1"
  } catch {}
  let shown: View | null = null // what the table draws: view with your cards face down when hidden
  const mask = (v: View): View =>
    !hidden || v.you === null ? v : { ...v, seats: v.seats.map((s, i) => (i === v.you ? { ...s, cards: s.cards.map(() => null) } : s)) }
  let lastControlsKey = ""
  const nameOf = (v: View, i: number) => v.seats[i]?.name ?? "?"

  // Emoji bubbles over pods, keyed by player (seat indexes shift when someone leaves).
  const seatKey = (s: View["seats"][number]) => `${s.avatar}|${s.name}`
  const seen = new Map<string, number>()
  const bubbles = new Map<string, { e: string; until: number }>()
  const emotes = (v: View, first: boolean) => {
    for (const s of v.seats) {
      if (!s.emote || seen.get(seatKey(s)) === s.emote.n) continue
      seen.set(seatKey(s), s.emote.n)
      if (first) continue
      bubbles.set(seatKey(s), { e: s.emote.e, until: performance.now() + 2500 })
      play("pop")
      setTimeout(() => view && renderTable(view), 2600)
    }
  }

  // Chips in motion: a bet slides from the player to the felt, bets merge into the pot when a street
  // ends, and the pot slides to the winners at the end of the hand.
  const pct = (p: Pt) => ({ left: `${(p.x / TABLE_W) * 100}%`, top: `${(p.y / TABLE_H) * 100}%` })
  const fly = (from: Pt, to: Pt, amount: number, delay = 0, sound?: Sound) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return sound && play(sound, { delay })
    const node = at(chips(amount, "bet is-flying"), from)
    fx.append(node)
    node.animate([pct(from), pct(to)], { duration: 420, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }).onfinish = () => {
      node.remove()
      if (sound) play(sound)
    }
  }
  const moveChips = (prev: View, v: View) => {
    if (v.hand !== prev.hand) return
    const streetOver = v.board.length > prev.board.length || (v.stage === "done" && prev.stage !== "done")
    prev.seats.forEach((s, i) => {
      if (streetOver && s.bet) fly(spotOf(i, prev).bet, POT, s.bet)
      else if ((v.seats[i]?.bet ?? 0) > s.bet) {
        const amount = v.seats[i]!.bet - s.bet
        fly(spotOf(i, v).pod, spotOf(i, v).bet, amount, 0, amount >= 10 * BIG_BLIND ? "clackBig" : "clack")
      }
    })
    if (streetOver && prev.seats.some((s) => s.bet)) play("rake", { delay: 320 })
    if (v.stage === "done" && prev.stage !== "done")
      v.pots.forEach((p, k) => p.winners.forEach((w, j) =>
        fly(POT, spotOf(w, v).pod, Math.floor(p.amount / p.winners.length), streetOver ? 450 : 0, k === 0 && j === 0 ? "cascade" : undefined)))
  }

  // Confetti bursts from each winner's pod when a hand ends.
  const COLORS = ["var(--color-yellow)", "var(--color-accent)", "var(--color-x)", "var(--color-o)", "var(--color-purple)"]
  const confetti = (v: View) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    for (const w of new Set(v.pots.flatMap((p) => p.winners))) {
      for (let k = 0; k < 28; k++) {
        const bit = at(el("i", "confetti"), spotOf(w, v).pod)
        bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 40}cqw`)
        bit.style.setProperty("--up", `${-8 - Math.random() * 16}cqw`)
        bit.style.setProperty("--r", `${Math.random() * 720 - 360}deg`)
        bit.style.background = COLORS[k % COLORS.length]!
        bit.style.animationDelay = `${Math.random() * 120}ms`
        bit.onanimationend = () => bit.remove()
        fx.append(bit)
      }
    }
  }

  // Premove: pick your next action while others decide; it fires when your turn comes.
  type Pre = "checkfold" | "check" | "callany"
  let pre: Pre | null = null
  let preHand = -1
  const premove = (v: View) => {
    if (v.hand !== preHand) pre = null
    preHand = v.hand
    if (!pre || !v.options) return
    const call = v.options.call
    const a: Action | null =
      pre === "checkfold" ? { t: call ? "fold" : "check" }
      : pre === "check" ? (call ? null : { t: "check" })
      : { t: call ? "call" : "check" }
    pre = null
    if (a) send(a)
  }

  let voteTimer: ReturnType<typeof setInterval> | undefined
  const renderVote = (v: View) => {
    clearInterval(voteTimer)
    const vote = v.vote
    voteBox.hidden = !vote
    if (!vote) return
    const ends = performance.now() + vote.ms
    const head = el("p", "vote-head")
    const draw = () => {
      const s = Math.max(0, Math.ceil((ends - performance.now()) / 1000))
      head.textContent = `${vote.target === v.you ? "Vote to kick you" : `Kick ${nameOf(v, vote.target)}?`} · ${s}s`
      if (s === 0) {
        clearInterval(voteTimer)
        voteBox.hidden = true
      }
    }
    draw()
    voteTimer = setInterval(draw, 250)
    const tally = el("p", "vote-tally", `Yes ${vote.yes} · No ${vote.no} · ${vote.need} yes to kick`)
    const nodes: HTMLElement[] = [head, tally]
    if (vote.canVote) {
      const row = el("div", "vote-buttons")
      const yes = button("F1 Yes", () => send({ t: "vote", yes: true }), "chip")
      const no = button("F2 No", () => send({ t: "vote", yes: false }), "chip")
      yes.setAttribute("aria-pressed", `${vote.mine === "yes"}`)
      no.setAttribute("aria-pressed", `${vote.mine === "no"}`)
      row.append(yes, no)
      nodes.push(row)
    }
    voteBox.replaceChildren(...nodes)
  }
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "F1" && e.key !== "F2") || !view?.vote?.canVote || voteBox.hidden) return
    e.preventDefault()
    send({ t: "vote", yes: e.key === "F1" })
  })

  // Rebuilt only when the choices change, so an open dropdown isn't yanked away.
  const renderKick = (v: View) => {
    const others = v.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => i !== v.you && !s.leaving)
    const key = JSON.stringify([v.you, !!v.vote, others.map(({ s, i }) => [i, s.name, s.online])])
    if (key === kickKey) return
    kickKey = key
    kick.open.hidden = v.you === null || !!v.vote || others.length === 0
    if (kick.open.hidden) return kick.dialog.close()
    const pick = el("select", "field")
    pick.setAttribute("aria-label", "Player to vote off")
    for (const { s, i } of others) {
      const o = el("option", "", `${s.name}${s.online ? "" : " (away)"}`)
      o.value = `${i}`
      pick.append(o)
    }
    kickRow.replaceChildren(el("span", "fine", "Free a seat:"), pick, button("Vote kick", () => {
      send({ t: "kick", seat: +pick.value })
      kick.dialog.close()
    }))
  }

  /** A past hand as the table drew it when the hand ended. */
  const frozen = (r: RoundView): View => {
    const you = r.players.findIndex((p) => p.you)
    return {
      rounds: [],
      you: you < 0 ? null : you,
      stage: "done",
      board: r.board,
      pot: 0,
      button: r.button,
      toAct: null,
      hand: r.hand,
      pots: r.pots,
      canDeal: false,
      vote: null,
      options: null,
      seats: r.players.map((p) => ({
        name: p.name, avatar: p.avatar, chips: p.chips, bet: 0, inHand: true, folded: p.folded, allIn: false, online: true,
        cards: p.cards, hand: p.hand, last: p.folded ? "Fold" : null, emote: null, leaving: false
      }))
    }
  }
  const potLine = (r: RoundView) =>
    r.pots.map((p) => `${p.winners.map((w) => r.players[w]?.name ?? "?").join(" & ")} won ${p.amount}${p.hand ? ` with ${p.hand.toLowerCase()}` : ""}`).join(" · ")
  // Card art as images, painted once per face.
  const urls = new Map<string, string>()
  const cardImg = (c: Placed) => {
    const key = `${c.face ?? "back"}${c.mini ? "/mini" : ""}`
    const canvas = c.mini ? painted.mini.get(c.face ?? "back")! : c.face ? painted.faces.get(c.face)! : painted.back
    if (!urls.has(key)) urls.set(key, canvas.toDataURL())
    const img = at(el("img", `still-card${c.dim ? " is-dim" : ""}`), c)
    img.src = urls.get(key)!
    img.alt = ""
    img.style.width = `${(canvas.width / TABLE_W) * 100}%`
    return img
  }
  let feltUrl = ""
  /** A still copy of the table: felt and cards as images, pods from the live table's own code. */
  const still = (v: View) => {
    const box = el("div", "table still")
    const felt = el("div", "felt")
    const bg = el("img", "still-felt")
    bg.src = feltUrl ||= painted.felt.toDataURL()
    bg.alt = ""
    const pods = el("div", "felt-overlay")
    pods.append(...tableNodes(v, false))
    felt.append(bg, ...[...layout(v).values()].map(cardImg), pods)
    box.append(felt)
    return box
  }
  const renderHistory = (v: View) => {
    openHistory.hidden = v.rounds.length === 0
    openHistory.textContent = `Hand history (${v.rounds.length})`
    const key = JSON.stringify([v.rounds.map((r) => r.hand), v.you])
    if (!dialog.open || key === historyKey) return // built on open, then only when a hand ends
    historyKey = key
    historyList.replaceChildren(...v.rounds.map((r) => {
      const me = r.players.find((p) => p.you)
      const net = me?.net ? ` · you ${me.net > 0 ? "+" : ""}${me.net}` : ""
      const item = el("li", "history-round")
      item.append(el("p", "history-head", `Hand ${r.hand}`), el("p", "fine", `${potLine(r)}${net}`), still(frozen(r)))
      return item
    }))
  }

  const renderMine = (v: View) => {
    const me = v.you === null ? null : v.seats[v.you]!
    const cards = me?.cards.filter((c): c is Card => !!c) ?? []
    mine.hidden = cards.length === 0
    taunts.hidden = !me
    eye.hidden = cards.length === 0
    eye.innerHTML = hidden ? EYE_SHUT : EYE_OPEN
    eye.setAttribute("aria-pressed", `${hidden}`)
    strength.textContent = hidden ? "Cards hidden" : me?.folded ? "Folded" : handName([...cards, ...v.board])
  }

  // Sound cues come from what changed between two server views.
  const sounds = (prev: View | null, v: View) => {
    if (!prev) return
    const myTurn = (x: View) => x.toAct !== null && x.toAct === x.you
    if (v.event === "timeout" && prev.toAct !== null) play("timesup")
    // What each player just did (cards are dealt with their own swish/flip; chips clack when they land).
    if (v.hand === prev.hand)
      v.seats.forEach((s, i) => {
        const was = prev.seats[i]
        if (!was) return
        if (s.allIn && !was.allIn) play("allin")
        else if (s.last === "Check" && was.last !== "Check") play("knock")
        else if (s.last === "Fold" && was.last !== "Fold") play("thud")
      })
    if (v.stage === "done" && prev.stage !== "done") {
      // Balatro-style: each hand name dings a step higher, then the pot cascades to the winner.
      v.seats.filter((s) => s.hand).forEach((_, k) => play("ding", { delay: 250 + k * 170, pitch: 1 + k * 0.125 }))
      if (v.you !== null) {
        const won = v.pots.some((p) => p.winners.includes(v.you!))
        const wasIn = prev.seats[v.you]?.inHand && !prev.seats[v.you]?.folded
        if (won) play("win", { delay: 1150 })
        else if (wasIn) play("lose", { delay: 1150 })
      }
    }
    if (v.vote && !prev.vote) play("alarm")
    if (myTurn(v) && !myTurn(prev)) setTimeout(() => play("turn"), 140)
  }

  const send = connectRoom<View, Action>("poker", room, (v) => {
    sounds(view, v)
    if (v.event === "timeout" && view?.toAct != null)
      ui.nudge(`Time's up! ${nameOf(view, view.toAct)} ${v.seats[view.toAct]?.folded ? "folded" : "checked"}.`)
    if (view) moveChips(view, v)
    if (view && v.stage === "done" && view.stage !== "done") confetti(v)
    emotes(v, view === null)
    if (view?.vote && !v.vote) {
      const name = nameOf(view, view.vote.target)
      const gone = !v.seats.some((s) => s.name === name && !s.leaving)
      ui.nudge(gone ? `${name} was voted off.` : `Vote to kick ${name} failed.`)
      if (gone) play("gavel")
    }
    if (view?.you != null && v.you === null) {
      const chips = view.seats[view.you]?.chips
      ui.nudge(chips ? `You left the table. Sit again to get your ${chips} chips back.` : `Out of chips! Sit again for a fresh ${START_CHIPS}.`)
    }
    view = v
    shown = mask(v)
    connected = true
    renderHud(v)
    premove(v)
  }, () => {
    connected = false
    lastControlsKey = ""
    controls.querySelectorAll("button, input").forEach((n) => ((n as HTMLButtonElement).disabled = true))
    ui.status("Reconnecting…", "off", "Your seat and chips are kept.")
  })

  // Pods on the rail, bets on the felt, pot above the board.
  const tableNodes = (v: View, live = true) => {
    const done = v.stage === "done"
    const winnings = new Map<number, number>()
    if (done) for (const p of v.pots) for (const w of p.winners) winnings.set(w, (winnings.get(w) ?? 0) + Math.floor(p.amount / p.winners.length))
    const nodes: HTMLElement[] = []
    v.seats.forEach((s, i) => {
      const spot = spotOf(i, v)
      const pod = at(el("div", "pod"), spot.pod)
      pod.classList.toggle("is-you", i === v.you)
      pod.classList.toggle("is-turn", v.toAct === i)
      pod.classList.toggle("is-out", s.folded || (!s.inHand && !done && v.stage !== "waiting"))
      pod.classList.toggle("is-away", !s.online)
      pod.classList.toggle("is-win", winnings.has(i))
      const plate = el("div", "plate")
      plate.append(el("span", "pod-name", s.name), el("span", "pod-stack", s.chips ? `${s.chips}` : "out"))
      pod.append(avatarImg(s.avatar, `${s.name}${i === v.you ? " (you)" : ""}`, 48), plate)
      const win = winnings.get(i)
      const tag = win ? `${s.hand ?? "Win"} +${win}` : (s.hand ?? (s.allIn && s.inHand && !s.folded ? "All in" : s.last))
      if (tag) pod.append(el("span", `pod-tag${win ? " is-win" : s.last === "Fold" ? " is-fold" : ""}${s.hand ? " is-hand" : ""}`, tag))
      const bubble = bubbles.get(seatKey(s))
      if (live && bubble && bubble.until > performance.now()) pod.append(el("span", "pod-emote", bubble.e))
      if (i === v.button && v.stage !== "waiting") pod.append(el("span", "dealer", "D"))
      if (v.toAct === i && v.turnMs) {
        const timer = el("span", "pod-timer")
        const fill = el("i")
        fill.style.animationDuration = `${v.turnMs}ms`
        fill.style.setProperty("--from", `${Math.min(1, v.turnMs / TURN_MS)}`)
        timer.append(fill)
        pod.append(timer)
      }
      if (s.leaving) pod.append(el("span", "pod-away", "leaving"))
      else if (!s.online) pod.append(el("span", "pod-away", "away"))
      nodes.push(pod)
      if (s.bet) nodes.push(at(chips(s.bet, "bet"), spot.bet))
    })
    if (v.pot) nodes.push(at(chips(v.pot, "pot"), POT))
    else if (v.seats.length < 2) nodes.push(at(el("p", "pot is-empty", "Waiting for players"), POT))
    return nodes
  }
  const renderTable = (v: View) => overlay.replaceChildren(...tableNodes(v))

  const renderStatus = (v: View) => {
    const betting = v.stage !== "waiting" && v.stage !== "done"
    const players = v.seats.filter((s) => s.online && s.chips > 0).length
    if (v.stage === "done" && v.pots.length) {
      const lines = v.pots.map((p) => `${p.winners.map((w) => nameOf(v, w)).join(" & ")} won ${p.amount}${p.hand ? ` with ${p.hand.toLowerCase()}` : ""}`)
      const youWon = v.you !== null && v.pots.some((p) => p.winners.includes(v.you!))
      ui.status(youWon ? "You won the pot!" : `${lines[0]}.`, "end", (youWon ? lines : lines.slice(1)).join(" · "))
    } else if (betting && v.toAct !== null) {
      if (v.toAct === v.you) ui.status("Your turn", "go", v.options?.call ? `${v.options.call} to call.` : "Nothing to call. Check or bet.")
      else ui.status(`${nameOf(v, v.toAct)} is deciding…`, "wait", `${v.stage[0]!.toUpperCase()}${v.stage.slice(1)} · hand ${v.hand}`)
    } else if (v.you === null) {
      const full = v.seats.length >= MAX_SEATS
      ui.status(full ? "Table full" : "Take a seat", "wait", full ? "You can watch this table." : `${v.seats.length} of ${MAX_SEATS} seats taken.`)
    } else if (players < 2) ui.status("Waiting for players…", "wait", "Send the link to friends, or add a bot. Two players can start.")
    else ui.status("Ready to deal", "wait", `${players} players with chips.`)
    ui.invite(players < 2)
  }

  // Action bar under the table: raise sizing on the left, Fold / Call / Raise on the right.
  const renderControls = (v: View) => {
    const me = v.you === null ? null : v.seats[v.you]!
    const betting = v.stage !== "waiting" && v.stage !== "done"
    // Rebuild only when the decision changes, so typing and slider drags aren't interrupted.
    const key = JSON.stringify([v.you, v.options, v.canDeal, v.hand, v.stage === "done", me?.chips, betting && me?.inHand && !me.folded, v.seats.length >= MAX_SEATS, connected])
    if (key === lastControlsKey) return
    lastControlsKey = key
    const nodes: HTMLElement[] = []

    if (!me) {
      if (v.seats.length < MAX_SEATS) {
        const form = el("form", "sit")
        const label = el("label", "field-label", "Your name")
        label.htmlFor = "seat-name"
        const input = el("input", "field")
        input.id = "seat-name"
        input.maxLength = 14
        input.required = true
        input.setAttribute("autocomplete", "nickname")
        try {
          input.value = localStorage.getItem("name") ?? ""
        } catch {}
        const sit = el("button", "btn", "Take a seat")
        sit.type = "submit"
        form.onsubmit = (e) => {
          e.preventDefault()
          const name = input.value.trim()
          if (!name) return input.focus()
          try {
            localStorage.setItem("name", name)
          } catch {}
          sit.disabled = true
          sit.textContent = "Sitting…"
          send({ t: "sit", name })
        }
        const row = el("div", "field-row")
        row.append(input, sit)
        form.append(label, row)
        nodes.push(form)
      }
    } else if (v.options) {
      const o = v.options
      const buttons = el("div", "act-buttons")
      buttons.append(
        button("Fold", () => send({ t: "fold" }), "quiet"),
        button(o.call ? `Call ${o.call}` : "Check", () => send({ t: o.call ? "call" : "check" }), "quiet")
      )
      if (o.maxRaiseTo > me.bet + o.call) {
        const raise = el("div", "raise")
        const range = el("input", "raise-range")
        range.type = "range"
        range.min = `${o.minRaiseTo}`
        range.max = `${o.maxRaiseTo}`
        range.step = "1"
        range.value = `${o.minRaiseTo}`
        range.setAttribute("aria-label", "Raise to")
        const go = button("", () => send({ t: "raise", to: +range.value }))
        const label = () => (go.textContent = +range.value >= o.maxRaiseTo ? `All in ${o.maxRaiseTo}` : `${o.call ? "Raise to" : "Bet"} ${range.value}`)
        range.oninput = label
        label()
        const toCall = me.bet + o.call
        const presets = el("div", "presets")
        for (const [name, to] of [
          ["Min", o.minRaiseTo],
          ["½ pot", toCall + Math.round((v.pot + o.call) / 2)],
          ["Pot", toCall + v.pot + o.call],
          ["All in", o.maxRaiseTo]
        ] as const) {
          const clamped = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, to))
          presets.append(button(name, () => {
            range.value = `${clamped}`
            label()
          }, "chip"))
        }
        raise.append(presets, range)
        nodes.push(raise)
        buttons.append(go)
      }
      nodes.push(buttons)
    } else if (betting && me.inHand && !me.folded) {
      nodes.push(el("p", "hint", "Waiting for your turn… Premove:"))
      const row = el("div", "act-buttons")
      for (const [name, p] of [["Check/Fold", "checkfold"], ["Auto check", "check"], ["Call any", "callany"]] as const) {
        const b = button(name, () => {
          pre = pre === p ? null : p
          row.querySelectorAll("button").forEach((n) => n.setAttribute("aria-pressed", `${n === b && pre === p}`))
        }, "chip")
        b.setAttribute("aria-pressed", `${pre === p}`)
        row.append(b)
      }
      nodes.push(row)
    } else {
      const row = el("div", "act-buttons")
      if (v.canDeal) row.append(button(v.hand ? "Deal next hand" : "Deal", () => send({ t: "deal" })))
      else
        nodes.push(el("p", "hint", v.stage === "done" ? "Next hand in a moment…"
          : !betting ? "Dealing starts once two players with chips are online."
          : "You're out of this hand. The next one deals you in."))
      if (!betting && v.stage !== "done" && v.seats.length < MAX_SEATS) row.append(button("Add a bot", () => send({ t: "bot" }), "quiet"))
      if (row.childElementCount) nodes.push(row)
    }
    controls.replaceChildren(...nodes)
  }

  const renderHud = (v: View) => {
    ui.clock(v.turnMs ?? null, v.toAct !== null && v.toAct === v.you)
    renderTable(v)
    renderStatus(v)
    renderControls(v)
    renderMine(v)
    renderVote(v)
    renderKick(v)
    renderHistory(v)
  }

  const motion = makeMotion()
  const dealer = makeDealer(motion)
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(ViewSource, { snapshot: () => shown }),
      Game.Runtime.service(Art, art),
      Game.Runtime.service(MotionService, motion),
      Game.Runtime.service(Dealer, dealer),
      Game.Runtime.service(Cards, PixiNodeRegistry.make(cards))
    ),
    resources: { ServerView: null }
  })
  app.ticker.add((ticker) => {
    motion.tick(ticker.deltaMS)
    dealer.tick(ticker.deltaMS)
    const result = runtime.tick(update)
    if (!result.ok) console.error(result.error)
  })
}
