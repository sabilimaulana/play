// 7-card hand evaluation: best 5 of 7, scored as one comparable number.

export type Card = string // rank + suit, e.g. "As", "Td", "2c"

export const RANKS = "23456789TJQKA"
export const SUITS = "shdc"
export const NAMES = [
  "High Card", "Pair", "Two Pair", "Three of a Kind", "Straight",
  "Flush", "Full House", "Four of a Kind", "Straight Flush"
] as const

export const fullDeck = (): Card[] => [...RANKS].flatMap((r) => [...SUITS].map((s) => r + s))

const score5 = (cards: ReadonlyArray<Card>): number => {
  const ranks = cards.map((c) => RANKS.indexOf(c[0]!)).sort((a, b) => b - a)
  const flush = cards.every((c) => c[1] === cards[0]![1])
  const unique = [...new Set(ranks)]
  const wheel = unique.join() === "12,3,2,1,0"
  const straight = unique.length === 5 && (ranks[0]! - ranks[4]! === 4 || wheel)
  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  // Ranks ordered by group size, then rank: [K,K,K,4,4] -> [K,4]
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const shape = groups.map((g) => g[1]).join("")

  const category =
    straight && flush ? 8
    : shape === "41" ? 7
    : shape === "32" ? 6
    : flush ? 5
    : straight ? 4
    : shape === "311" ? 3
    : shape === "221" ? 2
    : shape === "2111" ? 1
    : 0
  const kickers = straight ? [wheel ? 3 : ranks[0]!] : groups.map((g) => g[0])
  return kickers.reduce((acc, r, i) => acc + r * 13 ** (4 - i), category * 13 ** 5)
}

/** Best 5-of-7 score and its name. */
export const evaluate = (seven: ReadonlyArray<Card>): { readonly score: number; readonly name: string } => {
  let best = 0
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) best = Math.max(best, score5(seven.filter((_, i) => i !== a && i !== b)))
  return { score: best, name: NAMES[Math.floor(best / 13 ** 5)]! }
}

/** Best hand name in 2-7 cards (your hand so far); under five cards only a pair counts. */
export const handName = (cards: ReadonlyArray<Card>): string => {
  if (cards.length < 5) return new Set(cards.map((c) => c[0])).size < cards.length ? "Pair" : "High Card"
  const best = (cs: ReadonlyArray<Card>): number => (cs.length === 5 ? score5(cs) : Math.max(...cs.map((_, i) => best(cs.filter((_, j) => j !== i)))))
  return NAMES[Math.floor(best(cards) / 13 ** 5)]!
}
