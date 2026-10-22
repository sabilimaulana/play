// Sudoku race: a DOM grid (cells are real buttons, so keyboard + screen readers come free).
// Your own grid is local truth during a round; the server checks it and decides who finished first.
import { connectRoom } from "../net.ts"
import { play } from "../sfx.ts"
import { avatarImg, el, rulesPanel, type RoomUI } from "../ui.ts"
import { conflicts, LEVELS, type ClientMessage, type Level, type View } from "./logic.ts"

const LEVEL_NAME: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" }
const box = (i: number) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)
const peers = (a: number, b: number) => Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 || box(a) === box(b)
const time = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

export const mountSudoku = (ui: RoomUI, room: string): void => {
  // Board + keypad.
  const board = el("div", "sudoku")
  board.setAttribute("role", "group")
  board.setAttribute("aria-label", "Sudoku grid")
  const cells = Array.from({ length: 81 }, (_, i) => {
    const b = el("button", "sd-cell")
    b.type = "button"
    b.tabIndex = -1
    b.onclick = () => select(i)
    board.append(b)
    return b
  })
  const keypad = el("div", "keypad")
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    const k = el("button", "btn btn--chip", d ? `${d}` : "Erase")
    k.type = "button"
    k.onclick = () => enter(d)
    keypad.append(k)
  }
  const notesBtn = el("button", "btn btn--chip keypad-notes", "Notes off")
  notesBtn.type = "button"
  notesBtn.title = "Pencil notes (N)"
  notesBtn.onclick = () => toggleNotes()
  keypad.append(notesBtn)
  ui.stage.append(board, keypad)

  // Side panel: players, clock, level + start.
  const players = el("ul", "players")
  const clock = el("p", "sd-time", "00:00")
  const levels = el("div", "levels")
  let level: Level = "easy"
  const levelButtons = LEVELS.map((l) => {
    const b = el("button", "btn btn--chip", LEVEL_NAME[l])
    b.type = "button"
    b.onclick = () => {
      level = l
      renderLevels()
    }
    levels.append(b)
    return b
  })
  const renderLevels = () => levelButtons.forEach((b, k) => b.setAttribute("aria-pressed", String(LEVELS[k] === level)))
  const startBtn = el("button", "btn", "Start")
  startBtn.type = "button"
  startBtn.onclick = () => send({ t: "start", level })
  const setup = el("div", "sd-setup")
  setup.append(el("p", "field-label", "Level"), levels, startBtn)
  const panel = el("section", "panel")
  panel.append(el("h2", "panel-title", "At the table"), players, clock, setup)
  ui.side.append(panel, rulesPanel("Fill every row, column and box with 1–9. Race a friend on the same puzzle: first to finish wins. Alone, it's you against the clock."))
  renderLevels()

  let view: View | null = null
  let mine: number[] | null = null // your grid this round
  let round = "" // puzzle identity, to tell a new round from an update
  let selected = 40
  let clockFrom: { ms: number; at: number; running: boolean } | null = null
  // Pencil notes: one bitmask of candidate digits per cell. Only yours, so they live in this browser, per round.
  let noting = false
  let notes = Array<number>(81).fill(0)
  const notesKey = `sudoku-notes:${room}`
  const loadNotes = (id: string) => {
    try {
      const saved = JSON.parse(localStorage.getItem(notesKey) ?? "null") as { round: string; notes: number[] } | null
      notes = saved?.round === id ? saved.notes : Array<number>(81).fill(0)
    } catch {
      notes = Array<number>(81).fill(0)
    }
  }
  const saveNotes = () => {
    try {
      localStorage.setItem(notesKey, JSON.stringify({ round, notes }))
    } catch {}
  }
  const toggleNotes = () => {
    noting = !noting
    notesBtn.textContent = noting ? "Notes on" : "Notes off"
    notesBtn.setAttribute("aria-pressed", String(noting))
    play("tap")
  }
  notesBtn.setAttribute("aria-pressed", "false")

  const select = (i: number) => {
    selected = i
    renderBoard()
    cells[i]!.focus()
  }

  const enter = (d: number) => {
    const v = view
    if (!v?.racing || !mine || !v.puzzle) {
      play("error")
      return ui.nudge(!v?.seated ? "You're watching this race." : v.stage === "racing" ? "You're in the next round." : "Pick a level and press start.")
    }
    if (v.puzzle[selected]) {
      play("error")
      return ui.nudge("That number is part of the puzzle.")
    }
    if (noting && d && !mine[selected]) {
      notes[selected]! ^= 1 << d
      play("tap")
    } else if (!d && !mine[selected]) {
      notes[selected] = 0
    } else {
      if (mine[selected] === d) return
      mine[selected] = d
      // Placing a digit crosses it off the notes of every cell that sees it.
      if (d) notes = notes.map((n, i) => (peers(i, selected) ? n & ~(1 << d) : n))
      play(d ? "place" : "tap")
      send({ t: "set", i: selected, v: d })
    }
    saveNotes()
    renderBoard()
  }

  board.onkeydown = (e) => {
    const moves: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }
    if (e.key in moves) {
      e.preventDefault()
      const next = selected + moves[e.key]!
      const sameRow = Math.abs(moves[e.key]!) === 9 || Math.floor(next / 9) === Math.floor(selected / 9)
      if (next >= 0 && next < 81 && sameRow) select(next)
    } else if (/^[1-9]$/.test(e.key)) enter(+e.key)
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") enter(0)
    else if (e.key === "n" || e.key === "N") toggleNotes()
  }
  // Typing works without focusing the grid first.
  document.addEventListener("keydown", (e) => {
    if (e.target !== document.body) return
    if (/^[0-9]$|^Backspace$|^Delete$/.test(e.key)) enter(e.key === "Backspace" || e.key === "Delete" ? 0 : +e.key)
    else if (e.key === "n" || e.key === "N") toggleNotes()
  })

  const renderBoard = () => {
    const v = view
    const grid = mine ?? v?.grid ?? Array<number>(81).fill(0)
    const bad = conflicts(grid)
    const pick = grid[selected]
    cells.forEach((b, i) => {
      const given = !!v?.puzzle?.[i]
      const d = grid[i]!
      const marks = !d && v?.racing ? notes[i]! : 0
      if (d) b.textContent = `${d}`
      else if (!marks) b.textContent = ""
      else {
        const grid3 = el("span", "sd-notes")
        for (let k = 1; k <= 9; k++) grid3.append(el("span", marks & (1 << k) && k === pick ? "is-same" : "", marks & (1 << k) ? `${k}` : ""))
        b.replaceChildren(grid3)
      }
      b.className = "sd-cell"
      if (given) b.classList.add("is-given")
      if (bad.has(i) && !given) b.classList.add("is-bad")
      if (i === selected) b.classList.add("is-selected")
      else if (peers(i, selected)) b.classList.add("is-peer")
      if (d && d === pick) b.classList.add("is-same")
      b.tabIndex = i === selected ? 0 : -1
      b.setAttribute("aria-label", `Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}: ${d || (marks ? `notes ${[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => marks & (1 << k)).join(" ")}` : "empty")}${given ? ", given" : bad.has(i) ? ", clashes" : ""}`)
    })
    keypad.hidden = !v?.racing
  }

  const renderHud = (v: View) => {
    const me = v.players.findIndex((p) => p.you)
    const solo = v.players.filter((p) => p.racing).length === 1
    const winner = v.winner === null ? null : v.players[v.winner]!
    if (v.stage === "done" && winner) {
      const t = time(winner.finishedMs ?? 0)
      if (winner.you) ui.status(solo ? `Solved in ${t}!` : "You win!", "end", solo ? `${LEVEL_NAME[v.level]} puzzle.` : `Finished first in ${t}.`)
      else ui.status(me < 0 ? `Player ${v.winner! + 1} wins.` : "Your friend wins.", "end", `Finished in ${t}.`)
    } else if (v.stage === "racing" && v.racing) {
      const left = (mine ?? []).filter((d, i) => !d && !v.puzzle![i]).length
      ui.status("Go!", "go", `${LEVEL_NAME[v.level]} · ${left} cells left${solo ? "" : " · first to finish wins"}`)
    } else if (v.stage === "racing") ui.status("Race in progress", "wait", v.seated ? "You're in the next round." : "You're watching.")
    else if (!v.seated) ui.status("Watching", "wait", "Two players are already here.")
    else ui.status("Pick a level", "wait", v.players.length < 2 ? "Start now to play solo, or send the link to race a friend." : "Press start when you're both ready.")
    ui.invite(v.stage === "waiting" && v.players.length < 2)
    ui.clock(null, false)

    players.replaceChildren(...v.players.map((p, k) => {
      const row = el("li", "player")
      const progress = p.finishedMs !== null ? time(p.finishedMs) : p.racing ? `${p.you && mine ? mine.filter((d, i) => d && !v.puzzle![i]).length : p.filled}/${v.blanks}` : "—"
      row.append(
        avatarImg(p.avatar, `Player ${k + 1} avatar`),
        el("span", "player-mark", `${p.wins}`),
        el("span", "player-name", `${p.you ? "You" : me >= 0 ? "Friend" : `Player ${k + 1}`} · ${progress}`),
        el("span", `presence${p.online ? " is-on" : ""}`, p.online ? "online" : "away")
      )
      if (v.winner === k) row.classList.add("is-turn")
      return row
    }))
    // Mid-race only a lone racer can restart; a two-player race runs to the finish.
    setup.hidden = !v.seated || (v.stage === "racing" && !solo)
    startBtn.textContent = v.stage === "waiting" ? "Start" : "New puzzle"
    renderBoard()
  }

  const tickClock = () => {
    if (!clockFrom) return void (clock.textContent = "00:00")
    clock.textContent = time(clockFrom.ms + (clockFrom.running ? performance.now() - clockFrom.at : 0))
  }
  setInterval(tickClock, 250)

  const send = connectRoom<View, ClientMessage>("sudoku", room, (v) => {
    const id = v.puzzle?.join("") ?? ""
    const fresh = id !== round
    if (fresh || !mine || !v.racing) mine = v.racing && v.grid ? [...v.grid] : null
    if (fresh && view && v.racing) play("turn")
    if (v.stage === "done" && view?.stage === "racing") play(v.players[v.winner!]?.you ? "win" : v.players.some((p) => p.you && p.racing) ? "lose" : "win")
    if (fresh && v.puzzle) {
      level = v.level
      renderLevels()
    }
    if (fresh) loadNotes(id)
    round = id
    view = v
    clockFrom = v.elapsedMs === null ? null : { ms: v.elapsedMs, at: performance.now(), running: v.stage === "racing" }
    tickClock()
    renderHud(v)
  }, () => ui.status("Reconnecting…", "off", "Your grid is kept for you."))
}
