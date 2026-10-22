import { expect, test } from "bun:test"
import { apply, arrange, botAct, canClose, fullDeck, isMeld, newGame, parseAction, settle, takes, type Action, type Card, type Game } from "./logic.ts"

const ok = (r: Game | string): Game => {
  if (typeof r === "string") throw new Error(r)
  return r
}
const cards = (s: string) => s.split(" ")

// Deck whose pops come out in `order` (deal goes round the table one card at a time), the rest after.
const rigged = (...order: Card[]) => () => [...fullDeck().filter((c) => !order.includes(c)), ...[...order].reverse()]

const table = (players: string[]) => {
  const online = new Set(players)
  let g = newGame()
  for (const p of players) g = ok(apply(g, p, { t: "sit", name: p }, online, () => []))
  return g
}
const run = (g: Game, steps: Array<[string, Action]>, deck = rigged()) =>
  steps.reduce((acc, [pid, a]) => ok(apply(acc, pid, a, new Set(acc.seats.map((s) => s.pid)), deck)), g)

test("melds: sets, runs inside 2..10 or J-Q-K, aces only with aces, jokers wild", () => {
  const yes = ["5s 5h 5d", "As Ah Ad Ac", "2h 3h 4h", "2c 3c 4c 5c 6c 7c 8c 9c Tc", "Jd Qd Kd", "5h Xs 7h", "As Ah Xd", "Jc Qc Xh", "Xs Xh 5h", "Xs Xh Xd 5h", "5h Xs Xh Xd Xc"]
  const no = ["5s 5h", "9h Th Jh", "Th Jh Qh", "Qh Kh Ah", "Ah 2h 3h", "Kh Ah 2h", "Jh Qh Kh Xs", "Xs Xh Xd", "2h 3h 5h", "2h 3s 4h", "5s 5h 5d 5c Xs", "As Ah Ac Ad Xs"]
  for (const m of yes) expect([m, isMeld(cards(m))]).toEqual([m, true])
  for (const m of no) expect([m, isMeld(cards(m))]).toEqual([m, false])
})

test("arrange finds the best split: melds +, dead cards -", () => {
  expect(arrange(cards("5s 5h 5d 7c")).score).toBe(15 - 5)
  expect(arrange(cards("As Ah Ad Kc Kd")).score).toBe(45 - 20)
  // 4h 5h 6h + 6s 6d? only one 6: run 4-5-6 (15) beats set 6-6-6 needing the 6h when 4h 5h would die.
  expect(arrange(cards("4h 5h 6h 6s 6d")).score).toBe(15 - 10)
  const r = arrange(cards("2h 3h Xs 9c"))
  expect([r.melds.length, r.dead, r.score]).toEqual([1, ["9c"], 15 - 5])
  expect(arrange(cards("Xs Kd")).score).toBe(-25) // dead joker costs 15
})

test("close: every card but the closing one melds", () => {
  const hand = cards("5s 5h 5d 2c 3c 4c Kd Xh")
  expect(canClose(hand, "Kd")).toBe(true)
  expect(canClose(hand, "5s")).toBe(false)
})

test("deal 7 each, dealer starts; draw, discard, turn passes", () => {
  let g = run(table(["a", "b", "c", "d"]), [["a", { t: "deal" }]])
  expect(g.seats.map((s) => s.hand.length)).toEqual([7, 7, 7, 7])
  expect([g.stock.length, g.turn, g.phase]).toEqual([56 - 28, 0, "draw"])
  expect(apply(g, "b", { t: "draw" }, new Set(["a", "b", "c", "d"]), rigged())).toBe("not your turn")
  g = run(g, [["a", { t: "draw" }]])
  expect([g.seats[0]!.hand.length, g.phase]).toEqual([8, "discard"])
  g = run(g, [["a", { t: "discard", card: g.seats[0]!.hand[0]! }]])
  expect([g.seats[0]!.hand.length, g.pile.length, g.turn, g.phase]).toEqual([7, 1, 1, "draw"])
})

test("take from up to 7 deep: meld goes on the table, cards above come into the hand", () => {
  let g = run(table(["a", "b"]), [["a", { t: "deal" }]])
  g.seats[1]!.hand = cards("9s 9h 2c 3d 4s 6h 7d")
  g.pile = cards("9d Kc Qc Jh 2s 3s 4d Ac") // top = Ac; 9d is 7 deep, Kc 6 deep
  g.turn = 1
  g.phase = "draw"
  const online = new Set(["a", "b"])
  expect(apply(g, "b", { t: "take", i: 7, cards: ["9s", "9h"] }, online, rigged())).toBe("too deep")
  expect(apply(g, "b", { t: "take", i: 0, cards: ["9s", "9h"] }, online, rigged())).toBe("no meld")
  expect(apply(g, "b", { t: "take", i: 6, cards: ["9s"] }, online, rigged())).toBe("no meld")
  expect(takes(g.seats[1]!.hand, g.pile, 6)).toEqual([])
  g.pile = cards("Kc 9d Qc Jh 2s 3s 4d Ac") // 9d now 6 deep
  g = ok(apply(g, "b", { t: "take", i: 6, cards: ["9s", "9h"] }, online, rigged()))
  expect(g.seats[1]!.melds).toEqual([cards("9s 9h 9d")])
  expect(g.seats[1]!.hand).toEqual(cards("2c 3d 4s 6h 7d Qc Jh 2s 3s 4d Ac"))
  expect([g.pile, g.phase]).toEqual([["Kc"], "discard"])
})

test("closing scores table melds, best hand split and 10x the closing card", () => {
  let g = run(table(["a", "b"]), [["a", { t: "deal" }]])
  g.seats[0]!.hand = cards("5s 5h 5d 2c 3c 4c Xh Ac")
  g.seats[0]!.melds = [cards("Jh Qh Kh")]
  g.seats[1]!.hand = cards("7s 7h 7d 9c Xs")
  g.phase = "discard"
  expect(apply(g, "a", { t: "close", card: "5s" }, new Set(["a", "b"]), rigged())).toBe("cannot close")
  g = run(g, [["a", { t: "close", card: "Ac" }]])
  expect(g.phase).toBe("done")
  // a: J-Q-K 30 on the table, 35 in hand (the joker joins a meld), closing ace 10 x 15.
  // b: 7-7-7-joker 20, 9c dead -5.
  expect(g.result!.rows.map((r) => r.delta)).toEqual([30 + 35 + 150, 20 - 5])
  expect(g.seats.map((s) => s.score)).toEqual([215, 15])
  // Next hand: lowest total deals.
  expect(run(g, [["a", { t: "deal" }]]).dealer).toBe(1)
})

test("empty stock: the hand ends when the next player can't take, or chooses to draw", () => {
  let g = run(table(["a", "b"]), [["a", { t: "deal" }]])
  Object.assign(g, { stock: [], pile: [], phase: "discard" })
  g.seats[0]!.hand = cards("2s 9h")
  g.seats[1]!.hand = cards("Kd 5c")
  const ended = run(g, [["a", { t: "discard", card: "2s" }]])
  expect([ended.phase, ended.result!.closer]).toEqual(["done", null])
  g.seats[1]!.hand = cards("2h 2d 5c")
  g = run(g, [["a", { t: "discard", card: "2s" }]])
  expect([g.phase, g.turn]).toEqual(["draw", 1]) // b could take the 2s
  g = run(g, [["b", { t: "draw" }]])
  expect([g.phase, g.result!.closer]).toEqual(["done", null])
})

test("parseAction sanitizes", () => {
  expect(parseAction('{"t":"take","i":2,"cards":["5s","Xh"]}')).toEqual({ t: "take", i: 2, cards: ["5s", "Xh"] })
  expect(parseAction('{"t":"take","i":1.5,"cards":["5s"]}')).toBeNull()
  expect(parseAction('{"t":"discard","card":"1s"}')).toBeNull()
  expect(parseAction('{"t":"sit","name":"  Ani  "}')).toEqual({ t: "sit", name: "Ani" })
})

test("fuzz: bots play whole hands, cards are conserved, every hand ends", () => {
  let seed = 11
  const rand = (n: number) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n)
  const shuffle = () => {
    const d = fullDeck()
    for (let i = d.length - 1; i > 0; i--) {
      const j = rand(i + 1)
      ;[d[i], d[j]] = [d[j]!, d[i]!]
    }
    return d
  }
  for (let game = 0; game < 30; game++) {
    const players = ["a", "b", "c", "d"].slice(0, 2 + rand(3))
    const online = new Set(players)
    let g = table(players)
    for (let hand = 0; hand < 3; hand++) {
      g = ok(apply(g, "a", { t: "deal" }, online, shuffle))
      for (let steps = 0; g.phase !== "done"; steps++) {
        expect(steps).toBeLessThan(500)
        g = botAct(g)
        const count = g.stock.length + g.pile.length + g.seats.reduce((n, s) => n + s.hand.length + s.melds.flat().length, 0) + (g.result?.card ? 1 : 0)
        expect(count).toBe(56)
      }
    }
  }
})

test("absent players are played for", () => {
  const g = run(table(["a", "b"]), [["a", { t: "deal" }]])
  const s = settle(g, new Set(["b"]))
  expect(s.turn).toBe(1)
})
