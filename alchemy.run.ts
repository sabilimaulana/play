import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect } from "effect"
import type { CheckersRoom, CircccleRoom, PokerRoom, SudokuRoom, TicTacToeRoom } from "./src/worker.ts"

export type WorkerEnv = Cloudflare.InferEnv<typeof Play>

// One Worker: static client from ./dist, /api/* to the Worker, one Durable Object per room.
export const Play = Cloudflare.Worker("Play", {
  main: "./src/worker.ts",
  env: {
    TICTACTOE: Cloudflare.DurableObject<TicTacToeRoom>("TicTacToeRoom"),
    POKER: Cloudflare.DurableObject<PokerRoom>("PokerRoom"),
    CHECKERS: Cloudflare.DurableObject<CheckersRoom>("CheckersRoom"),
    SUDOKU: Cloudflare.DurableObject<SudokuRoom>("SudokuRoom"),
    CIRCCCLE: Cloudflare.DurableObject<CircccleRoom>("CircccleRoom")
  },
  assets: {
    directory: "./dist",
    notFoundHandling: "single-page-application",
    runWorkerFirst: ["/api/*"]
  },
  domain: "play.sblsblsbl.club",
  dev: { port: 8787 }
})

export default Alchemy.Stack(
  "play",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const play = yield* Play
    return { url: play.url }
  })
)
