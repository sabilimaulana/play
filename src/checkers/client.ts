import { Application, Container, Sprite, type Texture } from "pixi.js"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { InputCapture, Pointer } from "@typeonce/bevy-ts-browser"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-render"
import { PixiNodeRegistry } from "@typeonce/bevy-ts-pixi"
import { connectRoom } from "../net.ts"
import { makeMotion, texture, type Motion } from "../pixel.ts"
import { play } from "../sfx.ts"
import { avatarImg, el, rulesPanel, type RoomUI } from "../ui.ts"
import { checkersArt } from "./art.ts"
import { other, sideOf, type ClientMessage, type Piece, type Side, type View } from "./logic.ts"

const SCALE = 4
const CELL = 16 * SCALE
const SIZE = CELL * 8

type Art = Record<"r" | "R" | "w" | "W" | "light" | "dark" | "lastMove" | "select" | "dot" | "movable", Texture>

// You always play from the bottom: white sees the board turned round.
let flipped = false
const display = (i: number) => (flipped ? 63 - i : i)
const center = (i: number) => {
  const d = display(i)
  return { x: (d & 7) * CELL + CELL / 2, y: (d >> 3) * CELL + CELL / 2 }
}

// --- ECS world -------------------------------------------------------------

const Kind = Descriptor.Component<{ readonly piece: Exclude<Piece, null> }>()("Checkers/Kind")
const Square = Descriptor.Component<{ readonly index: number }>()("Checkers/Square")

const PointerInput = Descriptor.TransientResource<Pointer.Snapshot>()("Checkers/PointerInput")
const ServerView = Descriptor.TransientResource<View | null>()("Checkers/ServerView")

const PointerSource = Descriptor.Service<Pointer.Pointer>()("Checkers/PointerSource")
const ViewSource = Descriptor.Service<{ snapshot(): View | null }>()("Checkers/ViewSource")
const Host = Descriptor.Service<{
  press(index: number): void
  selected(): number | null
  cellAt(p: Pointer.Position): number | null
  readonly hints: Container
  readonly canvas: HTMLCanvasElement
}>()("Checkers/Host")
const ArtService = Descriptor.Service<Art>()("Checkers/Art")
const MotionService = Descriptor.Service<Motion>()("Checkers/Motion")
const Pieces = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Checkers/Pieces")

const Game = Schema.bind(Schema.fragment({
  components: { Kind, Square },
  resources: { PointerInput, ServerView }
}))

const CapturePointer = InputCapture.system(Game, { name: "Checkers/CapturePointer", source: PointerSource, resource: PointerInput })
const CaptureView = InputCapture.system(Game, { name: "Checkers/CaptureView", source: ViewSource, resource: ServerView })

const Click = Game.System("Checkers/Click", {
  resources: { pointer: Game.System.readResource(PointerInput) },
  services: { host: Game.System.service(Host) }
}, ({ resources, services }) => {
  const pointer = resources.pointer.get()
  if (!pointer.primary.pressed) return
  const index = services.host.cellAt(pointer.position)
  if (index !== null) services.host.press(index)
})

// Server board -> one entity per piece. The last move slides its piece; captures despawn; crowns re-skin.
const SyncPieces = Game.System("Checkers/SyncPieces", {
  queries: { pieces: Game.Query({ selection: { kind: Game.Query.write(Kind), square: Game.Query.write(Square) } }) },
  resources: { view: Game.System.readResource(ServerView) }
}, ({ queries, resources, commands }) => {
  const view = resources.view.get()
  if (!view) return
  const items = queries.pieces.each()
  const byIndex = new Map<number, (typeof items)[number]>()
  for (const item of items) byIndex.set(item.data.square.get().index, item)
  const last = view.last
  if (last && view.board[last.from] === null && view.board[last.to] !== null && !byIndex.has(last.to)) {
    const moving = byIndex.get(last.from)
    if (moving) {
      moving.data.square.set({ index: last.to })
      byIndex.delete(last.from)
      byIndex.set(last.to, moving)
    }
  }
  for (const [index, { entity, data }] of byIndex) {
    const piece = view.board[index]
    if (!piece) commands.despawn(entity.id)
    else if (data.kind.get().piece !== piece) data.kind.set({ piece })
  }
  view.board.forEach((piece, index) => {
    if (piece && !byIndex.has(index)) commands.spawn(Game.Command.spawn([Kind, { piece }], [Square, { index }]))
  })
})

// Hints: last move, movable pieces, the selected piece and where it can go. Pointer cursor on anything actionable.
const Hints = Game.System("Checkers/Hints", {
  resources: { view: Game.System.readResource(ServerView), pointer: Game.System.readResource(PointerInput) },
  services: { host: Game.System.service(Host), art: Game.System.service(ArtService) },
  local: () => ({ key: "" })
}, ({ resources, services, local }) => {
  const view = resources.view.get()
  const { hints, canvas } = services.host
  const selected = services.host.selected()
  const pointer = resources.pointer.get()
  const over = pointer.over ? services.host.cellAt(pointer.position) : null
  const movers = new Set(view?.moves.map(([f]) => f))
  const actionable = over !== null && (movers.has(over) || (selected !== null && !!view?.moves.some(([f, t]) => f === selected && t === over)))
  canvas.style.cursor = actionable ? "pointer" : "default"
  // Rebuild the hint sprites only when what they show changes.
  const key = JSON.stringify([view?.last, view?.moves, selected, flipped])
  if (key === local.key) return
  local.key = key
  const sprites: Sprite[] = []
  const put = (tex: Texture, index: number) => {
    const s = new Sprite(tex)
    s.anchor.set(0.5)
    s.scale.set(SCALE)
    const c = center(index)
    s.position.set(c.x, c.y)
    sprites.push(s)
  }
  if (view?.last) for (const i of [view.last.from, view.last.to]) put(services.art.lastMove, i)
  if (selected === null) for (const f of movers) put(services.art.movable, f)
  else {
    put(services.art.select, selected)
    for (const [f, t] of view?.moves ?? []) if (f === selected) put(services.art.dot, t)
  }
  for (const old of hints.removeChildren()) old.destroy()
  if (sprites.length) hints.addChild(...sprites)
})

const Render = RenderSync.system(Game, {
  name: "Checkers/Render",
  renderable: Kind,
  transform: Square,
  redrawOn: [Kind],
  registry: Pieces,
  services: { art: ArtService, motion: MotionService },
  create: () => {
    const sprite = new Sprite()
    sprite.anchor.set(0.5)
    sprite.scale.set(SCALE)
    return sprite
  },
  apply: (sprite, { renderable, transform, services }) => {
    sprite.texture = services.art[renderable.piece]
    const c = center(transform.index)
    services.motion.glide(sprite, c.x, c.y)
  }
})

const update = Game.Schedule(CapturePointer, CaptureView, Click, SyncPieces, Game.Schedule.applyDeferred(), Render, Hints)

// --- Host ------------------------------------------------------------------

const NAME: Record<Side, string> = { red: "Red", white: "White" }

const refusal = (v: View | null) =>
  !v ? "Still connecting…"
  : v.winner ? "Game over. Press play again."
  : !v.you ? "You're watching this game."
  : !v.online[other(v.you)] ? "Waiting for your friend. Or play the computer."
  : v.turn !== v.you ? "Not your turn yet."
  : v.forced !== null ? "Keep jumping with the same piece."
  : v.moves.some(([f, t]) => Math.abs((t >> 3) - (f >> 3)) === 2) ? "You must capture."
  : "That piece can't move."

export const mountCheckers = async (ui: RoomUI, room: string): Promise<void> => {
  const painted = checkersArt()
  const art = Object.fromEntries(Object.entries(painted).map(([k, c]) => [k, texture(c)])) as Art

  // Side panel: players, score, resign / play again.
  const players = el("ul", "players")
  const score = el("dl", "score score--two")
  const resign = el("button", "btn btn--quiet", "Resign")
  resign.type = "button"
  const rematch = el("button", "btn", "Play again")
  rematch.type = "button"
  const vsBot = el("button", "btn btn--quiet", "Play the computer")
  vsBot.type = "button"
  vsBot.onclick = () => send({ t: "bot" })
  // Shown by the first view: `send` doesn't exist until the canvas is up, so an early click would throw.
  resign.hidden = rematch.hidden = vsBot.hidden = true
  const panel = el("section", "panel")
  panel.append(el("h2", "panel-title", "At the table"), players, score, rematch, resign, vsBot)
  ui.side.append(panel, rulesPanel("American checkers: captures are mandatory, keep jumping while you can, reach the far row to crown a king."))

  const app = new Application()
  await app.init({ width: SIZE, height: SIZE, backgroundAlpha: 0, antialias: false, roundPixels: true })
  app.canvas.classList.add("board")
  app.canvas.setAttribute("role", "img")
  app.canvas.setAttribute("aria-label", "Checkers board")
  const squares = new Container()
  const hints = new Container()
  const pieces = new Container<Sprite>()
  app.stage.addChild(squares, hints, pieces)
  const drawSquares = () => {
    for (const old of squares.removeChildren()) old.destroy()
    for (let i = 0; i < 64; i++) {
      const s = new Sprite((i >> 3) % 2 === (i & 7) % 2 ? art.light : art.dark)
      s.scale.set(SCALE)
      const d = display(i)
      s.position.set((d & 7) * CELL, (d >> 3) * CELL)
      squares.addChild(s)
    }
  }
  drawSquares()

  // Keyboard + screen-reader layer: a real button per square (mouse goes to the canvas).
  const keys = el("div", "cell-keys cell-keys--8")
  const keyButtons = Array.from({ length: 64 }, () => {
    const b = el("button", "cell-key")
    b.type = "button"
    keys.append(b)
    return b
  })
  const frame = el("div", "board-frame board-frame--checkers")
  frame.append(app.canvas, keys)
  ui.stage.append(frame)

  let view: View | null = null
  let selected: number | null = null

  const press = (index: number) => {
    const v = view
    const moves = v?.moves ?? []
    if (selected !== null && moves.some(([f, t]) => f === selected && t === index)) {
      send({ t: "move", from: selected, to: index })
      selected = null
    } else if (moves.some(([f]) => f === index)) {
      selected = selected === index ? null : index
      play("tap")
    } else {
      selected = null
      if (v && sideOf(v.board[index] ?? null) === v.you) {
        play("error")
        ui.nudge(refusal(v))
      } else if (!moves.length && v) {
        play("error")
        ui.nudge(refusal(v))
      }
    }
  }

  // Sound cues from what changed between two server views.
  const sounds = (prev: View | null, v: View) => {
    if (!prev) return
    if (v.winner && !prev.winner) return play(!v.you || v.winner === v.you ? "win" : "lose")
    if (v.event === "timeout") play("timesup")
    else if (v.last && v.last !== prev.last && JSON.stringify(v.last) !== JSON.stringify(prev.last)) {
      const crowned = v.board[v.last.to] !== prev.board[v.last.from] && prev.board[v.last.from] !== null
      play(crowned ? "turn" : v.last.captured !== null ? "chip" : "place")
    }
    const mine = (x: View) => x.moves.length > 0
    if (mine(v) && !mine(prev)) setTimeout(() => play("turn"), 160)
  }

  const send = connectRoom<View, ClientMessage>("checkers", room, (v) => {
    sounds(view, v)
    if (v.event === "timeout") ui.nudge(`Time's up! A random move was played for ${NAME[v.forced !== null ? v.turn : other(v.turn)]}.`)
    view = v
    // Keep a multi-jump piece selected; drop selections that are no longer legal.
    if (v.forced !== null && v.moves.length) selected = v.forced
    else if (selected !== null && !v.moves.some(([f]) => f === selected)) selected = null
    if (flipped !== (v.you === "white")) {
      flipped = v.you === "white"
      drawSquares()
    }
    renderHud(v)
  }, () => ui.status("Reconnecting…", "off", "Your seat is kept for you."))

  const renderHud = (v: View) => {
    const me = v.you
    const them = me ? other(me) : null
    const both = v.online.red && v.online.white
    const count = (side: Side) => v.board.filter((p) => sideOf(p) === side).length
    if (v.winner) ui.status(!me ? `${NAME[v.winner]} wins.` : v.winner === me ? "You win!" : "You lose.", "end", me ? "Press play again for a rematch." : "")
    else if (!me) ui.status("Watching", "wait", `Both seats are taken. ${NAME[v.turn]} to move.`)
    else if (!v.online[them!]) ui.status("Waiting for your friend…", "wait", `Send them the link, or play the computer. You play ${NAME[me].toLowerCase()}.`)
    else if (v.turn === me) {
      const capture = v.moves.some(([f, t]) => Math.abs((t >> 3) - (f >> 3)) === 2)
      ui.status(v.forced !== null ? "Keep jumping!" : "Your move", "go", capture ? "A capture is available — you must take it." : `You play ${NAME[me].toLowerCase()}.`)
    } else ui.status(`${NAME[them!]} is thinking…`, "wait", `You play ${NAME[me].toLowerCase()}.`)
    ui.clock(v.turnMs ?? null, v.moves.length > 0)
    ui.invite(!both)

    players.replaceChildren(...(["red", "white"] as const).map((side) => {
      const row = el("li", `player player-${side}`)
      row.append(
        avatarImg(v.avatars[side], `${NAME[side]} avatar`),
        el("span", "player-mark", side === "red" ? "●" : "○"),
        el("span", "player-name", side === me ? `You · ${count(side)}` : `${side === v.bot ? "Computer" : me ? "Friend" : NAME[side]} · ${count(side)}`),
        el("span", `presence${v.online[side] ? " is-on" : ""}`, v.online[side] ? "online" : "away")
      )
      if (!v.winner && v.turn === side && both) row.classList.add("is-turn")
      return row
    }))
    score.replaceChildren(...(["red", "white"] as const).flatMap((s) => [el("dt", "", NAME[s]), el("dd", "", `${v.score[s]}`)]))
    rematch.hidden = !(v.winner && me)
    resign.hidden = !(me && !v.winner && both)
    vsBot.hidden = !(me && !v.avatars[them!])
    keyButtons.forEach((b, i) => {
      const p = v.board[i]
      const d = display(i)
      b.style.gridArea = `${(d >> 3) + 1} / ${(d & 7) + 1}`
      b.setAttribute("aria-label", `${"abcdefgh"[i & 7]}${8 - (i >> 3)}: ${p ? `${p === p.toUpperCase() ? "king" : "man"} ${sideOf(p)}` : "empty"}`)
    })
  }
  keyButtons.forEach((b, i) => (b.onclick = () => press(i)))
  rematch.onclick = () => send({ t: "rematch" })
  resign.onclick = () => {
    if (resign.dataset.armed) send({ t: "resign" })
    else {
      // Two-step instead of a dialog: first press arms, second press within 3s resigns.
      resign.dataset.armed = "1"
      resign.textContent = "Press again to resign"
      setTimeout(() => {
        delete resign.dataset.armed
        resign.textContent = "Resign"
      }, 3000)
    }
  }

  const canvas = app.canvas
  const pointer = Pointer.track(canvas, window, { pointerTypes: ["mouse", "pen", "touch"] })
  const motion = makeMotion()
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(PointerSource, pointer),
      Game.Runtime.service(ViewSource, { snapshot: () => view }),
      Game.Runtime.service(ArtService, art),
      Game.Runtime.service(MotionService, motion),
      Game.Runtime.service(Pieces, PixiNodeRegistry.make(pieces)),
      Game.Runtime.service(Host, {
        press,
        selected: () => selected,
        hints,
        canvas,
        cellAt: ({ x, y }) => {
          const k = SIZE / canvas.getBoundingClientRect().width
          const col = Math.floor((x * k) / CELL)
          const row = Math.floor((y * k) / CELL)
          if (col < 0 || col > 7 || row < 0 || row > 7) return null
          const d = row * 8 + col
          return flipped ? 63 - d : d
        }
      })
    ),
    resources: { PointerInput: Pointer.idle(), ServerView: null }
  })
  app.ticker.add((ticker) => {
    motion.tick(ticker.deltaMS)
    const result = runtime.tick(update)
    if (!result.ok) console.error(result.error)
  })
}
