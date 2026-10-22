// No-limit Texas Hold'em table. Pure: the Durable Object owns storage, sockets and shuffling.
import { avatarOf, cleanName } from "../avatar.ts"
import { evaluate, fullDeck, type Card } from "./hand.ts"

export type { Card }
export const SMALL_BLIND = 10
export const BIG_BLIND = 20
export const START_CHIPS = 1000
export const MAX_SEATS = 9
/** Turns timed out in a row before the seat is removed. */
export const IDLE_KICK = 3
/** How long a finished hand's result stays up before the table clears for the next deal. */
export const SHOWDOWN_MS = 8_000
export const FOLD_SHOW_MS = 3_000
/** A kick vote stays open this long (like CS/Valorant). */
export const VOTE_MS = 30_000
/** Finished hands kept for the history panel. */
export const HISTORY = 20
export const EMOTES = ["😂", "😏", "🤡", "😭", "🔥", "💸", "🐔", "👋"]

export type Stage = "waiting" | "preflop" | "flop" | "turn" | "river" | "done"

export interface Seat {
  readonly pid: string
  readonly name: string
  chips: number
  hole: Card[]
  bet: number // this street
  committed: number // this hand
  inHand: boolean
  folded: boolean
  allIn: boolean
  acted: boolean
  last?: string | null // last action this street, shown on the seat ("Call 20")
  idle?: number // turns timed out in a row
  emote?: { readonly e: string; readonly n: number } // n counts up so the same emoji can repeat
}

export interface Pot {
  readonly amount: number
  readonly winners: ReadonlyArray<number> // seat indexes
  readonly hand: string // "" when won uncontested
}

/** One finished hand, frozen as the table looked at the end. Holds every hole card; `view` only reveals shown hands and your own. */
export interface Round {
  readonly hand: number
  readonly board: ReadonlyArray<Card>
  readonly button: number // index into players
  readonly pots: ReadonlyArray<Pot> // winners index into players
  readonly players: ReadonlyArray<{ readonly pid: string; readonly name: string; readonly hole: ReadonlyArray<Card>; readonly chips: number; readonly net: number; readonly folded: boolean; readonly shown: boolean; readonly hand: string | null }>
}

export interface RoundView {
  readonly hand: number
  readonly board: ReadonlyArray<Card>
  readonly button: number
  readonly pots: ReadonlyArray<Pot>
  // cards like a seat at the end of the hand: [] folded, null face down
  readonly players: ReadonlyArray<{ readonly name: string; readonly avatar: string; readonly you: boolean; readonly cards: ReadonlyArray<Card | null>; readonly chips: number; readonly net: number; readonly folded: boolean; readonly hand: string | null }>
}

export interface Table {
  seats: Seat[]
  button: number
  stage: Stage
  deck: Card[]
  board: Card[]
  toAct: number | null
  currentBet: number
  minRaise: number
  pots: Pot[] // last hand's result, shown while stage is "done"
  shown: number[] // seats whose cards are revealed at showdown
  hand: number
  vote?: Vote | null
  stacks?: Record<string, number> // chips of players who left (idle or voted off), back when they sit again
  rounds?: Round[] // newest first
}

export interface Vote {
  readonly target: string // pid
  yes: string[]
  no: string[]
  readonly until: number // epoch ms
}

export type Action =
  | { readonly t: "sit"; readonly name: string }
  | { readonly t: "bot" }
  | { readonly t: "deal" }
  | { readonly t: "emote"; readonly e: string }
  | { readonly t: "kick"; readonly seat: number }
  | { readonly t: "vote"; readonly yes: boolean }
  | { readonly t: "fold" }
  | { readonly t: "check" }
  | { readonly t: "call" }
  | { readonly t: "raise"; readonly to: number }

export interface SeatView {
  readonly name: string
  readonly avatar: string
  readonly chips: number
  readonly bet: number
  readonly inHand: boolean
  readonly folded: boolean
  readonly allIn: boolean
  readonly online: boolean
  readonly cards: ReadonlyArray<Card | null> // null = face down
  readonly hand: string | null // hand name when shown
  readonly last: string | null
  readonly emote: { readonly e: string; readonly n: number } | null
  readonly leaving: boolean // voted off or timed out too often: leaves after this hand
}

export interface View {
  /** Milliseconds left on the current turn clock (set by the room), null when nobody is on the clock. */
  readonly turnMs?: number | null
  /** "timeout" on the update caused by a turn running out. */
  readonly event?: "timeout"
  readonly you: number | null
  readonly stage: Stage
  readonly seats: ReadonlyArray<SeatView>
  readonly board: ReadonlyArray<Card>
  readonly pot: number
  readonly button: number
  readonly toAct: number | null
  readonly hand: number
  readonly pots: ReadonlyArray<Pot>
  readonly rounds: ReadonlyArray<RoundView>
  readonly canDeal: boolean
  /** Open kick vote: counts, what you voted, whether you get a vote at all. */
  readonly vote: { readonly target: number; readonly yes: number; readonly no: number; readonly need: number; readonly ms: number; readonly mine: "yes" | "no" | null; readonly canVote: boolean } | null
  readonly options: { readonly call: number; readonly minRaiseTo: number; readonly maxRaiseTo: number } | null
}

export const newTable = (): Table => ({
  seats: [], button: -1, stage: "waiting", deck: [], board: [], toAct: null,
  currentBet: 0, minRaise: BIG_BLIND, pots: [], shown: [], hand: 0
})

const betting = (t: Table) => t.stage !== "waiting" && t.stage !== "done"
const live = (s: Seat) => s.inHand && !s.folded
const canAct = (s: Seat) => live(s) && !s.allIn

const next = (t: Table, from: number, ok: (s: Seat) => boolean): number | null => {
  const n = t.seats.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n
    if (ok(t.seats[i]!)) return i
  }
  return null
}

const put = (s: Seat, amount: number) => {
  const a = Math.min(amount, s.chips)
  s.chips -= a
  s.bet += a
  s.committed += a
  if (s.chips === 0) s.allIn = true
}

const eligible = (t: Table, online: ReadonlySet<string>) => t.seats.filter((s) => s.chips > 0 && online.has(s.pid))
const idle = (s: Seat) => (s.idle ?? 0) >= IDLE_KICK

export const seatOf = (t: Table, pid: string): number | null => {
  const i = t.seats.findIndex((s) => s.pid === pid)
  return i < 0 ? null : i
}

export const clone = (t: Table): Table => structuredClone(t)

/** Applies one player action. Returns an error string when the action is not allowed. */
export const apply = (table: Table, pid: string, action: Action, online: ReadonlySet<string>, shuffle: () => Card[], now = Date.now()): Table | string => {
  const t = clone(table)
  const me = seatOf(t, pid)

  if (action.t === "sit") {
    if (me !== null) return "already seated"
    if (t.seats.length >= MAX_SEATS) return "table full"
    const chips = t.stacks?.[pid] ?? START_CHIPS
    delete t.stacks?.[pid]
    t.seats.push({ pid, name: action.name, chips, hole: [], bet: 0, committed: 0, inHand: false, folded: false, allIn: false, acted: false })
    return t
  }
  if (me === null) return "not seated"
  const seat = t.seats[me]!

  if (action.t === "bot") {
    if (t.seats.length >= MAX_SEATS) return "table full"
    const k = Array.from({ length: MAX_SEATS }, (_, i) => i + 1).find((k) => !t.seats.some((s) => s.pid === `bot-${k}`))!
    t.seats.push({ pid: `bot-${k}`, name: `Bot ${k}`, chips: START_CHIPS, hole: [], bet: 0, committed: 0, inHand: false, folded: false, allIn: false, acted: false })
    return t
  }

  if (action.t === "emote") {
    if (!EMOTES.includes(action.e)) return "bad emote"
    seat.emote = { e: action.e, n: (seat.emote?.n ?? 0) + 1 }
    return t
  }

  if (action.t === "kick") {
    const target = t.seats[action.seat]
    if (!target || target.pid === pid) return "bad target"
    if (t.vote && t.vote.until > now) return "vote in progress"
    t.vote = { target: target.pid, yes: [], no: [], until: now + VOTE_MS }
    return vote(t, pid, true, online)
  }
  if (action.t === "vote") {
    if (!t.vote || t.vote.until <= now) return "no vote"
    return vote(t, pid, action.yes, online)
  }

  if (action.t === "deal") {
    if (betting(t)) return "hand in progress"
    if (t.stage === "done") return "showing the result"
    if (eligible(t, online).length < 2) return "need two players"
    return deal(t, online, shuffle())
  }

  if (!betting(t) || t.toAct !== me) return "not your turn"
  switch (action.t) {
    case "fold":
      seat.folded = true
      seat.last = "Fold"
      break
    case "check":
      if (seat.bet < t.currentBet) return "cannot check"
      seat.last = "Check"
      break
    case "call":
      if (seat.bet >= t.currentBet) return "nothing to call"
      put(seat, t.currentBet - seat.bet)
      seat.last = seat.allIn ? "All in" : `Call ${seat.bet}`
      break
    case "raise": {
      const max = seat.bet + seat.chips
      const to = action.to
      if (!Number.isInteger(to) || to <= t.currentBet || to > max) return "bad amount"
      if (to < t.currentBet + t.minRaise && to < max) return "raise too small"
      // ponytail: a short all-in raise reopens betting like a full raise; strict TDA rules don't.
      t.minRaise = Math.max(t.minRaise, to - t.currentBet)
      t.currentBet = to
      put(seat, to - seat.bet)
      seat.last = seat.allIn ? "All in" : `Raise ${to}`
      for (const s of t.seats) s.acted = false
      break
    }
  }
  seat.acted = true
  seat.idle = 0
  return advance(t, me)
}

export const TURN_MS = 30_000

/** The player to act checks if that's free, otherwise folds. Used for time-outs and disconnects. */
export const autoAct = (t: Table, online: ReadonlySet<string>): Table => {
  if (!betting(t) || t.toAct === null) return t
  const s = t.seats[t.toAct]!
  const r = apply(t, s.pid, { t: s.bet >= t.currentBet ? "check" : "fold" }, online, () => [])
  if (typeof r === "string") return t
  r.seats[t.toAct]!.idle = s.idle ?? 0 // a move made for you doesn't count as being back
  return r
}

/** Everyone online and seated gets a say, except bots and the player on trial. */
const voters = (t: Table, target: string, online: ReadonlySet<string>) =>
  t.seats.filter((s) => !isBot(s.pid) && online.has(s.pid) && s.pid !== target).map((s) => s.pid)

/** Records a ballot. Over half yes frees the seat (now, or after the hand; they can sit again). Half or more no: vote fails. */
const vote = (t: Table, pid: string, yes: boolean, online: ReadonlySet<string>): Table | string => {
  const v = t.vote!
  const who = voters(t, v.target, online)
  if (!who.includes(pid)) return "cannot vote"
  v.yes = v.yes.filter((p) => p !== pid)
  v.no = v.no.filter((p) => p !== pid)
  ;(yes ? v.yes : v.no).push(pid)
  const count = (ballots: string[]) => ballots.filter((p) => who.includes(p)).length
  if (count(v.yes) * 2 > who.length) {
    t.vote = null
    t.seats.find((s) => s.pid === v.target)!.idle = IDLE_KICK
    return t.stage === "waiting" ? tidy(t) : t
  } else if (count(v.no) * 2 >= who.length) t.vote = null
  return t
}

/** The turn clock ran out: auto-act and count it against the seat. */
export const timeout = (t: Table, online: ReadonlySet<string>): Table => {
  const i = t.toAct
  const r = autoAct(t, online)
  if (r === t || i === null) return t
  r.seats[i]!.idle = (t.seats[i]!.idle ?? 0) + 1
  return r
}

/** Clears a finished hand: busted players and idle ones leave (they can sit again), busted bots rebuy. */
export const tidy = (table: Table): Table => {
  if (betting(table)) return table
  const t = clone(table)
  const keep = t.seats.map((s) => !idle(s) && (s.chips > 0 || isBot(s.pid)))
  // The button stays on the last kept seat at or before it, so it still moves on to the right player.
  t.button = keep.filter((k, i) => k && i <= t.button).length - 1
  // ponytail: one entry per player who ever left with chips; a few bytes each, never pruned.
  t.seats.forEach((s, i) => {
    if (!keep[i] && s.chips > 0 && !isBot(s.pid)) (t.stacks ??= {})[s.pid] = s.chips
  })
  t.seats = t.seats.filter((_, i) => keep[i])
  for (const s of t.seats) {
    if (s.chips === 0) s.chips = START_CHIPS
    Object.assign(s, { hole: [], inHand: false, folded: false, allIn: false, acted: false, last: null })
  }
  Object.assign(t, { stage: "waiting", board: [], pots: [], shown: [], toAct: null })
  if (t.vote && !t.seats.some((s) => s.pid === t.vote!.target)) t.vote = null
  return t
}

/** Auto-acts for disconnected players and seats that timed out too often, so the table never stalls. */
export const settle = (table: Table, online: ReadonlySet<string>): Table => {
  let t = table
  while (betting(t) && t.toAct !== null && (!online.has(t.seats[t.toAct]!.pid) || idle(t.seats[t.toAct]!))) {
    const next = autoAct(t, online)
    if (next === t) break
    t = next
  }
  return t
}

/** Computer players get ids a real player id can't match. */
export const isBot = (pid: string): boolean => pid.startsWith("bot-")

/** Chance that `hole` beats `opponents` random hands by showdown, estimated by dealing out `sims` random runouts. */
export const equity = (hole: ReadonlyArray<Card>, board: ReadonlyArray<Card>, opponents: number, random: () => number, sims = 200): number => {
  const known = new Set([...hole, ...board])
  const deck = fullDeck().filter((c) => !known.has(c))
  const need = 5 - board.length + 2 * opponents
  let won = 0
  for (let k = 0; k < sims; k++) {
    // Partial Fisher-Yates: the last `need` cards are a random draw.
    for (let i = deck.length - 1; i >= deck.length - need; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
    }
    const draw = deck.slice(deck.length - need)
    const full = [...board, ...draw.splice(0, 5 - board.length)]
    const mine = evaluate([...hole, ...full]).score
    let best = 0
    for (let o = 0; o < opponents; o++) best = Math.max(best, evaluate([draw[2 * o]!, draw[2 * o + 1]!, ...full]).score)
    won += mine > best ? 1 : mine === best ? 0.5 : 0
  }
  return won / sims
}

// ponytail: equity-vs-pot-odds bot with a pinch of randomness; no position, reads or bet sizing tells.
/** The computer to act decides from its showdown equity against the players still in the hand. */
export const botAct = (table: Table, online: ReadonlySet<string>, random: () => number): Table => {
  if (!betting(table) || table.toAct === null) return table
  const s = table.seats[table.toAct]!
  const opponents = table.seats.filter(live).length - 1
  const eq = equity(s.hole, table.board, opponents, random) + (random() - 0.5) * 0.1
  const pot = table.seats.reduce((sum, x) => sum + x.committed, 0)
  const toCall = Math.min(table.currentBet - s.bet, s.chips)
  const max = s.bet + s.chips
  // Strong hands (and the odd bluff) bet around 3/4 pot.
  const raise = eq > 0.65 || (toCall === 0 && random() < 0.08)
  const to = Math.min(max, Math.max(table.currentBet + table.minRaise, table.currentBet + Math.round((pot + toCall) * 0.75)))
  const action: Action =
    raise && max > table.currentBet ? { t: "raise", to }
    : toCall === 0 ? { t: "check" }
    : eq >= toCall / (pot + toCall) ? { t: "call" }
    : { t: "fold" }
  const r = apply(table, s.pid, action, online, () => [])
  return typeof r === "string" ? autoAct(table, online) : r
}

/** Identifies the current decision (or the result on show); a new key restarts the clock. */
export const turnKey = (t: Table): string | null =>
  betting(t) && t.toAct !== null
    ? `${t.hand}|${t.stage}|${t.toAct}|${t.seats.map((s) => `${s.committed}${s.acted ? "a" : ""}${s.folded ? "f" : ""}`).join()}`
    : t.stage === "done" ? `${t.hand}|done` : null

/** Clock length for the current key: a turn, or how long a result stays up. */
export const turnMs = (t: Table): number => (t.stage !== "done" ? TURN_MS : t.shown.length ? SHOWDOWN_MS : FOLD_SHOW_MS)

const deal = (t: Table, online: ReadonlySet<string>, deck: Card[]): Table => {
  const playing = new Set(eligible(t, online))
  for (const s of t.seats) Object.assign(s, { hole: [], bet: 0, committed: 0, inHand: playing.has(s), folded: false, allIn: false, acted: false, last: null })
  t.deck = deck
  t.board = []
  t.pots = []
  t.shown = []
  t.hand++
  t.stage = "preflop"
  t.button = next(t, t.button, (s) => s.inHand)!
  const headsUp = playing.size === 2
  const sb = headsUp ? t.button : next(t, t.button, (s) => s.inHand)!
  const bb = next(t, sb, (s) => s.inHand)!
  for (const s of t.seats) if (s.inHand) s.hole = [t.deck.pop()!, t.deck.pop()!]
  put(t.seats[sb]!, SMALL_BLIND)
  put(t.seats[bb]!, BIG_BLIND)
  t.seats[sb]!.last = "SB"
  t.seats[bb]!.last = "BB"
  t.currentBet = BIG_BLIND
  t.minRaise = BIG_BLIND
  return advance(t, bb)
}

const advance = (t: Table, from: number): Table => {
  if (t.seats.filter(live).length === 1) return showdown(t)
  // A lone player who can still bet only acts when facing a bet; otherwise the board runs out.
  const bettors = t.seats.filter(canAct).length
  const needs = (s: Seat) => canAct(s) && (s.bet < t.currentBet || (!s.acted && bettors > 1))
  const i = next(t, from, needs)
  if (i !== null) {
    t.toAct = i
    return t
  }
  // Street over. Deal the next one; skip betting when fewer than two can still bet.
  for (const s of t.seats) {
    s.bet = 0
    s.acted = false
    if (!s.folded && !s.allIn) s.last = null
  }
  t.currentBet = 0
  t.minRaise = BIG_BLIND
  t.toAct = null
  if (t.stage === "river") return showdown(t)
  const draw = t.stage === "preflop" ? 3 : 1
  for (let k = 0; k < draw; k++) t.board.push(t.deck.pop()!)
  t.stage = t.stage === "preflop" ? "flop" : t.stage === "flop" ? "turn" : "river"
  return advance(t, t.button)
}

const showdown = (t: Table): Table => {
  const contenders = t.seats.map((s, i) => ({ s, i })).filter(({ s }) => live(s))
  const contested = contenders.length > 1
  if (contested) while (t.board.length < 5) t.board.push(t.deck.pop()!)
  const score = new Map(contenders.map(({ s, i }) => [i, contested ? evaluate([...s.hole, ...t.board]) : { score: 0, name: "" }]))

  // Side pots: one layer per distinct commitment level; only live seats at that level can win it.
  const levels = [...new Set(t.seats.map((s) => s.committed).filter((c) => c > 0))].sort((a, b) => a - b)
  const pots: Array<{ amount: number; eligible: number[] }> = []
  let prev = 0
  let carry = 0 // a layer only folded seats reached rolls into the next one
  for (const level of levels) {
    const amount = carry + t.seats.reduce((sum, s) => sum + Math.min(s.committed, level) - Math.min(s.committed, prev), 0)
    const elig = contenders.filter(({ s }) => s.committed >= level).map(({ i }) => i)
    const last = pots.at(-1)
    carry = 0
    prev = level
    if (elig.length === 0) carry = amount
    else if (last?.eligible.join() === elig.join()) last.amount += amount
    else pots.push({ amount, eligible: elig })
  }
  if (carry) pots.at(-1)!.amount += carry

  const awards = new Map<number, number>()
  t.pots = pots.map(({ amount, eligible }) => {
    const best = Math.max(...eligible.map((i) => score.get(i)!.score))
    // Odd chips go to the first winner left of the button.
    const fromButton = (i: number) => (i - t.button - 1 + t.seats.length) % t.seats.length
    const winners = eligible.filter((i) => score.get(i)!.score === best).sort((a, b) => fromButton(a) - fromButton(b))
    const share = Math.floor(amount / winners.length)
    winners.forEach((i, k) => {
      const won = share + (k < amount - share * winners.length ? 1 : 0)
      t.seats[i]!.chips += won
      awards.set(i, (awards.get(i) ?? 0) + won)
    })
    return { amount, winners, hand: contested ? score.get(winners[0]!)!.name : "" }
  })
  t.shown = contested ? contenders.map(({ i }) => i) : []
  const dealt = t.seats.flatMap((s, i) => (s.inHand ? [i] : []))
  const at = (i: number) => dealt.indexOf(i)
  const round: Round = {
    hand: t.hand,
    board: [...t.board],
    button: at(t.button),
    pots: t.pots.map((p) => ({ ...p, winners: p.winners.map(at) })),
    players: dealt.map((i) => {
      const s = t.seats[i]!
      return { pid: s.pid, name: s.name, hole: s.hole, chips: s.chips, net: (awards.get(i) ?? 0) - s.committed, folded: s.folded, shown: t.shown.includes(i), hand: t.shown.includes(i) ? score.get(i)!.name : null }
    })
  }
  // ponytail: all rounds ride along on every view; send only new ones if messages get heavy.
  t.rounds = [round, ...(t.rounds ?? [])].slice(0, HISTORY)
  for (const s of t.seats) {
    s.bet = 0
    s.committed = 0
  }
  t.stage = "done"
  t.toAct = null
  return t
}

export const view = (t: Table, pid: string, online: ReadonlySet<string>, now = Date.now()): View => {
  const you = seatOf(t, pid)
  const v = t.vote && t.vote.until > now ? t.vote : null
  const who = v ? voters(t, v.target, online) : []
  const me = you === null ? null : t.seats[you]!
  const myTurn = me !== null && betting(t) && t.toAct === you
  return {
    you,
    stage: t.stage,
    board: t.board,
    pot: t.seats.reduce((sum, s) => sum + s.committed, 0),
    button: t.button,
    toAct: t.toAct,
    hand: t.hand,
    pots: t.pots,
    rounds: (t.rounds ?? []).map((r) => ({
      hand: r.hand,
      board: r.board,
      button: r.button,
      pots: r.pots,
      players: r.players.map((p) => ({
        name: p.name,
        avatar: avatarOf(p.pid),
        you: p.pid === pid,
        cards: p.shown || p.pid === pid ? p.hole : p.folded ? [] : p.hole.map(() => null),
        chips: p.chips,
        net: p.net,
        folded: p.folded,
        hand: p.hand
      }))
    })),
    canDeal: me !== null && t.stage === "waiting" && eligible(t, online).length >= 2,
    vote: v && {
      target: seatOf(t, v.target) ?? -1,
      yes: v.yes.filter((p) => who.includes(p)).length,
      no: v.no.filter((p) => who.includes(p)).length,
      need: Math.floor(who.length / 2) + 1,
      ms: v.until - now,
      mine: v.yes.includes(pid) ? "yes" : v.no.includes(pid) ? "no" : null,
      canVote: who.includes(pid)
    },
    options: myTurn
      ? {
          call: Math.min(t.currentBet - me.bet, me.chips),
          minRaiseTo: Math.min(t.currentBet + t.minRaise, me.bet + me.chips),
          maxRaiseTo: me.bet + me.chips
        }
      : null,
    seats: t.seats.map((s, i) => {
      const shown = t.stage === "done" && t.shown.includes(i)
      return {
        name: s.name,
        avatar: avatarOf(s.pid),
        chips: s.chips,
        bet: s.bet,
        inHand: s.inHand,
        folded: s.folded,
        allIn: s.allIn,
        online: online.has(s.pid),
        cards: i === you || shown ? s.hole : live(s) ? s.hole.map(() => null) : [],
        hand: shown && t.board.length === 5 ? evaluate([...s.hole, ...t.board]).name : null,
        last: s.last ?? null,
        emote: s.emote ?? null,
        leaving: idle(s)
      }
    })
  }
}

export const parseAction = (raw: unknown): Action | null => {
  if (typeof raw !== "string" || raw.length > 128) return null
  try {
    const m = JSON.parse(raw) as { t?: unknown; name?: unknown; to?: unknown; e?: unknown; seat?: unknown; yes?: unknown }
    switch (m?.t) {
      case "deal": case "fold": case "check": case "call": case "bot":
        return { t: m.t }
      case "emote":
        return typeof m.e === "string" ? { t: "emote", e: m.e } : null
      case "kick":
        return Number.isInteger(m.seat) ? { t: "kick", seat: m.seat as number } : null
      case "vote":
        return typeof m.yes === "boolean" ? { t: "vote", yes: m.yes } : null
      case "raise":
        return typeof m.to === "number" ? { t: "raise", to: m.to } : null
      case "sit": {
        const name = cleanName(m.name)
        return name ? { t: "sit", name } : null
      }
    }
  } catch {}
  return null
}
