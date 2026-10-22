// Ceki: Indonesian 7-card remi with a 52-card deck and four jokers. Rules: docs/ceki-rules.md §9.
// Pure: the Durable Object owns storage, sockets and shuffling.
import { avatarOf, cleanName } from "../avatar.ts"

export type Card = string // rank + suit like poker ("As", "Td"); jokers are "Xs", "Xh", "Xd", "Xc"
export const RANKS = "A23456789TJQK"
export const SUITS = "shdc"
export const MAX_SEATS = 4
export const HAND_SIZE = 7
/** How deep into the discard pile you may take (index 0 = top). */
export const DIG = 7
export const TURN_MS = 30_000

export const fullDeck = (): Card[] => [...[...RANKS].flatMap((r) => [...SUITS].map((s) => r + s)), ...[...SUITS].map((s) => `X${s}`)]

export const isJoker = (c: Card): boolean => c[0] === "X"
/** 2-10 = 5, J/Q/K = 10, A = 15; a joker left dead costs 15. */
export const value = (c: Card): number => (c[0] === "A" || isJoker(c) ? 15 : "JQK".includes(c[0]!) ? 10 : 5)

const RUN = "23456789T" // runs live inside 2..10, or are exactly J-Q-K; aces never run

/** Set (3-4 of a rank) or same-suit run, jokers standing in for anything; at least one real card. */
export const isMeld = (cards: ReadonlyArray<Card>): boolean => {
  const real = cards.filter((c) => !isJoker(c))
  if (cards.length < 3 || !real.length) return false
  const ranks = real.map((c) => c[0]!)
  if (cards.length <= 4 && ranks.every((r) => r === ranks[0])) return true
  if (!real.every((c) => c[1] === real[0]![1]) || new Set(ranks).size < ranks.length) return false
  if (ranks.every((r) => "JQK".includes(r))) return cards.length === 3
  const at = ranks.map((r) => RUN.indexOf(r))
  return at.every((i) => i >= 0) && cards.length <= RUN.length && Math.max(...at) - Math.min(...at) < cards.length
}

/** Every card in a meld is worth the same (a run never mixes 2-10 with J-Q-K), jokers included. */
export const meldValue = (cards: ReadonlyArray<Card>): number => cards.length * value(cards.find((c) => !isJoker(c))!)

const lowBit = (m: number) => 31 - Math.clz32(m & -m)

/** Best split of a hand into melds (counted +) and dead cards (counted -). */
export const arrange = (hand: ReadonlyArray<Card>): { readonly melds: Card[][]; readonly dead: Card[]; readonly score: number } => {
  const real = hand.filter((c) => !isJoker(c))
  const jokers = hand.filter(isJoker)
  // Every meld holds a real card, so melds are grouped by their lowest one; jokers are interchangeable.
  const options: Array<Array<{ m: number; k: number; score: number }>> = real.map(() => [])
  // A meld's real cards share a rank or a suit, so only subsets of those groups are tried.
  const groups = new Map<string, number>()
  real.forEach((c, i) => {
    for (const key of [c[0]!, c[1]!]) groups.set(key, (groups.get(key) ?? 0) | (1 << i))
  })
  const tried = new Set<number>()
  for (const g of groups.values()) for (let m = g; m; m = (m - 1) & g) {
    if (tried.has(m)) continue
    tried.add(m)
    const cards = real.filter((_, i) => (m >> i) & 1)
    for (let k = Math.max(0, 3 - cards.length); k <= jokers.length && cards.length + k <= RUN.length; k++) {
      const meld = [...cards, ...jokers.slice(0, k)]
      if (isMeld(meld)) options[lowBit(m)]!.push({ m, k, score: meldValue(meld) })
    }
  }
  const memo = new Map<number, { score: number; pick: { m: number; k: number } | null }>()
  const best = (mask: number, k: number): number => {
    if (!mask) return -15 * k
    const key = mask * 8 + k
    const hit = memo.get(key)
    if (hit) return hit.score
    const i = lowBit(mask)
    let score = best(mask & ~(1 << i), k) - value(real[i]!)
    let pick: { m: number; k: number } | null = null
    for (const o of options[i]!) {
      if ((o.m & mask) !== o.m || o.k > k) continue
      const s = o.score + best(mask & ~o.m, k - o.k)
      if (s > score) [score, pick] = [s, o]
    }
    memo.set(key, { score, pick })
    return score
  }
  const full = (1 << real.length) - 1
  const score = best(full, jokers.length)
  const melds: Card[][] = []
  const dead: Card[] = []
  let [mask, k] = [full, jokers.length]
  while (mask) {
    const i = lowBit(mask)
    const pick = memo.get(mask * 8 + k)!.pick
    if (!pick) {
      dead.push(real[i]!)
      mask &= ~(1 << i)
      continue
    }
    melds.push([...real.filter((_, j) => (pick.m >> j) & 1), ...jokers.slice(jokers.length - k, jokers.length - k + pick.k)])
    mask &= ~pick.m
    k -= pick.k
  }
  dead.push(...jokers.slice(jokers.length - k))
  return { melds, dead, score }
}

const without = (hand: ReadonlyArray<Card>, cards: ReadonlyArray<Card>) => hand.filter((c) => !cards.includes(c))

/** Closing: everything but `card` melds. */
export const canClose = (hand: ReadonlyArray<Card>, card: Card): boolean => hand.includes(card) && arrange(without(hand, [card])).dead.length === 0

/** Hand cards that meld with the discard at depth i (2+ of them), keeping at least one card to discard. */
export const takes = (hand: ReadonlyArray<Card>, pile: ReadonlyArray<Card>, i: number): Card[][] => {
  const card = pile[pile.length - 1 - i]
  if (card === undefined || i >= DIG) return []
  const out: Card[][] = []
  for (let m = 1; m < 1 << hand.length; m++) {
    const cards = hand.filter((_, j) => (m >> j) & 1)
    if (cards.length >= 2 && hand.length - cards.length + i >= 1 && isMeld([...cards, card])) out.push(cards)
  }
  return out
}

export interface Seat {
  readonly pid: string
  readonly name: string
  hand: Card[]
  melds: Card[][] // laid face up when taking a discard
  score: number // running total; there is no game over
}

export type Phase = "waiting" | "draw" | "discard" | "done"

export interface Result {
  readonly closer: number | null // null: the stock ran out
  readonly card: Card | null // the closing card, discarded face down
  readonly rows: ReadonlyArray<{ readonly table: Card[][]; readonly melds: Card[][]; readonly dead: Card[]; readonly delta: number }>
}

export interface Game {
  seats: Seat[]
  phase: Phase
  dealer: number
  turn: number
  moves: number // counts turns, keys the clock
  stock: Card[]
  pile: Card[] // top = last
  drawn: Card | null // the card the player on turn just drew
  hand: number
  result: Result | null
}

export type Action =
  | { readonly t: "sit"; readonly name: string }
  | { readonly t: "bot" }
  | { readonly t: "deal" }
  | { readonly t: "draw" }
  | { readonly t: "take"; readonly i: number; readonly cards: ReadonlyArray<Card> }
  | { readonly t: "discard"; readonly card: Card }
  | { readonly t: "close"; readonly card: Card }

export interface SeatView {
  readonly name: string
  readonly avatar: string
  readonly online: boolean
  readonly cards: number
  readonly melds: ReadonlyArray<ReadonlyArray<Card>>
  readonly score: number
}

export interface View {
  readonly turnMs?: number | null
  readonly event?: "timeout"
  readonly you: number | null
  readonly phase: Phase
  readonly hand: number
  readonly turn: number
  readonly dealer: number
  readonly seats: ReadonlyArray<SeatView>
  readonly mine: ReadonlyArray<Card>
  readonly drawn: Card | null
  readonly pile: ReadonlyArray<Card>
  readonly stock: number
  readonly result: Result | null
  readonly canDeal: boolean
}

export const newGame = (): Game => ({ seats: [], phase: "waiting", dealer: -1, turn: 0, moves: 0, stock: [], pile: [], drawn: null, hand: 0, result: null })

/** Computer players get ids a real player id can't match. */
export const isBot = (pid: string): boolean => pid.startsWith("bot-")
const playing = (g: Game) => g.phase === "draw" || g.phase === "discard"

export const seatOf = (g: Game, pid: string): number | null => {
  const i = g.seats.findIndex((s) => s.pid === pid)
  return i < 0 ? null : i
}

/** Applies one player action. Returns an error string when the action is not allowed. */
export const apply = (game: Game, pid: string, action: Action, online: ReadonlySet<string>, shuffle: () => Card[]): Game | string => {
  const g = structuredClone(game)
  const me = seatOf(g, pid)
  if (action.t === "sit" || action.t === "bot") {
    if (playing(g)) return "hand in progress"
    if (g.seats.length >= MAX_SEATS) return "table full"
    if (action.t === "sit") {
      if (me !== null) return "already seated"
      g.seats.push({ pid, name: action.name, hand: [], melds: [], score: 0 })
    } else {
      if (me === null) return "not seated"
      const k = [1, 2, 3, 4].find((k) => !g.seats.some((s) => s.pid === `bot-${k}`))!
      g.seats.push({ pid: `bot-${k}`, name: `Bot ${k}`, hand: [], melds: [], score: 0 })
    }
    return g
  }
  if (me === null) return "not seated"
  if (action.t === "deal") {
    if (playing(g)) return "hand in progress"
    return deal(g, online, shuffle())
  }
  if (!playing(g) || g.turn !== me) return "not your turn"
  return move(g, action)
}

// ponytail: offline players are dropped at the next deal and their score goes with them.
const deal = (g: Game, online: ReadonlySet<string>, deck: Card[]): Game | string => {
  const prev = g.seats[g.dealer]?.pid
  const seats = g.seats.filter((s) => online.has(s.pid))
  if (seats.length < 2) return "need two players"
  g.seats = seats
  // The lowest total deals and starts; a tie goes to the first one clockwise after the last dealer.
  const n = seats.length
  const from = seats.findIndex((s) => s.pid === prev)
  const low = Math.min(...seats.map((s) => s.score))
  g.dealer = [...Array(n).keys()].map((k) => (from + 1 + k + n) % n).find((i) => seats[i]!.score === low)!
  for (const s of seats) Object.assign(s, { hand: [], melds: [] })
  for (let k = 0; k < HAND_SIZE; k++) for (let j = 1; j <= n; j++) seats[(g.dealer + j) % n]!.hand.push(deck.pop()!)
  Object.assign(g, { stock: deck, pile: [], drawn: null, result: null, phase: "draw", turn: g.dealer, hand: g.hand + 1, moves: g.moves + 1 })
  return g
}

/** A turn action by the player on turn (already checked). */
const move = (g: Game, action: Action): Game | string => {
  const seat = g.seats[g.turn]!
  switch (action.t) {
    case "draw":
      if (g.phase !== "draw") return "already drew"
      if (!g.stock.length) return finish(g, null, null)
      g.drawn = g.stock.pop()!
      seat.hand.push(g.drawn)
      g.phase = "discard"
      return g
    case "take": {
      if (g.phase !== "draw") return "already drew"
      if (new Set(action.cards).size !== action.cards.length || !action.cards.every((c) => seat.hand.includes(c))) return "not in hand"
      const at = g.pile.length - 1 - action.i
      if (action.i < 0 || action.i >= DIG || at < 0) return "too deep"
      if (action.cards.length < 2 || !isMeld([...action.cards, g.pile[at]!])) return "no meld"
      if (seat.hand.length - action.cards.length + action.i < 1) return "keep a card"
      seat.melds.push([...action.cards, g.pile[at]!])
      seat.hand = [...without(seat.hand, action.cards), ...g.pile.slice(at + 1)]
      g.pile = g.pile.slice(0, at)
      g.drawn = null
      g.phase = "discard"
      return g
    }
    case "discard":
      if (g.phase !== "discard") return "draw first"
      if (!seat.hand.includes(action.card)) return "not in hand"
      seat.hand = without(seat.hand, [action.card])
      g.pile.push(action.card)
      return next(g)
    case "close":
      if (g.phase !== "discard") return "draw first"
      if (!canClose(seat.hand, action.card)) return "cannot close"
      seat.hand = without(seat.hand, [action.card])
      return finish(g, g.turn, action.card)
  }
  return "bad action"
}

const next = (g: Game): Game => {
  g.turn = (g.turn + 1) % g.seats.length
  g.phase = "draw"
  g.drawn = null
  g.moves++
  // Nothing to draw and nothing to take: the hand is over, nobody closed.
  const hand = g.seats[g.turn]!.hand
  if (!g.stock.length && ![...Array(DIG).keys()].some((i) => takes(hand, g.pile, i).length)) return finish(g, null, null)
  return g
}

/** Table melds count +, the hand is arranged at its best (dead cards -), the closer adds 10x the closing card. */
const finish = (g: Game, closer: number | null, card: Card | null): Game => {
  const rows = g.seats.map((s, i) => {
    const { melds, dead, score } = arrange(s.hand)
    const delta = s.melds.reduce((sum, m) => sum + meldValue(m), 0) + score + (i === closer ? 10 * value(card!) : 0)
    s.score += delta
    return { table: s.melds, melds, dead, delta }
  })
  g.result = { closer, card, rows }
  g.phase = "done"
  g.drawn = null
  return g
}

/** Best score a hand can keep after throwing one card away. */
const keep = (hand: ReadonlyArray<Card>): number =>
  Math.max(...hand.map((c) => {
    const a = arrange(without(hand, [c]))
    return a.dead.length ? a.score : 1000
  }))

// ponytail: greedy one-turn lookahead; no memory of what others pick up or throw.
/** The computer (or an absent player's stand-in) plays out the turn: draw or take, then discard or close. */
export const botAct = (game: Game): Game => {
  const g = step(game)
  return g.phase === "discard" ? step(g) : g
}

const step = (game: Game): Game => {
  if (!playing(game)) return game
  const g = structuredClone(game)
  const hand = g.seats[g.turn]!.hand
  if (g.phase === "draw") {
    let pick: Action = { t: "draw" }
    let bar = hand.length ? keep(hand) : -Infinity
    for (let i = 0; i < Math.min(DIG, g.pile.length); i++) {
      const above = g.pile.slice(g.pile.length - i)
      for (const cards of takes(hand, g.pile, i)) {
        const score = meldValue([...cards, g.pile[g.pile.length - 1 - i]!]) + keep([...without(hand, cards), ...above])
        if (score > bar) [bar, pick] = [score, { t: "take", i, cards }]
      }
    }
    const r = move(g, pick)
    return typeof r === "string" ? (move(g, { t: "draw" }) as Game) : r
  }
  const close = hand.filter((c) => canClose(hand, c)).sort((a, b) => value(b) - value(a))[0]
  if (close) return move(g, { t: "close", card: close }) as Game
  const scored = hand.map((c) => ({ c, s: arrange(without(hand, [c])).score }))
  const worst = scored.reduce((a, b) => (b.s > a.s || (b.s === a.s && value(b.c) > value(a.c)) ? b : a))
  return move(g, { t: "discard", card: worst.c }) as Game
}

/** Plays for absent players so the table never stalls. */
export const settle = (game: Game, online: ReadonlySet<string>): Game => {
  let g = game
  while (playing(g) && !online.has(g.seats[g.turn]!.pid)) g = botAct(g)
  return g
}

/** Identifies the current turn; a new key restarts the clock. */
export const turnKey = (g: Game): string | null => (playing(g) ? `${g.hand}|${g.moves}` : null)

export const view = (g: Game, pid: string, online: ReadonlySet<string>): View => {
  const you = seatOf(g, pid)
  return {
    you,
    phase: g.phase,
    hand: g.hand,
    turn: g.turn,
    dealer: g.dealer,
    seats: g.seats.map((s) => ({ name: s.name, avatar: avatarOf(s.pid), online: online.has(s.pid), cards: s.hand.length, melds: s.melds, score: s.score })),
    mine: you === null ? [] : g.seats[you]!.hand,
    drawn: you !== null && g.turn === you ? g.drawn : null,
    pile: g.pile,
    stock: g.stock.length,
    result: g.result,
    canDeal: you !== null && !playing(g) && g.seats.filter((s) => online.has(s.pid)).length >= 2
  }
}

const CARD = /^(?:[A2-9TJQK]|X)[shdc]$/
const isCard = (c: unknown): c is Card => typeof c === "string" && CARD.test(c)

export const parseAction = (raw: unknown): Action | null => {
  if (typeof raw !== "string" || raw.length > 256) return null
  try {
    const m = JSON.parse(raw) as { t?: unknown; name?: unknown; i?: unknown; cards?: unknown; card?: unknown }
    switch (m?.t) {
      case "bot": case "deal": case "draw":
        return { t: m.t }
      case "discard": case "close":
        return isCard(m.card) ? { t: m.t, card: m.card } : null
      case "take":
        return Number.isInteger(m.i) && Array.isArray(m.cards) && m.cards.length <= 20 && m.cards.every(isCard) ? { t: "take", i: m.i as number, cards: m.cards } : null
      case "sit": {
        const name = cleanName(m.name)
        return name ? { t: "sit", name } : null
      }
    }
  } catch {}
  return null
}
