// Circccle client: plain Pixi (no ECS; it's one camera and some sprites), drawn at 320x240 and scaled up
// pixelated so the circles come out as chunky pixel discs. Server snapshots arrive 20x/s; we ease toward them.
import { Application, Container, Graphics, Sprite, type Texture } from "pixi.js"
import { connectRoom } from "../net.ts"
import { paint, ARCADE as S } from "../paint.ts"
import { texture } from "../pixel.ts"
import { play } from "../sfx.ts"
import { avatarImg, el, rulesPanel, type RoomUI } from "../ui.ts"
import { EJECT_MASS, GLOBAL_ROOM, radius, SIZE, START_MASS, type CellWire, type ClientMessage, type Roster, type ServerMessage } from "./logic.ts"

const W = 320
const H = 240
const PALETTE = [S.red, S.orange, S.gold, S.lime, S.green, S.teal, S.blue, S.sky, S.cyan, S.plum, S.white, S.mist]

const disc = (size: number, fill: string, rim: string, shine: boolean) =>
  texture(paint(size, size, (x, y) => {
    const c = size / 2
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
    if (d > c) return undefined
    if (d > c * 0.88) return rim
    if (shine) {
      // Friendly faces scale with the cell, so the cover art and live arena belong together.
      const eyeY = c * 0.74
      for (const eyeX of [c * 0.72, c * 1.28]) {
        if (Math.hypot(x - eyeX - c * 0.035, y - eyeY - c * 0.03) < c * 0.065) return S.ink
        if (Math.hypot(x - eyeX, y - eyeY) < c * 0.135) return S.white
      }
      if (x > c * 0.76 && x < c * 1.24 && y > c * 1.04 && y < c * 1.3 && Math.abs(Math.hypot(x - c, y - c * 1.03) - c * 0.22) < c * 0.04) return S.ink
    }
    return fill
  }))

const ring = (size: number, color: string) =>
  texture(paint(size, size, (x, y) => {
    const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
    return d <= size / 2 && d > size / 2 - 4 ? color : undefined
  }))

interface Shown { owner: number; sprite: Sprite; ring: Sprite | null; x: number; y: number; r: number; tx: number; ty: number; tr: number }

export const mountCircccle = async (ui: RoomUI, room: string): Promise<void> => {
  const blobTex = PALETTE.map((c) => disc(64, c, S.ink, true))
  const pelletTex = PALETTE.map((c) => disc(8, c, c, false))
  const ejectTex = PALETTE.map((c) => disc(16, c, S.ink, false))
  const youTex = ring(72, S.sky)

  const app = new Application()
  await app.init({ width: W, height: H, background: S.ink, antialias: false, roundPixels: true })
  app.canvas.classList.add("board", "arena")
  app.canvas.setAttribute("role", "img")
  app.canvas.setAttribute("aria-label", "Circccle arena. Steer with the mouse, a finger, or the arrow keys. Space splits, W ejects.")
  app.canvas.tabIndex = 0
  const frame = el("div", "arena-frame")
  // Names are DOM text over the canvas: crisp at any zoom, unlike text drawn into the 320x240 canvas.
  const labels = el("div", "arena-labels")
  labels.setAttribute("aria-hidden", "true")
  frame.append(app.canvas, labels)
  const controls = el("div", "act-buttons arena-controls")
  const splitBtn = el("button", "btn btn--quiet", "Split · Space")
  const ejectBtn = el("button", "btn btn--quiet", "Eject · W")
  splitBtn.type = ejectBtn.type = "button"
  controls.append(splitBtn, ejectBtn)
  ui.stage.append(frame, controls)

  const grid = new Graphics()
  const world = new Container()
  const pelletLayer = new Container()
  const ejectLayer = new Container()
  const ringLayer = new Container()
  const cellLayer = new Container()
  world.addChild(pelletLayer, ejectLayer, ringLayer, cellLayer)
  app.stage.addChild(grid, world)

  // Side panel: leaderboard + your mass.
  const board = el("ol", "players leaderboard")
  const massText = el("p", "sd-time", `${START_MASS}`)
  const panel = el("section", "panel")
  const nameForm = el("form", "sit")
  const nameLabel = el("label", "field-label", "Your name")
  nameLabel.htmlFor = "circ-name"
  const nameInput = el("input", "field")
  nameInput.id = "circ-name"
  nameInput.maxLength = 14
  nameInput.placeholder = "Shown on your circle"
  nameInput.setAttribute("autocomplete", "nickname")
  const nameBtn = el("button", "btn btn--quiet", "Save")
  nameBtn.type = "submit"
  const nameRow = el("div", "field-row")
  nameRow.append(nameInput, nameBtn)
  nameForm.append(nameLabel, nameRow)
  // Same saved name as the poker table.
  try {
    nameInput.value = localStorage.getItem("name") ?? ""
  } catch {}
  nameForm.onsubmit = (e) => {
    e.preventDefault()
    const name = nameInput.value.trim()
    try {
      localStorage.setItem("name", name)
    } catch {}
    send({ t: "name", name })
    nameBtn.textContent = "Saved"
    setTimeout(() => (nameBtn.textContent = "Save"), 1400)
    nameInput.blur()
  }
  panel.append(nameForm, el("h2", "panel-title", "Your mass"), massText, el("h2", "panel-title", "Biggest players"), board)
  const where = room === GLOBAL_ROOM
    ? el("p", "fine", "You're in the global arena: anyone can drop in. Want your own? Open a private room from the home page.")
    : el("p", "fine", "Private room: only people with this link can join.")
  ui.side.append(panel, where, rulesPanel("Steer with the mouse, a finger, or the arrow keys. Eat dots to grow; eat circles 20% smaller than you. Split (Space) lunges half of each cell forward; pieces rejoin after 8 seconds. Eject (W) shoots out a bit of mass to feed a friend or bait a rival. Computer players join so you're never alone."))

  let me = 0
  let roster: Roster = {}
  let pellets: Sprite[] = []
  const shown = new Map<number, Shown>()
  const ejecta = new Map<number, Shown>()
  let myMass = START_MASS
  let alive = true
  let ticks = 0
  let scale = 1
  const tags = new Map<number, HTMLElement>()

  const setPellet = (i: number, x: number, y: number, c: number) => {
    const s = (pellets[i] ??= pelletLayer.addChild(new Sprite()))
    s.texture = pelletTex[c]!
    s.anchor.set(0.5)
    s.position.set(x, y)
    s.width = s.height = 10
  }

  const status = () => {
    if (alive) ui.status("Eat!", "go", "Grow by eating dots and smaller circles.")
  }

  /** Adds, updates and removes sprites so `into` matches this tick's list. */
  const sync = (into: Map<number, Shown>, items: ReadonlyArray<{ id: number; owner: number; x: number; y: number; r: number; tex: Texture; mine: boolean }>, layer: Container) => {
    const seen = new Set<number>()
    for (const { id, owner, x, y, r, tex, mine } of items) {
      seen.add(id)
      let b = into.get(id)
      if (!b) {
        const sprite = layer.addChild(new Sprite(tex))
        sprite.anchor.set(0.5)
        const ringSprite = mine ? ringLayer.addChild(new Sprite(youTex)) : null
        ringSprite?.anchor.set(0.5)
        b = { owner, sprite, ring: ringSprite, x, y, r, tx: x, ty: y, tr: r }
        into.set(id, b)
      }
      Object.assign(b, { tx: x, ty: y, tr: r })
      b.sprite.zIndex = r
    }
    for (const [id, b] of into)
      if (!seen.has(id)) {
        b.sprite.destroy()
        b.ring?.destroy()
        into.delete(id)
      }
  }

  let full = false
  const onMessage = (m: ServerMessage) => {
    full = m.t === "full"
    if (m.t === "full") return ui.status("Arena full", "wait", "All 20 spots are taken. You'll drop in as soon as one opens.")
    if (m.t === "hello") {
      me = m.you
      roster = m.roster
      if (nameInput.value.trim()) send({ t: "name", name: nameInput.value.trim() })
      pelletLayer.removeChildren()
      pellets = []
      m.pellets.forEach(([x, y, c], i) => setPellet(i, x, y, c))
      alive = true
      status()
      return
    }
    if (m.roster) roster = m.roster
    for (const [i, x, y, c] of m.pellets) setPellet(i, x, y, c)
    sync(shown, m.cells.map(([id, owner, x, y, m10]) => ({ id, owner, x, y, r: radius(m10 / 10), tex: blobTex[roster[owner]?.[2] ?? 0]!, mine: owner === me })), cellLayer)
    sync(ejecta, m.ejecta.map(([id, x, y, c]) => ({ id, owner: -1, x, y, r: radius(EJECT_MASS), tex: ejectTex[c]!, mine: false })), ejectLayer)
    cellLayer.sortChildren()

    const mine = m.cells.filter((c) => c[1] === me)
    const mass = mine.reduce((sum, c) => sum + c[4] / 10, 0)
    if (mass - myMass > 5) play("chip")
    myMass = mass
    if (!mine.length && alive) {
      alive = false
      play("lose")
      const by = m.eatenBy != null ? roster[m.eatenBy] : null
      ui.status("Eaten!", "end", `${by ? nameOf(by) : "Something"} got you. Back in 2 seconds.`)
    } else if (mine.length && !alive) {
      alive = true
      status()
    }
    // DOM side at ~4 Hz: enough for a leaderboard, quiet for screen readers.
    if (ticks++ % 5 === 0) renderBoard(m.cells)
  }

  const nameOf = ([, bot, , name]: Roster[number]) => name || (bot ? "Computer" : "Player")

  const renderBoard = (cells: ReadonlyArray<CellWire>) => {
    massText.textContent = `${Math.floor(myMass)}`
    const humans = Object.values(roster).filter(([, bot]) => !bot).length
    ui.invite(humans < 2 && room !== GLOBAL_ROOM)
    const totals = new Map<number, number>()
    for (const [, owner, , , m10] of cells) totals.set(owner, (totals.get(owner) ?? 0) + m10 / 10)
    const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 8)
    board.replaceChildren(...top.map(([id, mass]) => {
      const entry = roster[id] ?? ["", true, 0, ""]
      const row = el("li", "player")
      row.append(
        avatarImg(entry[0] || null, ""),
        el("span", "player-mark", `${Math.floor(mass)}`),
        el("span", "player-name", id === me ? (entry[3] ? `${entry[3]} (you)` : "You") : nameOf(entry)),
        el("span", "presence", "")
      )
      if (id === me) row.classList.add("is-turn")
      return row
    }))
  }

  const send = connectRoom<ServerMessage, ClientMessage>("circccle", room, onMessage, () => {
    if (!full) ui.status("Reconnecting…", "off", "You'll drop back in with a fresh circle.")
  })

  // Input: the point under the pointer (as an offset from your cells' centre, in world units), or held arrow keys.
  let aimX = 0
  let aimY = 0
  let sent = ""
  const pointer = (e: PointerEvent) => {
    const box = app.canvas.getBoundingClientRect()
    const k = W / box.width / scale // CSS px -> world units
    aimX = (e.clientX - box.left - box.width / 2) * k
    aimY = (e.clientY - box.top - box.height / 2) * k
  }
  app.canvas.addEventListener("pointermove", pointer)
  app.canvas.addEventListener("pointerdown", pointer)
  const keys = new Set<string>()
  const KEYS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
  const fromKeys = () => {
    aimX = aimY = 0
    for (const k of keys) [aimX, aimY] = [aimX + KEYS[k]![0] * 400, aimY + KEYS[k]![1] * 400]
  }
  const act = (t: "split" | "eject") => {
    if (alive) send({ t })
  }
  splitBtn.onclick = () => act("split")
  ejectBtn.onclick = () => act("eject")
  document.addEventListener("keydown", (e) => {
    if (e.target !== document.body && e.target !== app.canvas) return
    if (e.key in KEYS) {
      e.preventDefault()
      keys.add(e.key)
      fromKeys()
    } else if (e.key === " ") {
      e.preventDefault()
      if (!e.repeat) act("split")
    } else if (e.key === "w" || e.key === "W") act("eject") // held W keeps ejecting (the server caps the rate)
  })
  document.addEventListener("keyup", (e) => {
    if (keys.delete(e.key)) fromKeys()
  })
  setInterval(() => {
    const msg = { t: "aim", x: Math.round(aimX), y: Math.round(aimY) } as const
    const key = `${msg.x},${msg.y}`
    if (key !== sent) {
      sent = key
      send(msg)
    }
  }, 66)

  const ease = (b: Shown, k: number) => {
    b.x += (b.tx - b.x) * k
    b.y += (b.ty - b.y) * k
    b.r += (b.tr - b.r) * k
    b.sprite.position.set(b.x, b.y)
    b.sprite.width = b.sprite.height = b.r * 2
  }

  app.ticker.add((ticker) => {
    const k = 1 - Math.exp(-ticker.deltaMS / 60)
    for (const b of shown.values()) ease(b, k)
    for (const b of ejecta.values()) ease(b, k)
    // Camera: centre of your cells, zoomed out to fit their spread and size.
    const mine = [...shown.values()].filter((b) => b.ring)
    let cx = SIZE / 2
    let cy = SIZE / 2
    let span = 420 + 18 * 7
    if (mine.length) {
      const m = mine.reduce((s, b) => s + b.r * b.r, 0)
      cx = mine.reduce((s, b) => s + b.x * b.r * b.r, 0) / m
      cy = mine.reduce((s, b) => s + b.y * b.r * b.r, 0) / m
      const spread = Math.max(...mine.map((b) => Math.hypot(b.x - cx, b.y - cy) + b.r))
      span = Math.max(420 + Math.sqrt(m) * 7, spread * 2.6)
    }
    scale = W / span
    world.scale.set(scale)
    world.position.set(Math.round(W / 2 - cx * scale), Math.round(H / 2 - cy * scale))
    for (const b of mine) {
      b.ring!.position.set(b.x, b.y)
      b.ring!.width = b.ring!.height = b.r * 2 + 10 / scale
    }
    // One label per named player, on their biggest cell, when it's on screen and big enough to carry it.
    const biggest = new Map<number, Shown>()
    for (const b of shown.values()) if (b.r > (biggest.get(b.owner)?.r ?? 0)) biggest.set(b.owner, b)
    for (const [owner, b] of biggest) {
      const name = roster[owner]?.[3] ?? ""
      const sx = world.position.x + b.x * scale
      const sy = world.position.y + b.y * scale
      const on = name && b.r * scale >= 7 && sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20
      let tag = tags.get(owner)
      if (!on) {
        if (tag) tag.hidden = true
        continue
      }
      if (!tag) tags.set(owner, (tag = labels.appendChild(el("span", "arena-label"))))
      if (tag.textContent !== name) tag.textContent = name
      tag.hidden = false
      tag.style.left = `${(sx / W) * 100}%`
      tag.style.top = `${(sy / H) * 100}%`
    }
    for (const [owner, tag] of tags) if (!biggest.has(owner)) (tag.remove(), tags.delete(owner))
    // Grid + arena edge, drawn in screen space so lines stay one pixel wide.
    grid.clear()
    const step = 80 * scale
    const ox = world.position.x
    const oy = world.position.y
    for (let x = ((ox % step) + step) % step; x < W; x += step) grid.moveTo(Math.round(x) + 0.5, 0).lineTo(Math.round(x) + 0.5, H)
    for (let y = ((oy % step) + step) % step; y < H; y += step) grid.moveTo(0, Math.round(y) + 0.5).lineTo(W, Math.round(y) + 0.5)
    grid.stroke({ width: 1, color: S.navy })
    grid.rect(Math.round(ox), Math.round(oy), Math.round(SIZE * scale), Math.round(SIZE * scale)).stroke({ width: 2, color: S.slate })
  })
}
