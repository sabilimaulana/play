# Ceki (52-card / kartu remi): rules research and implementation spec

Researched 2026-10-22. Every claim carries a source tag; tags resolve in [Sources](#sources).
**[INFERRED]** marks my own reasoning or a default I chose, not something a source says.

---

## 0. TL;DR: what "ceki with kartu remi" actually is

The name covers three different things. Keep them apart:

1. **Kartu ceki, the original.** A 60-card Chinese-derived deck (30 distinct cards x2; 3 suits 1-9 plus 3 honours). It is usually played with 2-3 decks (120-180 cards) as a draw-one/discard-one game: you collect **triplets**, and when a player needs only one more card they call **"ceki!"** [W-en] [W-id] [PORG] [JAMBI]. **This is not a 52-card game.**
2. **Indonesian Remi, also called "ceki 7 kartu".** An ITB paper says outright that remi "*juga sering kali disebut ceki 7 kartu*" [ITB]. Two independent sources say that in remi, **"ceki" is the call a player makes when one card from closing** [DEWASSA] [KASKUS]. That call is the same mechanic as kartu-ceki's "ceki!" [W-en]. pagat.com documents this game as **Indonesian Remi** [PAGAT-REMI]. **This is the best-sourced 52-card "ceki".**
3. **"Ceki" as a 13-card rummy.** One Indonesian site describes a 13-card, 52-card, no-joker game. You win by melding all cards but one, discarding the last one and declaring "Ceki" [PK]. This is a single, low-trust source (see §1).

**Derivation (partly [INFERRED]).** Kartu ceki is a draw/discard triplet-collecting game with a "one card away" call [W-en]. Remi players use the same draw/discard loop on a 52-card deck: sets play the role of triplets and same-suit runs are added. They kept the word "ceki" for the one-away warning [DEWASSA] [KASKUS], and the game picked up the nickname "ceki 7 kartu" [ITB]. No source states this lineage explicitly. It is my reading of the shared mechanics and vocabulary.

pagat.com has **no** page for kartu ceki and no game named "ceki" [PAGAT-ID]. Its rummy-family Indonesian entries are *Remi* and *Joker Karo* [PAGAT-ID].

**Recommendation:** implement Indonesian Remi as pagat documents it, plus the "ceki" call/penalty from the Indonesian sources (§9).

---

## 1. Source quality

| Tag | Source | Trust | Notes |
|---|---|---|---|
| PAGAT-REMI | pagat.com, Indonesian Remi (John McLeod, info from Riza Purwo Nugroho, 2006) | **High** | Most precise rules. Doesn't use the word "ceki". |
| ITB | ITB student paper, *Strategi Greedy pada Permainan Kartu Remi* (2021) | Medium | Only source that equates remi with "ceki 7 kartu". Joker variant. |
| CATS | catsatcards.com, How to Play Indonesian Remi (2015) | Medium | Close to pagat, with a few extra details (deal procedure). Probably derived from pagat [INFERRED]. |
| NGEHACK | ngehack.blogspot.com (2008) | Medium-low | Joker/"international" rules plus a "Remi Nasional" Java variant. |
| SESAMA, KUMPARAN | blog / kumparan | Low | Wording near-identical to NGEHACK; not independent [INFERRED]. |
| IDN | IDN Times Lampung | Low | A different 7-card "win by 3+4" variant. |
| KASKUS | Kaskus forum thread (2013) | Low (forum) | Defines the "ceki" call and the -25 penalty. **Page returned HTTP 503; text known only from search-engine snippets.** |
| DEWASSA | dewassa.blogspot.com (2011) | Low | One line: in remi, "ceki" signals a player is about to finish. |
| PK | pokerkilat.com, *Panduan Main Kartu Remi Ceki* | **Low** | Gambling-community site; reads like SEO content [INFERRED]. **Domain no longer resolves; text known only from search-engine snippets.** |
| W-en, W-id, PORG, JAMBI | Wikipedia en/id, games.porg.es, Jambipos | Medium | Only about the **120-card kartu ceki**. Used here for terminology and lineage. |
| KLIK, CARI | klikmedia9, carikartu.blogspot | Very low | KLIK says ceki uses a 52-card deck but gives no rules. CARI is spam and contradicts itself. |

No first-party app rule text was found. Searches for a "Ceki" mode in Higgs Domino or other Indonesian card apps returned nothing relevant. No YouTube or TikTok tutorial transcript was found.

---

## 2. Players, deck, deal, turn order

| Item | Value | Source |
|---|---|---|
| Players | 2-4 | [PAGAT-REMI] [CATS] [NGEHACK] [PK] |
| Typical players | 4 ("di pos ronda") | [ITB] [IDN] |
| Deck | 52 cards, **no jokers** | [PAGAT-REMI] [PK] |
| Deck (joker variant) | 52 + jokers | [ITB] [NGEHACK] [KUMPARAN] |
| Cards per player | **7** | [PAGAT-REMI] [CATS] [ITB] [NGEHACK] [KUMPARAN] |
| Cards per player (13-card "ceki") | 13 | [PK] |
| Stock | Rest of the deck, face down. The discard pile starts **empty**, with no card turned up. | [PAGAT-REMI] [CATS] |
| First dealer | Any player (pagat); highest card drawn (catsatcards) | [PAGAT-REMI] [CATS] |
| Deal | Clockwise, starting left of the dealer; the player to the dealer's right cuts | [CATS] |
| Who plays first | **The dealer** | [PAGAT-REMI] [CATS] |
| ... variant | The winner of the previous deal starts | [PAGAT-REMI] ("some regions") |
| ... variant | First player random; later hands start with the current points leader | [ITB] |
| Direction | Clockwise | [PAGAT-REMI] [CATS] [ITB] |
| Later dealers | The player with the **lowest cumulative score** deals | [PAGAT-REMI] [CATS] |

---

## 3. Turn structure

pagat [PAGAT-REMI], confirmed by [CATS]:

1. **Draw.** Take the top stock card, **or** take a discard, but only if:
   - it is one of the **top three** cards of the discard pile, and
   - you hold **2+ cards** that form a valid combination with it, and you lay that combination face up at once;
   - if you took the 2nd or 3rd card, the card(s) above it go **into your hand**;
   - only **one** discard card may be used in that combination;
   - you can't take a discard to make a **set** unless you already have a sequence (in hand or on the table);
   - you must still have a card left to discard afterwards.

   The first player must draw from stock, because the pile is empty.
2. **Discard** one card face up. The pile is fanned so earlier discards stay visible [PAGAT-REMI] [CATS].

**Obligation to meld.** None, beyond exposing the combination formed with a taken discard. pagat does not describe voluntary melding from hand after a stock draw [PAGAT-REMI]. catsatcards says melding is optional during a turn [CATS].

**No laying off.** Combinations already on the table can't be extended, yours or anyone else's [PAGAT-REMI] [CATS] [ITB].

**Disagreements on taking discards:**
- Top 3 only [PAGAT-REMI] [CATS].
- Up to 7 deep, taking every card above it [ITB] [KUMPARAN].
- Only the top card [PK]. Pokerkilat: "*Pemain berikutnya boleh mengambil kartu yang baru dibuang atau kartu dari deck*".

---

## 4. Valid combinations

| Rule | pagat / catsatcards | ITB | ngehack / sesama | pokerkilat |
|---|---|---|---|---|
| Sequence ("seri") | 3+ consecutive **numerals 2-10**, same suit, **or exactly J-Q-K** same suit | 3+ consecutive, same suit; J-Q-K-A, **K-A-2 and A-2-3 allowed** | 3+ same suit 2-10, or J-Q-K | 3+ consecutive, same suit |
| 10-J adjacent? | **No** | not stated | No (implied) | not stated |
| Ace in sequence | **Never** | Low, high **and wrap** | not stated | not stated |
| Set ("set"/"sama") | 3 or 4 of a rank | 3+ of a rank | 3+ of a rank | "three cards, same number, different suits" |
| Sequence-first rule | Sets don't count until you have a sequence | not stated | First meld must be a sequence, not a set, and can't use a joker | not stated |
| Jokers | none | wild; not in first meld; can't be discarded (hand ends); -500 if left in hand; closing with a joker scores +500 | same as ITB. Java "Remi Nasional": a discarded joker covers the pile and play continues | none |

Sources: [PAGAT-REMI] [CATS] [ITB] [NGEHACK] [SESAMA] [PK].

Pairs are never a combination in the 52-card game (no source mentions them). Two-card *klorok* exists only in Minangkabau kartu ceki/koa [JAMBI].

---

## 5. Closing ("tutup", "tutup tangan", "closed card")

- After drawing (stock **or** taken discard), a player who can arrange **all cards but one** into valid combinations exposes them and discards the last card, the **closing card**. Play ends [PAGAT-REMI] [CATS] [ITB].
- You **can't** close by melding every card with nothing left to discard [PAGAT-REMI].
- The closing card is discarded **face down** [ITB].
- In a 7-card hand: draw to 8, meld 7 (3+4, or one 7-card run, or the like), discard 1 [INFERRED from the above].
- IDN describes a related win: two combinations (3+4) or a 7-card same-suit run, "*tanpa kartu sisa*" [IDN]. Treat it as a separate variant.
- Pokerkilat (13-card): "*Jika seorang pemain berhasil menyusun seluruh kartunya ke dalam kombinasi yang valid, dan menyisakan satu kartu untuk dibuang, maka ia menyatakan 'Ceki' dan menang*" [PK].

### Stock runs out

- If the stock is empty and the player to move must draw from it (they can't or won't take a discard), play **ends immediately** and everyone scores [PAGAT-REMI] [CATS].
- "*Permainan ... berakhir jika kartu yang ada di deck habis*" [KUMPARAN] [ITB].
- No source reshuffles the discard pile.

---

## 6. Scoring

### Card values

All 52-card sources agree on these values [PAGAT-REMI] [CATS] [ITB] [NGEHACK] [IDN]:

| Cards | Points |
|---|---|
| 2-10 | 5 |
| J, Q, K | 10 |
| A | 15 |

### Hand score

- Cards in valid combinations score **+**; all other cards in hand score **-** [PAGAT-REMI] [CATS] [ITB].
- Combinations still held in hand at the end count **+**. pagat's example: hand ♣3-4-5-6 + J♣ J♦ Q♣ = +20 - 30 = -10 [PAGAT-REMI]. ITB has a similar in-hand example [ITB].
- With no sequence, sets are invalid and the whole hand counts negative [PAGAT-REMI].
- pagat's example 2 states -70, but the card values give -50. That looks like a typo [INFERRED].

### Closing bonus (sources disagree)

| Version | Bonus | Source |
|---|---|---|
| A | 10 x closing-card value: 50 for 2-10, 100 for J/Q/K, 150 for A | [PAGAT-REMI] [CATS] |
| B | Flat **+250** for closing; **+500** when closing with a joker | [ITB] |
| C | +250 if you closed from the stock; if closed from a discard: A 250, JQK 100, 2-10 50; the discarder is penalised that card's value | [NGEHACK] [SESAMA] |
| D | Last stock card + win = 150; leftover JQK 100, 2-10 50 | [IDN] |

### Ceki penalty

If a player closes on the **previous** player's discard while "in ceki", that previous player scores **-25** [KASKUS].

### Multi-hand play

- The pagat page sets no target score [PAGAT-REMI].
- Many sources play hands until someone reaches **1000** [ITB] [NGEHACK] [KUMPARAN].
- Highest total after an agreed number of hands wins [CATS].
- **"Sistem gugur" / "DEATHMATCH":** a player who is overtaken by another player drops to 0. Kaskus example: A has 50; B closes and goes from 0 to 75, so A drops to 0 [KASKUS] [ITB] [NGEHACK]. Exact trigger semantics are unclear.

---

## 7. Terminology

| Term | Meaning | Source |
|---|---|---|
| **ceki** (remi) | Announcement that you are one card from closing; warns the previous player to discard carefully | [KASKUS] [DEWASSA] |
| **men-ceki** | To close on the warned previous player's discard; that player takes -25 | [KASKUS] |
| **ceki** (pokerkilat) | Declaring the win itself | [PK] |
| **ceki!** (kartu ceki) | Call made when you need only one more card | [W-en] [W-id] |
| **ceki 7 kartu** | Nickname for Indonesian remi | [ITB] |
| **seri** | Same-suit sequence / run | [ITB] [NGEHACK] |
| **set** / **sama** | Same-rank group | [ITB] [NGEHACK] |
| **kartu jadi** | Card that is part of a valid combination (scores +) | [ITB] |
| **kartu tidak jadi** | Card not in a combination (scores -) | [ITB] |
| **tutup** / **tutup tangan** / **closed card** | Going out | [ITB] [NGEHACK] [KUMPARAN] |
| **kartu tutup** / closing card | The final discard when going out | [PAGAT-REMI] [ITB] |
| **deck** / **tumpukan** | Stock | [ITB] |
| **buangan** | Discard pile | [ITB] |
| **sistem gugur** | Overtaken score resets to 0 | [KASKUS] |
| **sekop / hati / keriting / wajik** | ♠ ♥ ♣ ♦ | [ITB] |
| **tempe** | Colloquial for ♦ | [ITB] (used in its play example) |
| **kepala**, **daun ceki**, **kertu cilik** | Deck / ceki cards / "small cards" (kartu ceki only) | [PORG] |
| **mato**, **kaki**, **klorok**, **coki**, **manunggu masuak** | Minangkabau koa/ceki terms: triplet, six of a kind, pair, the melded groups, one card from winning | [JAMBI] |
| **rigat** (Balinese) | Three different ceki cards forming one group | [BASABALI] |

---

## 8. Regional variants

| Variant | Where | Gist | Source |
|---|---|---|---|
| Indonesian Remi / ceki 7 kartu | Nationwide | §2-§6 | [PAGAT-REMI] [ITB] |
| "Remi Nasional" | Java | Discarded joker covers the pile and play continues; closing with an ace = 150; unused joker penalised at the value of the card it represents; 3333+QQQQ close = 500; 7-card same-suit run close = 700 | [NGEHACK] |
| Leader-starts | "some regions" | The previous winner starts the next hand | [PAGAT-REMI] |
| 13-card ceki | not stated | Deal 13; sets/runs; meld all + discard 1 = "Ceki" | [PK] |
| Joker Karo / Leng | North Sumatra (Batak) | **Different game.** 2 decks + jokers; most cards dealt; no draw/discard | [JOKERKARO] |
| Kartu ceki / koa | West Sumatra (Minang), Java, Bali, Peranakan Malaysia/Singapore | **120/180-card deck.** Triplets; 11 cards dealt (Minang); teams of 2 | [W-en] [JAMBI] [PORG] |

Rules vary "even between RTs" ("*antar RT pun peraturan ... bisa berbeda*") [ITB].

---

## 9. Recommended implementation ruleset

**Base:** pagat Indonesian Remi [PAGAT-REMI]. It is the most precise and authoritative source, and its 7-card deal is the "ceki 7 kartu" [ITB]. The user's own table rules (**[LOCAL]**, confirmed 2026-10-22) override it wherever they differ.

Every choice below names its source. **[GAP]** marks a default I filled in.

### 9.1 Setup

- **Deck:** 52 cards + **4 jokers** = 56 [LOCAL].
  - Suits: S H C D.
  - Ranks: A, 2-10, J, Q, K.
- **Players:** 4 is the normal table [LOCAL]; 2-4 allowed [PAGAT-REMI]. No 5-6.
- **Deal:** 7 cards each [LOCAL], clockwise from dealer+1 [PAGAT-REMI] [CATS].
  - The rest is the stock (face down, ordered). 4 players → 28 cards.
  - The discard pile is empty.
- **First dealer:** random (pagat: "any player").
- **Later dealers:** the player with the lowest cumulative score [PAGAT-REMI].
  - **[GAP]** A tie for lowest goes to the tied player closest clockwise after the previous dealer.
- **First player:** the dealer [PAGAT-REMI]. Turns go clockwise.

### 9.2 Combinations (pure function `isValidMeld(cards)`)

- **Sequence (seri):** >= 3 cards, all the same suit, and either:
  - consecutive ranks entirely within **2..10** (max length 9), or
  - **exactly {J, Q, K}** [PAGAT-REMI] [LOCAL].
  - Aces never; 10-J not adjacent (9-10-J invalid); no wrap [LOCAL].
- **Set:** 3 or 4 cards of the same rank [PAGAT-REMI].
  - Aces only ever meld with other aces (A-A-A, A-A-A-A) [LOCAL].
- **No sequence-first rule.** Sets count on their own; the first meld can be a set [LOCAL]. (pagat requires a sequence first.)
- **Jokers are wild:** a joker stands for any card that makes the meld valid [LOCAL].
  - Valid iff some assignment of the jokers makes it a valid sequence or set under the rules above.
  - **[GAP]** A meld needs at least one natural card. A set is still max 4 cards including jokers.
- Anything else is invalid. Pairs are never valid.

### 9.3 Turn (state machine: `awaitingDraw -> awaitingDiscard -> next player`)

**Action `drawStock`**
- Legal if the stock is non-empty.
- Card goes to hand, then go to `awaitingDiscard`.

**Action `takeDiscard(index ∈ {0..6} from top, handCards[])`**: up to 7 deep [LOCAL] (pagat: top 3). Legal iff all of:
- the pile has a card at that index;
- `handCards.length >= 2` and `handCards ∪ {that card}` is a valid meld: the taken card must meld immediately [LOCAL] [PAGAT-REMI];
- after the move the hand has >= 1 card.

Effect:
- the meld goes to the player's table area (face up);
- the cards above the index go into the hand;
- go to `awaitingDiscard`.

Applies to any card in the top seven, including the player's own earlier discards. **[GAP]** No source forbids it.

**Action `meld(handCards[])`**: **not offered.** **[GAP]** pagat only exposes melds via discard-take or at close [PAGAT-REMI]. In-hand combinations still score at hand end (§9.6), so voluntary melding has no benefit.

**Action `discard(card)`**
- Legal in `awaitingDiscard`; the card must be in hand. Jokers may be discarded (**[GAP]**).
- Pushes the card on the pile and moves to the next player.

**Action `close(arrangement: Card[][], closingCard)`**
- Legal in `awaitingDiscard` iff:
  - hand = ⊔ arrangement + {closingCard};
  - every group is a valid meld;
  - exactly one card is left over [PAGAT-REMI].
- `closingCard` is discarded face down [ITB]. The hand ends.
- **[GAP]** The engine can compute the arrangement itself, so the client only says "close with card X".

**Empty stock** [PAGAT-REMI]
- Turn starts, stock empty, legal `takeDiscard` exists: the player may take; drawing is impossible.
- Turn starts, stock empty, no legal `takeDiscard` (or the player chooses `drawStock`): the hand ends immediately, **no closer**.
- **[GAP]** In the UI, an empty-stock `drawStock` = "end hand".

### 9.4 Invalid input

- Any illegal action is rejected with an error code and **no state change**:
  - wrong player, wrong phase, card not in hand, invalid meld, index beyond the top seven, would-empty-hand, close with ≠ 1 leftover.
- No penalties for invalid attempts. **[GAP]** In person the rule is "agreed"; digitally we just block.

### 9.5 Ceki call

**Not implemented.** The user's table has no ceki call or -25 penalty; leftover ("dead") cards are simply negative (§9.6) [LOCAL]. The name "Ceki" stays as the game's name.

### 9.6 Hand-end scoring

**Card values:** 2-10 = 5; J/Q/K = 10; A = 15 [LOCAL] [PAGAT-REMI].

**Joker values** **[GAP]**:
- in a meld: the value of the card it stands for (a joker in a 2-10 run = 5, in J-Q-K = 10, in an ace set = 15);
- dead (not in any meld): **-15**, the highest card value.

**For each player:**
- table melds: all +;
- hand: partition into valid melds to **maximise** score; dead cards (leftovers) count **-** at the same values [LOCAL];
- **[GAP]** The engine searches for the best partition, because players arrange their own hands in real life. Hand size is <= 14 cards, so exhaustive search is fine.

**Closer:**
- the closing card is not scored as a hand card;
- bonus = 10 x its value (50 / 100 / 150) [LOCAL] [PAGAT-REMI].
- **[GAP]** Closing with a joker = 150 (10 x 15).

**Hand ended by empty stock:** no bonus. Everyone scores as above [PAGAT-REMI].

### 9.7 Match

- **No game over** [LOCAL]. Scores accumulate hand after hand; the room shows running totals and deals the next hand.
- No target score, no sistem gugur.

### 9.8 Disconnects

Out of scope for `logic.ts`. The rules module is pure, and timeouts/auto-play belong to the room layer.

### 9.9 Edge cases checklist

| Case | Behaviour | Basis |
|---|---|---|
| First turn, pile empty | Only `drawStock` | [PAGAT-REMI] |
| Take discard index 6 | That card goes into the meld; cards at 0-5 go into the hand | [LOCAL] [PAGAT-REMI] |
| Take discard index 7+ | Rejected | [LOCAL] |
| Take discard that doesn't meld with hand cards | Rejected | [LOCAL] [PAGAT-REMI] |
| Take discard to make a set, no sequence yet | Allowed | [LOCAL] |
| Take discard leaving 0 cards in hand | Rejected | [PAGAT-REMI] |
| Close right after taking a discard | Allowed | [PAGAT-REMI] ("after drawing or taking a discard") |
| Close with every card melded and nothing to discard | Rejected | [PAGAT-REMI] |
| Last stock card drawn | Turn proceeds normally; the next player hits the empty-stock rule | [PAGAT-REMI] |
| Discard-pile reshuffle | Never | [PAGAT-REMI] |
| 4-card set | Valid | [PAGAT-REMI] |
| 2-3-4-5-6-7-8-9-10 run (9 cards) | Valid | [PAGAT-REMI] |
| 9-10-J, 10-J-Q, Q-K-A, A-2-3, K-A-2 | Invalid | [LOCAL] [PAGAT-REMI] |
| J-Q-K-? extension | Invalid (J-Q-K is exactly 3) | [PAGAT-REMI] |
| 5♥-Joker-7♥, A♠-A♥-Joker, J♣-Q♣-Joker | Valid | [LOCAL] |
| Joker-Joker-5♥ | Valid (as 3-4-5, 4-5-6, 5-6-7 or 5-5-5) | [LOCAL] [GAP] |
| Joker-Joker-Joker | Invalid (needs a natural card) | [GAP] |
| Joker-Joker-Joker-5♥ | Valid (as 5-5-5-5 or a run around 5) | [LOCAL] [GAP] |
| Dealer tie for lowest score | Clockwise after the previous dealer | [GAP] |

---

## 10. Open questions for the user (your local version)

**Answered by the user (2026-10-22):** 7 cards; 4 players; aces only with aces, never in a run; 9-10-J not a run; jokers wild for any card; no sequence-first rule; taken discard must meld immediately; take up to 7 deep; values 2-10 = 5, J/Q/K = 10, A = 15; dead cards negative at the same values; closing bonus 10x; no game over, just running scores.

**Defaults confirmed by the user ([GAP] items in §9):**

Answered 2026-10-22: 4 jokers; no ceki call; dead joker -15; closing with a joker 150; jokers can be discarded; a meld needs >= 1 natural card.

---

## Sources

| Tag | URL | Note |
|---|---|---|
| PAGAT-REMI | https://www.pagat.com/rummy/indonesian_remi.html | |
| PAGAT-ID | https://www.pagat.com/national/indonesia.html | |
| CATS | https://catsatcards.com/Games/IndonesianRemi.htm | |
| ITB | https://informatika.stei.itb.ac.id/~rinaldi.munir/Stmik/2020-2021/Makalah2021/Makalah-Stima-2021-K3%20(9).pdf | Aria Bachrul Ulum Berlian, 2021 |
| NGEHACK | http://ngehack.blogspot.com/2008/09/aturan-dalam-bermain-remi.html | |
| SESAMA | http://sesamabagi.blogspot.com/2013/12/cara-bermain-kartu-remi.html | |
| KUMPARAN | https://kumparan.com/info-sport/cara-main-kartu-remi-paling-sederhana-ini-aturannya-1vxfpTVWEa7 | |
| IDN | https://lampung.idntimes.com/news/lampung/cara-bermain-kartu-remi-bagi-pemula-mudah-kokc1c2-01-nrjhk-tlg936 | |
| KASKUS | https://www.kaskus.co.id/thread/51cfaf4b8027cf4d61000006/seperti-ini-aturan-permainan-remi-tempat-ane-gan-gimana-di-tempat-agan | HTTP 503 on fetch; quoted via search snippets |
| DEWASSA | http://dewassa.blogspot.com/2011/04/7-permainan-remi-di-indonesia.html | |
| PK | https://pokerkilat.com/panduan-main-kartu-remi-ceki/ | DNS dead on fetch; quoted via search snippets |
| JOKERKARO | https://pagat.com/rummy/joker_karo.html | Search snippet |
| W-en | https://en.wikipedia.org/wiki/Ceki | |
| W-id | https://id.wikipedia.org/wiki/Ceki | |
| PORG | https://games.porg.es/articles/cards/ceki/ | |
| JAMBI | http://www.jambipos-online.com/2023/03/permainan-kartu-ceki-atau-koa.html | |
| BASABALI | https://dictionary.basabali.org/Rigat | Search snippet |
| KLIK | https://www.klikmedia9.com/2020/12/filosofi-kartu-remi-dalam-permainan-ceki.html | |
| CARI | https://carikartu.blogspot.com/2019/06/cara-bermain-kartu-remi-ceki.html | |
