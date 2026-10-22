import { Application, Container, Sprite, type Texture } from "pixi.js"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { InputCapture, Pointer } from "@typeonce/bevy-ts-browser"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-render"
import { PixiNodeRegistry } from "@typeonce/bevy-ts-pixi"
import { connectRoom } from "../net.ts"
import { play } from "../sfx.ts"
import { makeMotion, texture, type Motion } from "../pixel.ts"
import { avatarImg, el, rulesPanel, type RoomUI } from "../ui.ts"
import { tttArt } from "./art.ts"
import type { ClientMessage, Mark, View } from "./logic.ts"

const SCALE = 5
const CELL = 16 * SCALE
const GAP = 8
const SIZE = CELL * 3 + GAP * 4

type Art = { readonly X: Texture; readonly O: Texture; readonly tile: Texture; readonly win: Texture }

// --- ECS world -------------------------------------------------------------

const Cell = Descriptor.Component<{ readonly index: number }>()("TicTacToe/Cell")
const Placed = Descriptor.Component<{ readonly mark: Mark; readonly win: boolean }>()("TicTacToe/Placed")

const PointerInput = Descriptor.TransientResource<Pointer.Snapshot>()("TicTacToe/PointerInput")
const ServerView = Descriptor.TransientResource<View | null>()("TicTacToe/ServerView")

const PointerSource = Descriptor.Service<Pointer.Pointer>()("TicTacToe/PointerSource")
const ViewSource = Descriptor.Service<{ snapshot(): View | null }>()("TicTacToe/ViewSource")
const Net = Descriptor.Service<{
  send(msg: ClientMessage): void
  refuse(view: View | null): void
  cellAt(p: Pointer.Position): number | null
}>()("TicTacToe/Net")
const ArtService = Descriptor.Service<Art>()("TicTacToe/Art")
const MotionService = Descriptor.Service<Motion>()("TicTacToe/Motion")
const Marks = Descriptor.Service<NodeRegistry.NodeRegistry<Container>>()("TicTacToe/Marks")
const Ghost = Descriptor.Service<{ readonly sprite: Sprite; readonly canvas: HTMLCanvasElement }>()("TicTacToe/Ghost")

const Game = Schema.bind(Schema.fragment({
  components: { Cell, Placed },
  resources: { PointerInput, ServerView }
}))

const cellCenter = (index: number) => ({
  x: GAP + (index % 3) * (CELL + GAP) + CELL / 2,
  y: GAP + Math.floor(index / 3) * (CELL + GAP) + CELL / 2
})

const myTurn = (v: View | null): v is View & { you: Mark } =>
  !!v?.you && !v.winner && v.turn === v.you && v.online[v.you === "X" ? "O" : "X"]

const Setup = Game.System("TicTacToe/Setup", {}, ({ commands }) => {
  for (let index = 0; index < 9; index++) commands.spawn(Game.Command.spawn([Cell, { index }]))
})

const CapturePointer = InputCapture.system(Game, { name: "TicTacToe/CapturePointer", source: PointerSource, resource: PointerInput })
const CaptureView = InputCapture.system(Game, { name: "TicTacToe/CaptureView", source: ViewSource, resource: ServerView })

// Click -> move request. The server is the authority; we only send intent, and explain refusals.
const Click = Game.System("TicTacToe/Click", {
  resources: { pointer: Game.System.readResource(PointerInput), view: Game.System.readResource(ServerView) },
  services: { net: Game.System.service(Net) }
}, ({ resources, services }) => {
  const pointer = resources.pointer.get()
  if (!pointer.primary.pressed) return
  const view = resources.view.get()
  const index = services.net.cellAt(pointer.position)
  if (index === null) return
  if (myTurn(view) && !view.board[index]) services.net.send({ t: "move", i: index })
  else if (!view?.winner) services.net.refuse(view)
})

// Hover preview: a faint copy of your mark on the empty cell under the pointer, on your turn.
const Hover = Game.System("TicTacToe/Hover", {
  resources: { pointer: Game.System.readResource(PointerInput), view: Game.System.readResource(ServerView) },
  services: { net: Game.System.service(Net), ghost: Game.System.service(Ghost), art: Game.System.service(ArtService) }
}, ({ resources, services }) => {
  const pointer = resources.pointer.get()
  const view = resources.view.get()
  const index = pointer.over ? services.net.cellAt(pointer.position) : null
  const open = index !== null && myTurn(view) && !view.board[index]
  const { sprite, canvas } = services.ghost
  sprite.visible = open
  canvas.style.cursor = open ? "pointer" : "default"
  if (!open) return
  const c = cellCenter(index)
  sprite.texture = services.art[view.you]
  sprite.position.set(c.x, c.y)
})

// Server board -> Placed components on the 9 cell entities.
const SyncBoard = Game.System("TicTacToe/SyncBoard", {
  queries: { cells: Game.Query({ selection: { cell: Game.Query.read(Cell), placed: Game.Query.optional(Placed) } }) },
  resources: { view: Game.System.readResource(ServerView) }
}, ({ queries, resources, commands }) => {
  const view = resources.view.get()
  if (!view) return
  for (const { entity, data } of queries.cells.each()) {
    const { index } = data.cell.get()
    const mark = view.board[index]
    const current = data.placed.present ? data.placed.get() : undefined
    const win = view.line?.includes(index) ?? false
    if (!mark) {
      if (current) commands.remove(entity.id, Placed)
    } else if (current?.mark !== mark || current.win !== win) {
      commands.insert(entity.id, [Placed, { mark, win }])
    }
  }
})

const Render = RenderSync.system(Game, {
  name: "TicTacToe/Render",
  renderable: Placed,
  transform: Cell,
  redrawOn: [Placed],
  registry: Marks,
  services: { art: ArtService, motion: MotionService },
  create: ({ services }) => {
    const node = new Container()
    node.addChild(new Sprite(), new Sprite())
    node.pivot.set(8, 8)
    services.motion.pop(node, SCALE)
    return node
  },
  apply: (node, { renderable, transform, services }) => {
    const [bg, mark] = node.children as [Sprite, Sprite]
    bg.texture = renderable.win ? services.art.win : services.art.tile
    mark.texture = services.art[renderable.mark]
    const c = cellCenter(transform.index)
    node.position.set(c.x, c.y)
  }
})

const setup = Game.Schedule(Setup, Game.Schedule.applyDeferred())
const update = Game.Schedule(CapturePointer, CaptureView, Click, Hover, SyncBoard, Game.Schedule.applyDeferred(), Render)

// --- Host ------------------------------------------------------------------

const other = (m: Mark): Mark => (m === "X" ? "O" : "X")

const refusal = (v: View | null) =>
  !v ? "Still connecting…"
  : v.winner ? "Round over. Press play again."
  : !v.you ? "You're watching this game."
  : !v.online[other(v.you)] ? "Waiting for your friend. Or play the computer."
  : v.turn !== v.you ? "Not your turn yet."
  : "That square is taken."

export const mountTicTacToe = async (ui: RoomUI, room: string): Promise<void> => {
  const painted = tttArt()
  const art: Art = { X: texture(painted.X), O: texture(painted.O), tile: texture(painted.tile), win: texture(painted.win) }

  // Side panel: players, score, rematch.
  const players = el("ul", "players")
  const score = el("dl", "score")
  const rematch = el("button", "btn", "Play again")
  rematch.type = "button"
  rematch.hidden = true
  const vsBot = el("button", "btn btn--quiet", "Play the computer")
  vsBot.type = "button"
  vsBot.hidden = true
  const rules = rulesPanel("Three in a row wins. Whoever didn't start last round starts the next.")
  const panel = el("section", "panel")
  panel.append(el("h2", "panel-title", "At the table"), players, score, rematch, vsBot)
  ui.side.append(panel, rules)

  const app = new Application()
  await app.init({ width: SIZE, height: SIZE, backgroundAlpha: 0, antialias: false, roundPixels: true })
  app.canvas.classList.add("board")
  app.canvas.setAttribute("role", "img")
  // Keyboard + screen-reader layer: one real button per cell over the canvas (mouse goes to the canvas).
  const keys = el("div", "cell-keys")
  const cellButtons = Array.from({ length: 9 }, (_, i) => {
    const b = el("button", "cell-key")
    b.type = "button"
    b.onclick = () => (myTurn(view) && !view.board[i] ? send({ t: "move", i }) : ui.nudge(refusal(view)))
    keys.append(b)
    return b
  })
  const frame = el("div", "board-frame")
  frame.append(app.canvas, keys)
  ui.stage.append(frame)
  for (let i = 0; i < 9; i++) {
    const tile = new Sprite(art.tile)
    tile.anchor.set(0.5)
    tile.scale.set(SCALE)
    const c = cellCenter(i)
    tile.position.set(c.x, c.y)
    app.stage.addChild(tile)
  }
  const ghost = new Sprite()
  ghost.anchor.set(0.5)
  ghost.scale.set(SCALE)
  ghost.alpha = 0.35
  ghost.visible = false
  const marks = new Container()
  app.stage.addChild(ghost, marks)

  let view: View | null = null
  const send = connectRoom<View, ClientMessage>("tictactoe", room, (v) => {
    sounds(view, v)
    view = v
    renderHud(v)
    if (v.event === "timeout") ui.nudge(`Time's up! A square was picked for ${v.turn === "X" ? "O" : "X"}.`)
  }, () => ui.status("Reconnecting…", "off", "Your seat is kept for you."))

  // Sound cues come from what changed between two server views.
  const sounds = (prev: View | null, v: View) => {
    if (!prev) return
    const placed = v.board.filter(Boolean).length > prev.board.filter(Boolean).length
    if (v.winner && !prev.winner) play(v.winner === "draw" ? "draw" : !v.you || v.winner === v.you ? "win" : "lose")
    else if (v.event === "timeout") play("timesup")
    else if (placed) play("place")
    if (!v.winner && myTurn(v) && !myTurn(prev)) setTimeout(() => play("turn"), placed ? 160 : 0)
  }

  const renderHud = (v: View) => {
    ui.clock(v.turnMs ?? null, myTurn(v))
    const me = v.you
    const them = me ? other(me) : null
    const full = v.online.X && v.online.O
    const filled = v.board.filter(Boolean).length
    if (v.winner === "draw") ui.status("Draw.", "end", "Nobody got three. Play again?")
    else if (v.winner) ui.status(!me ? `${v.winner} wins.` : v.winner === me ? "You win!" : "You lose.", "end", me ? "Press play again for the next round." : "")
    else if (!me) ui.status("Watching", "wait", `Both seats are taken. ${v.turn} to move.`)
    else if (!v.online[them!]) ui.status("Waiting for your friend…", "wait", `Send them the link, or play the computer. You'll play as ${me}.`)
    else if (v.turn === me) ui.status("Your turn", "go", filled ? `You are ${me}.` : `You are ${me}. You start.`)
    else ui.status(`${them} is thinking…`, "wait", `You are ${me}.`)
    ui.invite(!full)

    app.canvas.setAttribute("aria-label", "Tic tac toe board")
    cellButtons.forEach((b, i) => b.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${v.board[i] ?? "empty"}`))
    players.replaceChildren(...(["X", "O"] as const).map((m) => {
      const row = el("li", `player player-${m}`)
      row.append(
        avatarImg(v.avatars[m], `Player ${m} avatar`),
        el("span", "player-mark", m),
        el("span", "player-name", m === me ? "You" : m === v.bot ? "Computer" : me ? "Friend" : `Player ${m}`),
        el("span", `presence${v.online[m] ? " is-on" : ""}`, v.online[m] ? "online" : "away")
      )
      if (!v.winner && v.turn === m && full) row.classList.add("is-turn")
      return row
    }))
    score.replaceChildren(
      ...[["X", v.score.X], ["O", v.score.O], ["Draws", v.score.draw]].flatMap(([k, n]) => [el("dt", "", `${k}`), el("dd", "", `${n}`)])
    )
    rematch.hidden = !(v.winner && me)
    vsBot.hidden = !(me && !v.avatars[them!])
  }
  rematch.onclick = () => send({ t: "rematch" })
  vsBot.onclick = () => send({ t: "bot" })

  const canvas = app.canvas
  const pointer = Pointer.track(canvas, window, { pointerTypes: ["mouse", "pen", "touch"] })
  const motion = makeMotion()
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(PointerSource, pointer),
      Game.Runtime.service(ViewSource, { snapshot: () => view }),
      Game.Runtime.service(ArtService, art),
      Game.Runtime.service(MotionService, motion),
      Game.Runtime.service(Marks, PixiNodeRegistry.make(marks)),
      Game.Runtime.service(Ghost, { sprite: ghost, canvas }),
      Game.Runtime.service(Net, {
        send,
        refuse: (v) => {
          play("error")
          ui.nudge(refusal(v))
        },
        // Canvas is CSS-scaled; map CSS px back to canvas px.
        cellAt: ({ x, y }) => {
          const k = SIZE / canvas.getBoundingClientRect().width
          const col = Math.floor((x * k - GAP / 2) / (CELL + GAP))
          const row = Math.floor((y * k - GAP / 2) / (CELL + GAP))
          return col >= 0 && col < 3 && row >= 0 && row < 3 ? row * 3 + col : null
        }
      })
    ),
    resources: { PointerInput: Pointer.idle(), ServerView: null }
  })

  runtime.tick(setup)
  app.ticker.add((ticker) => {
    motion.tick(ticker.deltaMS)
    const result = runtime.tick(update)
    if (!result.ok) console.error(result.error)
  })
}
