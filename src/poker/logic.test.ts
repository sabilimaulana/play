import { expect, test } from "bun:test"
import { evaluate, fullDeck, handName, type Card } from "./hand.ts"
import { apply, autoAct, botAct, equity, IDLE_KICK, VOTE_MS, newTable, parseAction, settle, tidy, timeout, turnKey, view, type Action, type Table } from "./logic.ts"

// Deck whose draws (pop) come out in `order`: hole cards seat by seat, then flop, turn, river.
const rigged = (...order: Card[]) => () => [...fullDeck().filter((c) => !order.includes(c)), ...[...order].reverse()]

const ok = (r: Table | string): Table => {
  if (typeof r === "string") throw new Error(r)
  return r
}

const table = (players: string[], online = new Set(players)) => {
  let t = newTable()
  for (const p of players) t = ok(apply(t, p, { t: "sit", name: p }, online, () => []))
  return t
}

const run = (t: Table, steps: Array<[string, Action]>, deck = rigged(), online = new Set(t.seats.map((s) => s.pid))) =>
  steps.reduce((acc, [pid, a]) => ok(apply(acc, pid, a, online, deck)), t)

const chips = (t: Table) => t.seats.map((s) => s.chips)

test("evaluator ranks hands", () => {
  const e = (s: string) => evaluate(s.split(" "))
  expect(e("As Ks Qs Js Ts 2d 3c").name).toBe("Straight Flush")
  expect(e("Ah Ad Ac As Kd 2c 3c").name).toBe("Four of a Kind")
  expect(e("Kh Kd Kc 4s 4d 2c 9c").name).toBe("Full House")
  expect(e("Ah 2d 3c 4s 5d 9c Jh").name).toBe("Straight")
  expect(e("Ah 2d 3c 4s 5d 9c Jh").score).toBeLessThan(e("6h 2d 3c 4s 5d 9c Jh").score)
  expect(e("Ah Ad 9c 9s 4d 2c 3h").score).toBeGreaterThan(e("Kh Kd Qc Qs 4d 2c 3h").score)
  expect(e("Ah Ad 9c 8s 4d 2c 3h").score).toBeGreaterThan(e("Ah Ad 9c 7s 4d 2c 3h").score)
})

test("heads-up: button posts small blind, acts first preflop, last after", () => {
  let t = run(table(["a", "b"]), [["a", { t: "deal" }]])
  expect([t.button, t.toAct, t.seats[0]!.bet, t.seats[1]!.bet]).toEqual([0, 0, 10, 20])
  expect(apply(t, "b", { t: "check" }, new Set(["a", "b"]), rigged())).toBe("not your turn")
  t = run(t, [["a", { t: "call" }], ["b", { t: "check" }]])
  expect([t.stage, t.toAct, t.board.length]).toEqual(["flop", 1, 3])
})

test("fold takes the pot uncontested, cards stay hidden", () => {
  const t = run(table(["a", "b"]), [["a", { t: "deal" }], ["a", { t: "raise", to: 60 }], ["b", { t: "fold" }]])
  expect(t.stage).toBe("done")
  expect(chips(t)).toEqual([1020, 980])
  expect(view(t, "b", new Set(["a", "b"])).seats[0]!.cards).toEqual([null, null])
})

test("min raise is enforced, all-in is always allowed", () => {
  const t = run(table(["a", "b"]), [["a", { t: "deal" }]])
  expect(apply(t, "a", { t: "raise", to: 30 }, new Set(["a", "b"]), rigged())).toBe("raise too small")
  const all = run(t, [["a", { t: "raise", to: 1000 }], ["b", { t: "call" }]])
  expect(all.stage).toBe("done") // runs the board out
  expect(all.board.length).toBe(5)
  expect(chips(all).reduce((x, y) => x + y)).toBe(2000)
})

test("side pots: short all-in wins main, best of the rest wins side", () => {
  let t = table(["a", "b", "c"])
  t.seats[2]!.chips = 100
  // a: KK, b: 72o, c: AA. Board blanks.
  const deck = rigged("Kh", "Kd", "7c", "2d", "Ah", "Ad", "3s", "8s", "9h", "Jd", "4c")
  t = run(t, [
    ["a", { t: "deal" }], // button a(0), sb b(1), bb c(2), a first
    ["a", { t: "raise", to: 1000 }],
    ["b", { t: "call" }],
    ["c", { t: "call" }]
  ], deck)
  expect(t.stage).toBe("done")
  expect(t.pots.map((p) => [p.amount, p.winners])).toEqual([[300, [2]], [1800, [0]]])
  expect(chips(t)).toEqual([1800, 0, 300])
})

test("split pot on the board, odd chip left of button", () => {
  let t = table(["a", "b", "c"])
  const deck = rigged("2c", "3d", "2d", "3c", "4h", "4d", "As", "Ks", "Qs", "Js", "Ts")
  t = run(t, [
    ["a", { t: "deal" }],
    ["a", { t: "call" }], ["b", { t: "call" }], ["c", { t: "check" }],
    ["b", { t: "check" }], ["c", { t: "check" }], ["a", { t: "check" }],
    ["b", { t: "check" }], ["c", { t: "check" }], ["a", { t: "check" }],
    ["b", { t: "check" }], ["c", { t: "check" }], ["a", { t: "check" }]
  ], deck)
  expect(t.pots[0]!.winners.length).toBe(3)
  expect(chips(t)).toEqual([1000, 1000, 1000])
})

test("offline player is auto-checked or folded", () => {
  let t = run(table(["a", "b"]), [["a", { t: "deal" }]])
  t = settle(t, new Set(["b"])) // a (to act, facing the BB) is gone
  expect(t.stage).toBe("done")
  expect(chips(t)).toEqual([990, 1010])
  expect(apply(t, "b", { t: "deal" }, new Set(["b"]), rigged())).toBe("showing the result")
  expect(apply(tidy(t), "b", { t: "deal" }, new Set(["b"]), rigged())).toBe("need two players")
})

test("parseAction sanitizes", () => {
  expect(parseAction('{"t":"sit","name":"  Bob\\u0000  the   great builder "}')).toEqual({ t: "sit", name: "Bob the great" })
  expect(parseAction('{"t":"raise","to":"x"}')).toBeNull()
  expect(parseAction('{"t":"sit","name":"   "}')).toBeNull()
  expect(parseAction('{"t":"emote","e":"🔥"}')).toEqual({ t: "emote", e: "🔥" })
  expect(apply(table(["a"]), "a", { t: "emote", e: "<b>" }, new Set(["a"]), () => [])).toBe("bad emote")
})

test("fuzz: random play conserves chips and never stalls", () => {
  let seed = 7
  const rand = (n: number) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n)
  const shuffle = () => {
    const d = fullDeck()
    for (let i = d.length - 1; i > 0; i--) {
      const j = rand(i + 1)
      ;[d[i], d[j]] = [d[j]!, d[i]!]
    }
    return d
  }
  for (let game = 0; game < 200; game++) {
    const players = ["a", "b", "c", "d", "e", "f"].slice(0, 2 + rand(5))
    const online = new Set(players)
    let t = table(players)
    t.seats.forEach((s) => (s.chips = 20 + rand(400)))
    const total = t.seats.reduce((x, s) => x + s.chips, 0)
    for (let hand = 0; hand < 30; hand++) {
      t = tidy(t)
      if (t.seats.length < 2) break
      const dealt = apply(t, t.seats[0]!.pid, { t: "deal" }, online, shuffle)
      if (typeof dealt === "string") break
      t = dealt
      for (let step = 0; t.stage !== "done"; step++) {
        expect(step).toBeLessThan(200)
        const s = t.seats[t.toAct!]!
        const v = view(t, s.pid, online).options!
        const pick = rand(4)
        const a: Action =
          pick === 0 ? { t: "fold" }
          : pick === 1 ? { t: v.call > 0 ? "call" : "check" }
          : pick === 2 && v.maxRaiseTo > t.currentBet ? { t: "raise", to: v.minRaiseTo + rand(v.maxRaiseTo - v.minRaiseTo + 1) }
          : { t: v.call > 0 ? "call" : "check" }
        t = ok(apply(t, s.pid, a, online, shuffle))
      }
      expect(t.seats.reduce((x, s) => x + s.chips, 0)).toBe(total)
      expect(t.seats.every((s) => s.chips >= 0)).toBe(true)
    }
  }
})

test("autoAct checks when free, folds when facing a bet; turnKey changes per decision", () => {
  const online = new Set(["a", "b"])
  let t = run(table(["a", "b"]), [["a", { t: "deal" }]])
  const k1 = turnKey(t)
  t = autoAct(t, online) // a faces the big blind -> folds
  expect(t.stage).toBe("done")
  expect(turnKey(t)).toBe("1|done") // the result stays up on the clock
  t = run(table(["a", "b"]), [["a", { t: "deal" }], ["a", { t: "call" }]])
  expect(turnKey(t)).not.toBe(k1)
  t = autoAct(t, online) // b can check
  expect(t.stage).toBe("flop")
})

test("bots: seat, equity sanity, always a legal action, rebuy when busted", () => {
  const online = new Set(["p1", "bot-1"])
  let t = apply(apply(newTable(), "p1", { t: "sit", name: "Ana" }, online, () => []) as Table, "p1", { t: "bot" }, online, () => []) as Table
  expect(t.seats[1]!.name).toBe("Bot 1")
  expect(equity(["As", "Ah"], [], 1, Math.random)).toBeGreaterThan(0.75)
  expect(equity(["7c", "2d"], [], 1, Math.random)).toBeLessThan(0.45)
  t = apply(t, "p1", { t: "deal" }, online, fullDeck) as Table
  for (let k = 0; k < 20 && t.stage !== "done"; k++)
    t = t.seats[t.toAct!]!.pid === "p1" ? autoAct(t, online) : botAct(t, online, Math.random)
  expect(t.stage).toBe("done")
  t.seats[1]!.chips = 0
  expect(tidy(t).seats[1]!.chips).toBe(1000)
})

test("tidy: busted players leave, the button moves on to the right seat", () => {
  let t = table(["a", "b", "c"])
  t = run(t, [["a", { t: "deal" }], ["a", { t: "fold" }], ["b", { t: "fold" }]]) // button a, c wins the blinds
  t.seats[1]!.chips = 0 // b busted
  t = tidy(t)
  expect([t.stage, t.seats.map((s) => s.pid), t.board, t.pots]).toEqual(["waiting", ["a", "c"], [], []])
  t = run(t, [["a", { t: "deal" }]])
  expect(t.seats[t.button]!.pid).toBe("c") // would have been b
})

test("three timeouts in a row: auto-played from then on, removed after the hand", () => {
  const online = new Set(["a", "b"])
  let t = table(["a", "b"])
  for (let hand = 0; (t.seats[0]!.idle ?? 0) < IDLE_KICK; hand++) {
    expect(hand).toBeLessThan(10)
    t = run(tidy(t), [["a", { t: "deal" }]])
    expect(t.seats).toHaveLength(2) // still seated while under the limit
    while (t.stage !== "done") t = t.seats[t.toAct!]!.pid === "b" ? run(t, [["b", { t: t.seats[1]!.bet < t.currentBet ? "call" : "check" }]]) : timeout(t, online)
  }
  expect(tidy(t).seats.map((s) => s.pid)).toEqual(["b"])
  // A real move resets the count.
  t = run(table(["a", "b"]), [["a", { t: "deal" }]])
  t = timeout(t, online)
  t = tidy(t)
  t = run(t, [["a", { t: "deal" }]])
  const who = t.seats[t.toAct!]!.pid
  t = run(t, [[who, { t: "call" }]])
  expect(t.seats.find((s) => s.pid === who)!.idle).toBe(0)
})

test("handName names a partial hand", () => {
  expect(handName(["As", "Ad"])).toBe("Pair")
  expect(handName(["As", "Kd"])).toBe("High Card")
  expect(handName(["As", "Ks", "Qs", "Js", "Ts"])).toBe("Straight Flush")
  expect(handName(["2c", "3d", "4h", "5s", "9c", "Ad"])).toBe("Straight")
})

test("vote kick: majority frees the seat, half no fails, votes expire", () => {
  const online = new Set(["a", "b", "c", "d"])
  const at = (t: Table, pid: string, a: Action, now = 0) => ok(apply(t, pid, a, online, rigged(), now))
  let t = table(["a", "b", "c", "d"])
  expect(apply(t, "a", { t: "kick", seat: 0 }, online, rigged(), 0)).toBe("bad target")
  t = at(t, "a", { t: "kick", seat: 3 }) // voters a, b, c: need 2
  expect(view(t, "d", online, 0).vote).toMatchObject({ target: 3, yes: 1, need: 2, canVote: false })
  expect(apply(t, "d", { t: "vote", yes: false }, online, rigged(), 0)).toBe("cannot vote")
  expect(apply(t, "b", { t: "kick", seat: 2 }, online, rigged(), 0)).toBe("vote in progress")
  expect(apply(t, "b", { t: "vote", yes: true }, online, rigged(), VOTE_MS)).toBe("no vote") // expired
  t = at(t, "b", { t: "vote", yes: true }) // passes; table is waiting, so d leaves now
  expect([t.seats.map((s) => s.pid), t.vote]).toEqual([["a", "b", "c"], null])
  expect(at(t, "d", { t: "sit", name: "d" }).seats).toHaveLength(4) // seat freed, not banned

  // Mid-hand: the target is auto-played and leaves when the hand is tidied.
  t = run(table(["a", "b", "c"]), [["a", { t: "deal" }]])
  t = at(t, "b", { t: "kick", seat: 0 }) // voters b, c: need 2
  t = at(t, "c", { t: "vote", yes: false }) // 1 of 2 no: fails
  expect(t.vote).toBeNull()
  t = at(at(t, "b", { t: "kick", seat: 0 }), "c", { t: "vote", yes: true })
  t = settle(t, online) // a was to act: folded for them
  expect(t.seats[0]!.folded).toBe(true)
  while (t.stage !== "done") t = autoAct(t, online)
  t = tidy(t)
  expect(t.seats.map((s) => s.pid)).toEqual(["b", "c"])
  // Same device (pid) sits again: chips come back.
  const left = t.stacks!["a"]!
  expect(left).toBeGreaterThan(0)
  t = at(t, "a", { t: "sit", name: "Ann" })
  expect([t.seats[2]!.chips, t.stacks!["a"]]).toEqual([left, undefined])
})

test("rounds: newest first, nets sum to zero, folded and mucked cards stay private", () => {
  const online = new Set(["a", "b"])
  let t = run(table(["a", "b"]), [["a", { t: "deal" }], ["a", { t: "raise", to: 60 }], ["b", { t: "fold" }]])
  t = run(tidy(t), [["a", { t: "deal" }], ["b", { t: "raise", to: 980 }], ["a", { t: "call" }]])
  const [last, first] = view(t, "a", online).rounds
  expect([last!.hand, first!.hand]).toEqual([2, 1])
  expect(first!.players.map((p) => [p.net, p.chips, p.folded])).toEqual([[20, 1020, false], [-20, 980, true]])
  expect(first!.pots).toEqual([{ amount: 80, winners: [0], hand: "" }])
  // Uncontested: your own cards face up, the folder's gone; b sees a's face down.
  expect(first!.players.map((p) => p.cards.length)).toEqual([2, 0])
  expect(view(t, "b", online).rounds[1]!.players[0]!.cards).toEqual([null, null])
  // Showdown: both shown, nets balance, button recorded.
  expect(last!.players.every((p) => p.cards.every(Boolean) && p.hand)).toBe(true)
  expect(last!.players.reduce((sum, p) => sum + p.net, 0)).toBe(0)
  expect([last!.board.length, last!.button, first!.button]).toEqual([5, 1, 0])
})
