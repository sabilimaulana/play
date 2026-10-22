// Shared page chrome: site header, footer, and the room layout both games use.
import { avatarOf, avatarUrl } from "./avatar.ts"
import { playerId } from "./net.ts"
import { isMuted, play, setMuted } from "./sfx.ts"

/** <picture>: animated GIF normally, still PNG for prefers-reduced-motion. */
export const avatarPicture = (id: string, img: HTMLImageElement): HTMLPictureElement => {
  const picture = document.createElement("picture")
  const moving = document.createElement("source")
  moving.media = "(prefers-reduced-motion: no-preference)"
  moving.srcset = avatarUrl(id, true)
  img.src = avatarUrl(id)
  picture.append(moving, img)
  return picture
}

/** A player's bot as a crisp pixel image, animated unless reduced motion is on. */
export const avatarImg = (id: string | null, label: string, size = 32): HTMLElement => {
  const img = el("img", "avatar")
  img.width = img.height = size
  img.alt = label
  img.decoding = "async"
  if (!id) {
    img.classList.add("is-empty")
    return img
  }
  return avatarPicture(id, img)
}

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export const GAMES = [
  { slug: "tictactoe", name: "Tic Tac Toe", players: "2 players" },
  { slug: "poker", name: "Poker", players: "2–9 players" },
  { slug: "checkers", name: "Checkers", players: "2 players" },
  { slug: "sudoku", name: "Sudoku", players: "1–2 players" },
  { slug: "circccle", name: "Circccle", players: "1–20 players" }
] as const

/** Header + <main> + footer. Returns <main>. */
export const shell = (root: HTMLElement, current: string | null): HTMLElement => {
  const currentGame = GAMES.find((game) => game.slug === current)
  document.title = currentGame ? `${currentGame.name} — PLAY` : "PLAY — Small games. Great company."
  root.innerHTML = `
    <a class="skip-link" href="#main">Skip to game</a>
    <header class="site-head">
      <a class="wordmark" href="/" aria-label="play.sblsblsbl.club home">play<span aria-hidden="true">✳</span></a>
      <a class="arcade-link" href="/"${current ? "" : ' aria-current="page"'}>The arcade</a>
      <details class="game-menu">
        <summary>Games<span aria-hidden="true">⌄</span></summary>
        <nav aria-label="Games">${GAMES.map((g) => `<a href="/#${g.slug}"${g.slug === current ? ' aria-current="page"' : ""}>${g.name}<span>${g.players}</span></a>`).join("")}</nav>
      </details>
      <p class="header-note">Good games. Better company.</p>
      <div class="header-tools">
        <button class="sound" type="button" aria-pressed="${!isMuted()}" aria-label="Sound">Sound</button>
        <span class="me-slot"></span>
      </div>
    </header>
    <main id="main" tabindex="-1"></main>
    <footer class="site-foot">
      <p>No accounts. No downloads. Just play.</p>
      <p>Made for a little friendly competition.</p>
      <a href="/">play.sblsblsbl.club</a>
    </footer>`
  const menu = root.querySelector<HTMLDetailsElement>(".game-menu")!
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { menu.open = false; menu.querySelector("summary")!.focus() }
  })
  root.addEventListener("click", (e) => {
    if (!(e.target instanceof Node) || !menu.contains(e.target) || (e.target instanceof Element && e.target.closest("a"))) menu.open = false
  })
  const me = el("img", "me")
  me.alt = "Your avatar"
  me.title = "This bot is you, in every game"
  me.width = me.height = 32
  root.querySelector(".me-slot")!.replaceWith(avatarPicture(avatarOf(playerId()), me))
  const sound = root.querySelector<HTMLButtonElement>(".sound")!
  sound.onclick = () => {
    setMuted(!isMuted())
    sound.setAttribute("aria-pressed", String(!isMuted()))
    play("tap")
  }
  // Every slab button clicks.
  root.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".btn:not(:disabled)")) play("tap")
  })
  return root.querySelector<HTMLElement>("#main")!
}

export type Tone = "go" | "wait" | "end" | "off"

export interface RoomUI {
  readonly stage: HTMLElement
  readonly side: HTMLElement
  status(text: string, tone: Tone, detail?: string): void
  /** Short shake + message when an action is refused. */
  nudge(text: string): void
  /** Large invite while waiting for players, a single copy button once playing. */
  invite(waiting: boolean): void
  /** Turn clock: ms left (null hides it). Ticks audibly in the last 5s when it's your clock. */
  clock(ms: number | null, mine: boolean): void
}

/** Room page: title row, status, stage (board) and side panel. */
export const roomLayout = (main: HTMLElement, title: string, room: string, variant: "panel" | "table" = "panel"): RoomUI => {
  main.className = "room-page"
  main.dataset.game = title.toLowerCase().replaceAll(" ", "")
  main.innerHTML = `
    <div class="room-head">
      <a class="back" href="/">← All games</a>
      <h1>${title}</h1>
      <span class="chip" title="Room code"><span class="room-code-label">Room </span>${room}</span>
    </div>
    <div class="room" data-variant="${variant}">
      <div class="play-surface">
      <section class="status" data-tone="wait">
        <div aria-live="polite">
          <p class="status-main">Connecting…</p>
          <p class="status-detail"></p>
        </div>
        <div class="clock" hidden>
          <div class="clock-bar"><i></i></div>
          <span class="clock-s"></span>
        </div>
      </section>
      <section class="stage" aria-label="${title} board"></section>
      </div>
      <aside class="side"></aside>
      <section class="invite" data-size="large">
        <label class="invite-label" for="invite-link">Better with a friend</label>
        <p class="invite-help">Send your room link. They open it and join you.</p>
        <div class="invite-row">
          <input id="invite-link" readonly>
          <button class="btn" type="button" data-copy>Copy link</button>
        </div>
      </section>
    </div>`
  const q = <T extends HTMLElement>(s: string) => main.querySelector<T>(s)!
  const status = q<HTMLElement>(".status")
  const inviteBox = q<HTMLElement>(".invite")
  const input = q<HTMLInputElement>("#invite-link")
  input.setAttribute("aria-label", "Room invite link")
  const copy = q<HTMLButtonElement>("[data-copy]")
  input.value = location.href
  let copyLabel = "Copy link"
  copy.onclick = async () => {
    const ok = await navigator.clipboard.writeText(location.href).then(() => true, () => false)
    if (!ok) input.select()
    copy.textContent = ok ? "Copied" : "Select + copy"
    setTimeout(() => (copy.textContent = copyLabel), 1400)
  }
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined
  const clockBox = q<HTMLElement>(".clock")
  const clockFill = q<HTMLElement>(".clock-bar i")
  const clockText = q<HTMLElement>(".clock-s")
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let last: [string, Tone, string] = ["Connecting…", "wait", ""]

  const render = (text: string, tone: Tone, detail: string) => {
    status.dataset.tone = tone
    q(".status-main").textContent = text
    q(".status-detail").textContent = detail
  }
  return {
    stage: q(".stage"),
    side: q(".side"),
    status(text, tone, detail = "") {
      last = [text, tone, detail]
      if (!nudgeTimer) render(text, tone, detail)
    },
    nudge(text) {
      clearTimeout(nudgeTimer)
      render(text, last[1], last[2])
      status.classList.remove("shake")
      void status.offsetWidth
      status.classList.add("shake")
      nudgeTimer = setTimeout(() => {
        nudgeTimer = undefined
        render(...last)
      }, 1400)
    },
    clock(ms, mine) {
      clearInterval(clockTimer)
      clockBox.hidden = ms === null
      if (ms === null) return
      const ends = performance.now() + ms
      const total = Math.max(ms, 1)
      let lastSecond = -1
      const draw = () => {
        const left = Math.max(0, ends - performance.now())
        const s = Math.ceil(left / 1000)
        clockFill.style.transform = `scaleX(${left / total})`
        clockText.textContent = `${s}s`
        clockBox.classList.toggle("is-urgent", s <= 5)
        if (mine && s <= 5 && s > 0 && s !== lastSecond) play("tick")
        lastSecond = s
        if (left === 0) clearInterval(clockTimer)
      }
      draw()
      clockTimer = setInterval(draw, 200)
    },
    invite(waiting) {
      inviteBox.dataset.size = waiting ? "large" : "small"
      copyLabel = waiting ? "Copy link" : "Copy invite link"
      if (copy.textContent !== "Copied") copy.textContent = copyLabel
    }
  }
}

/** Rules stay within reach without competing with the next move. */
export const rulesPanel = (text: string): HTMLDetailsElement => {
  const details = el("details", "game-rules")
  details.append(el("summary", "", "How to play"), el("p", "fine", text))
  return details
}
