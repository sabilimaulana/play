// Ceki: a DOM table (cards are real buttons, so keyboard + screen readers come free), poker's card art.
// Pick cards in your hand, then act: take a discard that melds with them, discard one, or close.
import { connectRoom } from "../net.ts"
import { play } from "../sfx.ts"
import { avatarImg, el, rulesButton, type RoomUI } from "../ui.ts"
import { back, face, mini } from "../poker/art.ts"
import { canClose, DIG, HAND_SIZE, isMeld, MAX_SEATS, RANKS, SUITS, type Action, type Card, type View } from "./logic.ts"

const RULES = `Ceki, ${HAND_SIZE} cards each, 2–${MAX_SEATS} players, four wild jokers. On your turn draw from the stock, or take a discard up to ${DIG} deep: it must make a set (3–4 of a rank) or a run (3+ in one suit, inside 2–10, or J-Q-K; aces only with aces) with 2+ cards from your hand. That meld goes on the table and the cards above it come to your hand. Then discard one. Close by discarding your last card when everything else melds. Scoring: 2–10 = 5, J/Q/K = 10, A = 15; melds count plus, dead cards minus (a joker 15), closing earns 10× the closing card. Scores add up hand after hand.`

const NAMES: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" }
const SUIT_NAMES: Record<string, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" }
const cardName = (c: Card) => (c[0] === "X" ? "Joker" : `${NAMES[c[0]!] ?? c[0]} of ${SUIT_NAMES[c[1]!]}`)
/** Hand order: by suit, then rank; jokers last. */
const order = (c: Card) => (c[0] === "X" ? 100 + SUITS.indexOf(c[1]!) : SUITS.indexOf(c[1]!) * 20 + RANKS.indexOf(c[0]!))

const urls = new Map<string, string>()
const art = (key: string, paint: () => HTMLCanvasElement) => {
  if (!urls.has(key)) urls.set(key, paint().toDataURL())
  return urls.get(key)!
}
const cardImg = (c: Card | null, small = false) => {
  const img = el("img", small ? "ck-mini" : "ck-face")
  img.src = small ? art(`m${c ?? "back"}`, () => mini(c)) : c ? art(c, () => face(c)) : art("back", back)
  img.alt = c ? cardName(c) : "Face-down card"
  img.draggable = false
  return img
}
const meldRow = (melds: ReadonlyArray<ReadonlyArray<Card>>, className = "ck-melds") => {
  const row = el("div", className)
  for (const m of melds) {
    const group = el("span", "ck-meld")
    group.append(...m.map((c) => cardImg(c, true)))
    row.append(group)
  }
  return row
}

const button = (text: string, onClick: () => void, variant = "") => {
  const b = el("button", `btn${variant ? ` btn--${variant}` : ""}`, text)
  b.type = "button"
  b.onclick = onClick
  return b
}

export const mountCeki = (ui: RoomUI, room: string): void => {
  const board = el("div", "ceki")
  ui.stage.append(board)
  const controls = el("section", "actions")
  const results = el("section", "ck-results")
  const seat = el("section", "console")
  seat.setAttribute("aria-label", "Your seat")
  seat.append(controls, results)
  const tools = el("div", "side-tools")
  tools.append(rulesButton(RULES))
  ui.side.append(seat, tools)

  let view: View | null = null
  let connected = false
  let picked = new Set<Card>()
  let lastControls = ""

  const myTurn = (v: View) => v.you !== null && v.turn === v.you && (v.phase === "draw" || v.phase === "discard")
  const nameOf = (v: View, i: number | null) => (i === null ? "?" : i === v.you ? "You" : v.seats[i]?.name ?? "?")

  const send = connectRoom<View, Action>("ceki", room, (v) => {
    sounds(view, v)
    if (v.event === "timeout" && view && myTurn(view)) ui.nudge("Time's up! A card was played for you.")
    if (v.hand !== view?.hand) picked = new Set()
    picked = new Set([...picked].filter((c) => v.mine.includes(c)))
    view = v
    connected = true
    render(v)
  }, () => {
    connected = false
    lastControls = ""
    controls.querySelectorAll("button, input").forEach((n) => ((n as HTMLButtonElement).disabled = true))
    ui.status("Reconnecting…", "off", "Your seat and score are kept.")
  })

  const sounds = (prev: View | null, v: View) => {
    if (!prev) return
    if (v.event === "timeout") play("timesup")
    if (v.hand !== prev.hand) play("swish")
    else if (v.pile.length !== prev.pile.length || v.stock !== prev.stock) play("flip")
    if (v.phase === "done" && prev.phase !== "done") {
      const won = v.result?.closer != null && v.result.closer === v.you
      play(won ? "win" : v.result?.closer == null ? "draw" : "lose", { delay: 200 })
    }
    if (myTurn(v) && !myTurn(prev)) setTimeout(() => play("turn"), 140)
  }

  const toggle = (c: Card) => {
    picked.has(c) ? picked.delete(c) : picked.add(c)
    play("tap")
    if (view) render(view)
  }

  const take = (v: View, i: number) => {
    if (!myTurn(v)) return ui.nudge("Not your turn yet.")
    if (v.phase !== "draw") return ui.nudge("You already drew. Discard or close.")
    const card = v.pile[v.pile.length - 1 - i]!
    if (picked.size < 2) return ui.nudge(`Pick 2+ cards from your hand that meld with the ${cardName(card)}.`)
    if (!isMeld([...picked, card])) return ui.nudge("Those don't make a set or run with it.")
    if (v.mine.length - picked.size + i < 1) return ui.nudge("Keep a card to discard.")
    send({ t: "take", i, cards: [...picked] })
    picked = new Set()
  }

  const render = (v: View) => {
    renderBoard(v)
    renderStatus(v)
    renderControls(v)
    renderResults(v)
    ui.clock(v.turnMs ?? null, myTurn(v))
  }

  const renderBoard = (v: View) => {
    const n = v.seats.length
    const around = [...Array(n).keys()].map((k) => (k + (v.you ?? 0)) % n).filter((i) => i !== v.you)
    const others = el("ol", "ck-seats")
    others.setAttribute("aria-label", "Players")
    for (const i of around) others.append(seatNode(v, i))

    const middle = el("div", "ck-middle")
    const stock = el("button", "ck-stock")
    stock.type = "button"
    stock.append(cardImg(null), el("span", "ck-count", `${v.stock}`))
    stock.setAttribute("aria-label", `Stock, ${v.stock} cards. Draw.`)
    stock.disabled = !(myTurn(v) && v.phase === "draw")
    stock.onclick = () => send({ t: "draw" })
    const pile = el("div", "ck-pile")
    pile.setAttribute("aria-label", "Discard pile")
    const reach = v.pile.slice(-DIG)
    const buried = v.pile.length - reach.length
    if (buried) pile.append(el("span", "ck-buried", `+${buried}`))
    reach.forEach((c, k) => {
      const i = reach.length - 1 - k
      const b = el("button", "ck-discard")
      b.type = "button"
      b.append(cardImg(c))
      b.setAttribute("aria-label", `Take ${cardName(c)}${i ? `, ${i} deep` : ", top"}`)
      b.disabled = !(myTurn(v) && v.phase === "draw")
      b.classList.toggle("is-fit", !b.disabled && picked.size >= 2 && isMeld([...picked, c]))
      b.onclick = () => take(v, i)
      pile.append(b)
    })
    if (!v.pile.length) pile.append(el("span", "ck-empty", "Discards"))
    middle.append(stock, pile)

    const mine = el("div", "ck-mine")
    if (v.you !== null) {
      mine.append(seatNode(v, v.you, "div"))
      const hand = el("div", "ck-hand")
      hand.setAttribute("aria-label", "Your hand")
      for (const c of [...v.mine].sort((a, b) => order(a) - order(b))) {
        const b = el("button", "ck-card")
        b.type = "button"
        b.append(cardImg(c))
        b.setAttribute("aria-pressed", `${picked.has(c)}`)
        b.setAttribute("aria-label", cardName(c))
        b.classList.toggle("is-new", c === v.drawn)
        b.onclick = () => toggle(c)
        hand.append(b)
      }
      mine.append(hand)
    }
    board.replaceChildren(others, middle, mine)
  }

  const seatNode = (v: View, i: number, tag: "li" | "div" = "li") => {
    const s = v.seats[i]!
    const node = el(tag, "ck-seat")
    node.classList.toggle("is-turn", v.turn === i && (v.phase === "draw" || v.phase === "discard"))
    node.classList.toggle("is-you", i === v.you)
    node.classList.toggle("is-away", !s.online)
    const head = el("div", "ck-seat-head")
    const label = el("div", "ck-seat-label")
    label.append(el("span", "player-name", `${s.name}${i === v.you ? " (you)" : ""}`), el("span", "ck-score", `${s.score} pts${i === v.you ? "" : ` · ${s.cards} cards`}`))
    head.append(avatarImg(s.avatar, s.name, 32), label)
    if (i === v.dealer && v.hand) head.append(el("span", "ck-dealer", "D"))
    if (!s.online) head.append(el("span", "ck-away", "away"))
    node.append(head)
    if (i !== v.you && s.cards) {
      const fan = el("div", "ck-fan")
      for (let k = 0; k < Math.min(s.cards, 10); k++) fan.append(cardImg(null, true))
      node.append(fan)
    }
    if (s.melds.length) node.append(meldRow(s.melds))
    return node
  }

  const renderStatus = (v: View) => {
    const online = v.seats.filter((s) => s.online).length
    ui.invite(online < 2)
    if (v.phase === "done" && v.result) {
      const r = v.result
      const mine = v.you === null ? null : r.rows[v.you]!.delta
      const detail = mine === null ? "" : `You ${mine >= 0 ? "+" : ""}${mine} this hand.`
      if (r.closer === null) return ui.status("Stock ran out. Nobody closed.", "end", detail)
      return ui.status(r.closer === v.you ? "You closed!" : `${nameOf(v, r.closer)} closed.`, "end", `Closing card ${cardName(r.card!)}. ${detail}`)
    }
    if (myTurn(v)) {
      if (v.phase === "draw") return ui.status("Your turn", "go", `Draw from the stock, or pick 2+ cards and take a discard that melds with them.${v.stock ? "" : " The stock is empty: drawing ends the hand."}`)
      const closing = v.mine.some((c) => canClose(v.mine, c))
      return ui.status(closing ? "Your turn: you can close!" : "Your turn", "go", closing ? "Pick the card to throw and Close." : "Pick one card and discard it.")
    }
    if (v.phase === "draw" || v.phase === "discard") return ui.status(`${nameOf(v, v.turn)} is playing…`, "wait", `Hand ${v.hand} · ${v.stock} in the stock`)
    if (v.you === null) {
      const full = v.seats.length >= MAX_SEATS
      return ui.status(full ? "Table full" : "Take a seat", "wait", full ? "You can watch this table." : `${v.seats.length} of ${MAX_SEATS} seats taken.`)
    }
    if (online < 2) return ui.status("Waiting for players…", "wait", "Send the link to friends, or add a bot. Two players can start.")
    ui.status("Ready to deal", "wait", `${online} players.`)
  }

  const renderControls = (v: View) => {
    const one = picked.size === 1 ? [...picked][0]! : null
    const key = JSON.stringify([v.you, v.phase, v.turn, v.hand, v.canDeal, v.seats.length, myTurn(v), one, picked.size, connected])
    if (key === lastControls) return
    lastControls = key
    const nodes: HTMLElement[] = []
    if (v.you === null) {
      if (v.seats.length < MAX_SEATS && (v.phase === "waiting" || v.phase === "done")) nodes.push(sitForm())
      else if (v.seats.length < MAX_SEATS) nodes.push(el("p", "hint", "A hand is on. You can sit when it ends."))
    } else if (myTurn(v)) {
      const row = el("div", "act-buttons")
      if (v.phase === "draw") {
        row.append(button(v.stock ? "Draw" : "End hand", () => send({ t: "draw" })))
        nodes.push(el("p", "hint", picked.size >= 2 ? `${picked.size} picked. Tap a discard that melds with them.` : "Or pick 2+ cards, then tap a discard to take it."))
      } else {
        const discard = button(one ? `Discard ${cardName(one)}` : "Discard", () => {
          if (!one) return ui.nudge("Pick one card to discard.")
          send({ t: "discard", card: one })
          picked = new Set()
        }, "quiet")
        const close = button("Close", () => {
          if (!one) return ui.nudge("Pick the one card to close with.")
          if (!canClose(v.mine, one)) return ui.nudge("The rest of your hand doesn't all meld yet.")
          send({ t: "close", card: one })
          picked = new Set()
        })
        close.disabled = !one || !canClose(v.mine, one)
        row.append(discard, close)
      }
      nodes.push(row)
    } else if (v.phase === "waiting" || v.phase === "done") {
      const row = el("div", "act-buttons")
      if (v.canDeal) row.append(button(v.hand ? "Deal next hand" : "Deal", () => send({ t: "deal" })))
      if (v.seats.length < MAX_SEATS) row.append(button("Add a bot", () => send({ t: "bot" }), "quiet"))
      if (row.childElementCount) nodes.push(row)
    } else nodes.push(el("p", "hint", "Waiting for your turn… Pick cards to plan a meld."))
    controls.replaceChildren(...nodes)
  }

  const sitForm = () => {
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
    return form
  }

  // Last hand, everyone's cards face up: table melds, how the hand split, dead cards, and the score.
  const renderResults = (v: View) => {
    results.hidden = v.phase !== "done" || !v.result
    if (results.hidden) return results.replaceChildren()
    const list = el("ol", "ck-rows")
    v.result!.rows.forEach((r, i) => {
      const row = el("li", "ck-row")
      const head = el("p", "ck-row-head")
      head.append(el("span", "player-name", nameOf(v, i)), el("span", `ck-delta${r.delta < 0 ? " is-minus" : ""}`, `${r.delta >= 0 ? "+" : ""}${r.delta}`), el("span", "ck-score", `${v.seats[i]?.score ?? 0} total`))
      row.append(head, meldRow([...r.table, ...r.melds]))
      if (r.dead.length) row.append(meldRow([r.dead], "ck-melds is-dead"))
      list.append(row)
    })
    results.replaceChildren(el("h2", "ck-results-title", `Hand ${v.hand}`), list)
  }
}

