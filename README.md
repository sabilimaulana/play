# play.sblsblsbl.club

Pixel-art multiplayer browser games. No accounts: create a room, share the link.

- `src/worker.ts`: Worker; `Room<S>` base = one Durable Object per room (`/api/<game>/<room>/ws`), server-authoritative
- `src/<game>/logic.ts`: pure rules (+ `logic.test.ts`); `src/<game>/client.ts`: Pixi + bevy-ts ECS client
- games: `tictactoe` (2p), `poker` (no-limit hold'em, 2-9p, play chips, blinds 10/20; busted or 3x timed-out players leave after the hand, 8s result pause, emotes, premoves, hide-cards toggle, last 20 hands as still tables in a history dialog), `checkers` (American rules, 2p), `sudoku` (1-2p race on the same puzzle, easy/medium/hard), `circccle` (real-time eat-and-grow with split/eject, 1-20p + computer players, shared `/circccle/global` room or private rooms; `CircccleRoom` ticks in memory at 20Hz instead of using `Room<S>`)
- solo play: server-side computer players (`Room.bots/botTurn/botAct`, move after `BOT_MS`); tic tac toe minimax w/ 20% blunders, checkers 4-ply search, poker Monte Carlo equity
- `src/net.ts`: shared room socket, player id, invite box
- `vendor/bevy-ts`: vendored ECS (see `VENDOR.md`)
- `e2e/*.e2e.ts`: Playwright, real browsers against the real Worker + DOs; multiplayer = two browser contexts (`friend` fixture)
- `alchemy.run.ts`: infra (Alchemy 2)

```sh
bun install
bun run build && bun run dev   # worker + built client on :8787
bun run web                    # optional: vite HMR on :5173, proxies /api to :8787
bun run check                  # typecheck + tests
bun run e2e                    # Playwright e2e vs local worker (boots it); BASE_URL=https://... for a deployed one
bun run e2e:report             # HTML report: video + screenshots per test, a second video for the friend's browser
bun run plan                   # preview prod
bun run deploy                 # build + deploy to play.sblsblsbl.club
```

New game: add `src/<game>/logic.ts` + `client.ts`, a `Room<S>` subclass in `worker.ts`, a binding in `alchemy.run.ts`, the route in `worker.ts` + `main.ts`, a card in `main.ts`.
