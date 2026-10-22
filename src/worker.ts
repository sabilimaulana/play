import { DurableObject } from "cloudflare:workers"
import type { WorkerEnv } from "../alchemy.run.ts"
import * as Poker from "./poker/logic.ts"
import { fullDeck } from "./poker/hand.ts"
import * as TicTacToe from "./tictactoe/logic.ts"
import * as Checkers from "./checkers/logic.ts"
import * as Sudoku from "./sudoku/logic.ts"
import * as Circccle from "./circccle/logic.ts"
import * as Ceki from "./ceki/logic.ts"
import { avatarOf } from "./avatar.ts"

const ROUTE = /^\/api\/(tictactoe|poker|checkers|sudoku|circccle|ceki)\/([a-z0-9]{4,32})\/ws$/
const PID = /^[a-z0-9]{8,40}$/ // computer players use ids this can't match ("bot", "bot-1")
/** Computer players "think" this long before moving. */
const BOT_MS = 900

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const [, game, room] = new URL(request.url).pathname.match(ROUTE) ?? []
    if (!game || !room) return new Response("Not found", { status: 404 })
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 })
    const ns = game === "poker" ? env.POKER : game === "checkers" ? env.CHECKERS : game === "sudoku" ? env.SUDOKU : game === "circccle" ? env.CIRCCCLE : game === "ceki" ? env.CEKI : env.TICTACTOE
    return ns.getByName(room).fetch(request)
  }
}

/**
 * One room = one Durable Object holding state S. Sockets are tagged with the player id
 * (hibernation-safe); every change is persisted, then each socket gets its own view.
 */
// ponytail: rooms live forever in DO storage (a few KB each); add an alarm cleanup if that ever matters.
abstract class Room<S> extends DurableObject {
  private state: S | undefined
  protected abstract init(): S
  protected abstract join(s: S, pid: string): S
  protected abstract act(s: S, pid: string, raw: string, online: ReadonlySet<string>): S | string
  protected abstract view(s: S, pid: string, online: ReadonlySet<string>): unknown
  /** Runs after every change and disconnect, e.g. to auto-act for absent players. */
  protected settle(s: S, _online: ReadonlySet<string>): S {
    return s
  }
  /** The decision currently on the clock (a key that changes every turn), or null. */
  protected turn(_s: S, _online: ReadonlySet<string>): { readonly key: string; readonly ms: number } | null {
    return null
  }
  /** What happens when the clock runs out. */
  protected timeout(s: S, _online: ReadonlySet<string>): S {
    return s
  }
  /** Computer players seated in s; they count as always online. */
  protected bots(_s: S): readonly string[] {
    return []
  }
  /** True when a computer player is on the clock; it moves (via botAct) after BOT_MS instead of a full turn. */
  protected botTurn(_s: S): boolean {
    return false
  }
  protected botAct(s: S, _online: ReadonlySet<string>): S {
    return s
  }
  private timer: { key: string; at: number } | null | undefined

  private async clock() {
    if (this.timer === undefined) this.timer = (await this.ctx.storage.get<{ key: string; at: number }>("timer")) ?? null
    return this.timer
  }

  /** Starts a fresh clock whenever the decision changes; clears it when nobody is on the clock. */
  private async syncClock(s: S, online: ReadonlySet<string>) {
    const turn = this.turn(s, online)
    const timer = await this.clock()
    if (!turn) {
      if (timer) {
        this.timer = null
        await this.ctx.storage.delete("timer")
        await this.ctx.storage.deleteAlarm()
      }
    } else if (timer?.key !== turn.key) {
      this.timer = { key: turn.key, at: Date.now() + (this.botTurn(s) ? BOT_MS : turn.ms) }
      await this.ctx.storage.put("timer", this.timer)
      await this.ctx.storage.setAlarm(this.timer.at)
    }
    return this.timer
  }

  override async alarm(): Promise<void> {
    const s = await this.load()
    const { online } = this.sockets(s)
    const timer = await this.clock()
    if (!timer || this.turn(s, online)?.key !== timer.key) return
    if (Date.now() < timer.at - 50) return void (await this.ctx.storage.setAlarm(timer.at))
    if (this.botTurn(s)) await this.commit(this.botAct(s, online))
    else await this.commit(this.timeout(s, online), undefined, "timeout")
  }

  private async load(): Promise<S> {
    return (this.state ??= (await this.ctx.storage.get<S>("state")) ?? this.init())
  }

  private sockets(s: S, closing?: WebSocket) {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== closing)
    return { sockets, online: new Set([...sockets.map((ws) => this.ctx.getTags(ws)[0]!), ...this.bots(s)]) }
  }

  private async commit(next: S, closing?: WebSocket, event?: "timeout"): Promise<void> {
    const { sockets, online } = this.sockets(next, closing)
    const settled = this.settle(next, online)
    if (settled !== this.state) await this.ctx.storage.put("state", settled)
    this.state = settled
    const timer = await this.syncClock(settled, online)
    // Remaining time, not a timestamp, so client clock skew doesn't matter.
    const clock = timer ? { turnMs: Math.max(0, timer.at - Date.now()) } : { turnMs: null }
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({ ...(this.view(settled, this.ctx.getTags(ws)[0]!, online) as object), ...clock, event }))
      } catch {}
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const pid = new URL(request.url).searchParams.get("pid") ?? ""
    if (!PID.test(pid)) return new Response("Bad pid", { status: 400 })
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [pid])
    await this.commit(this.join(await this.load(), pid))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const pid = this.ctx.getTags(ws)[0]
    if (!pid || typeof raw !== "string") return
    const s = await this.load()
    const next = this.act(s, pid, raw, this.sockets(s).online)
    if (typeof next !== "string") await this.commit(next)
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.commit(await this.load(), ws)
    try {
      ws.close(code === 1005 ? 1000 : code)
    } catch {}
  }
}

export class TicTacToeRoom extends Room<TicTacToe.Game> {
  protected init() {
    return TicTacToe.newGame()
  }
  protected join(g: TicTacToe.Game, pid: string) {
    return TicTacToe.join(g, pid)
  }
  protected act(g: TicTacToe.Game, pid: string, raw: string) {
    const msg = TicTacToe.parseMessage(raw)
    if (!msg) return "bad message"
    return msg.t === "move" ? TicTacToe.move(g, pid, msg.i) : msg.t === "bot" ? TicTacToe.addBot(g, pid) : TicTacToe.rematch(g, pid)
  }
  protected view(g: TicTacToe.Game, pid: string, online: ReadonlySet<string>): TicTacToe.View {
    return {
      board: g.board,
      turn: g.turn,
      winner: g.winner,
      line: g.line,
      you: TicTacToe.seatOf(g, pid),
      online: { X: !!g.seats.X && online.has(g.seats.X), O: !!g.seats.O && online.has(g.seats.O) },
      avatars: { X: g.seats.X && avatarOf(g.seats.X), O: g.seats.O && avatarOf(g.seats.O) },
      bot: g.seats.X === TicTacToe.BOT ? "X" : g.seats.O === TicTacToe.BOT ? "O" : null,
      score: g.score
    }
  }
  protected override bots(g: TicTacToe.Game) {
    return Object.values(g.seats).filter((p) => p === TicTacToe.BOT)
  }
  protected override botTurn(g: TicTacToe.Game) {
    return g.seats[g.turn] === TicTacToe.BOT
  }
  protected override botAct(g: TicTacToe.Game) {
    return TicTacToe.botMove(g, Math.random)
  }
  protected override turn(g: TicTacToe.Game, online: ReadonlySet<string>) {
    const key = TicTacToe.turnKey(g, !!g.seats.X && !!g.seats.O && online.has(g.seats.X) && online.has(g.seats.O))
    return key ? { key, ms: TicTacToe.TURN_MS } : null
  }
  protected override timeout(g: TicTacToe.Game) {
    return TicTacToe.timeoutMove(g, Math.random)
  }
}

const shuffle = (deck = fullDeck()): string[] => {
  const r = crypto.getRandomValues(new Uint32Array(deck.length))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = r[i]! % (i + 1)
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

export class PokerRoom extends Room<Poker.Table> {
  protected init() {
    return Poker.newTable()
  }
  protected join(t: Poker.Table) {
    return t // seating is an explicit "sit" with a name
  }
  protected act(t: Poker.Table, pid: string, raw: string, online: ReadonlySet<string>) {
    const action = Poker.parseAction(raw)
    return action ? Poker.apply(t, pid, action, online, () => shuffle()) : "bad message"
  }
  protected override settle(t: Poker.Table, online: ReadonlySet<string>) {
    return Poker.settle(t, online)
  }
  protected view(t: Poker.Table, pid: string, online: ReadonlySet<string>) {
    return Poker.view(t, pid, online)
  }
  protected override turn(t: Poker.Table) {
    const key = Poker.turnKey(t)
    return key ? { key, ms: Poker.turnMs(t) } : null
  }
  protected override timeout(t: Poker.Table, online: ReadonlySet<string>) {
    return t.stage === "done" ? Poker.tidy(t) : Poker.timeout(t, online)
  }
  protected override bots(t: Poker.Table) {
    return t.seats.map((s) => s.pid).filter(Poker.isBot)
  }
  protected override botTurn(t: Poker.Table) {
    return t.toAct !== null && Poker.isBot(t.seats[t.toAct]!.pid)
  }
  protected override botAct(t: Poker.Table, online: ReadonlySet<string>) {
    return Poker.botAct(t, online, Math.random)
  }
}

export class CekiRoom extends Room<Ceki.Game> {
  protected init() {
    return Ceki.newGame()
  }
  protected join(g: Ceki.Game) {
    return g // seating is an explicit "sit" with a name
  }
  protected act(g: Ceki.Game, pid: string, raw: string, online: ReadonlySet<string>) {
    const action = Ceki.parseAction(raw)
    return action ? Ceki.apply(g, pid, action, online, () => shuffle(Ceki.fullDeck())) : "bad message"
  }
  protected override settle(g: Ceki.Game, online: ReadonlySet<string>) {
    return Ceki.settle(g, online)
  }
  protected view(g: Ceki.Game, pid: string, online: ReadonlySet<string>) {
    return Ceki.view(g, pid, online)
  }
  protected override turn(g: Ceki.Game) {
    const key = Ceki.turnKey(g)
    return key ? { key, ms: Ceki.TURN_MS } : null
  }
  protected override timeout(g: Ceki.Game) {
    return Ceki.botAct(g)
  }
  protected override bots(g: Ceki.Game) {
    return g.seats.map((s) => s.pid).filter(Ceki.isBot)
  }
  protected override botTurn(g: Ceki.Game) {
    return Ceki.turnKey(g) !== null && Ceki.isBot(g.seats[g.turn]!.pid)
  }
  protected override botAct(g: Ceki.Game) {
    return Ceki.botAct(g)
  }
}

export class CheckersRoom extends Room<Checkers.Game> {
  protected init() {
    return Checkers.newGame()
  }
  protected join(g: Checkers.Game, pid: string) {
    return Checkers.join(g, pid)
  }
  protected act(g: Checkers.Game, pid: string, raw: string) {
    const msg = Checkers.parseMessage(raw)
    if (!msg) return "bad message"
    return msg.t === "move" ? Checkers.move(g, pid, msg.from, msg.to)
      : msg.t === "resign" ? Checkers.resign(g, pid)
      : msg.t === "bot" ? Checkers.addBot(g, pid)
      : Checkers.rematch(g, pid)
  }
  protected override bots(g: Checkers.Game) {
    return Object.values(g.seats).filter((p) => p === Checkers.BOT)
  }
  protected override botTurn(g: Checkers.Game) {
    return !g.winner && g.seats[g.turn] === Checkers.BOT
  }
  protected override botAct(g: Checkers.Game) {
    return Checkers.botMove(g, Math.random)
  }
  protected view(g: Checkers.Game, pid: string, online: ReadonlySet<string>): Checkers.View {
    const you = Checkers.seatOf(g, pid)
    const here = { red: !!g.seats.red && online.has(g.seats.red), white: !!g.seats.white && online.has(g.seats.white) }
    return {
      board: g.board,
      turn: g.turn,
      forced: g.forced,
      last: g.last,
      winner: g.winner,
      you,
      online: here,
      avatars: { red: g.seats.red && avatarOf(g.seats.red), white: g.seats.white && avatarOf(g.seats.white) },
      bot: g.seats.red === Checkers.BOT ? "red" : g.seats.white === Checkers.BOT ? "white" : null,
      score: g.score,
      moves: you && you === g.turn && !g.winner && here.red && here.white ? Checkers.legalMoves(g) : []
    }
  }
  protected override turn(g: Checkers.Game, online: ReadonlySet<string>) {
    const key = Checkers.turnKey(g, !!g.seats.red && !!g.seats.white && online.has(g.seats.red) && online.has(g.seats.white))
    return key ? { key, ms: Checkers.TURN_MS } : null
  }
  protected override timeout(g: Checkers.Game) {
    return Checkers.timeoutMove(g, Math.random)
  }
}

export class SudokuRoom extends Room<Sudoku.Game> {
  protected init() {
    return Sudoku.newGame()
  }
  protected join(g: Sudoku.Game, pid: string) {
    return Sudoku.join(g, pid)
  }
  protected act(g: Sudoku.Game, pid: string, raw: string, online: ReadonlySet<string>) {
    const msg = Sudoku.parseMessage(raw)
    if (!msg) return "bad message"
    return msg.t === "start" ? Sudoku.start(g, pid, msg.level, online, Date.now(), Math.random) : Sudoku.set(g, pid, msg.i, msg.v, Date.now())
  }
  protected view(g: Sudoku.Game, pid: string, online: ReadonlySet<string>): Sudoku.View {
    return Sudoku.view(g, pid, online, Date.now(), avatarOf)
  }
}

/**
 * Real-time room: the world lives in memory and ticks while anyone is connected (plain sockets,
 * no hibernation, nothing persisted). Everyone leaves = the arena resets, which is fine for a snack game.
 */
export class CircccleRoom extends DurableObject {
  private world = Circccle.newWorld(Math.random)
  private players = new Map<WebSocket, Circccle.Player>()
  private loop: ReturnType<typeof setInterval> | null = null
  private sentRoster = -1

  override async fetch(request: Request): Promise<Response> {
    const pid = new URL(request.url).searchParams.get("pid") ?? ""
    if (!PID.test(pid)) return new Response("Bad pid", { status: 400 })
    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()
    if (this.players.size >= Circccle.MAX_HUMANS) {
      server.send(JSON.stringify({ t: "full" } satisfies Circccle.ServerMessage))
      server.close(1000, "full")
      return new Response(null, { status: 101, webSocket: client })
    }
    const w = this.world
    const me = Circccle.addPlayer(w, pid, avatarOf, Math.random)
    Circccle.balanceBots(w, avatarOf, Math.random)
    this.players.set(server, me)
    server.send(JSON.stringify({ t: "hello", you: me.id, pellets: w.pellets, roster: Circccle.roster(w) } satisfies Circccle.ServerMessage))
    server.addEventListener("message", (e) => {
      const msg = Circccle.parseMessage(e.data)
      if (msg?.t === "aim") Circccle.aim(me, msg.x, msg.y)
      else if (msg?.t === "split") Circccle.split(this.world, me)
      else if (msg?.t === "eject") Circccle.eject(this.world, me)
      else if (msg?.t === "name") Circccle.rename(this.world, me, msg.name)
    })
    const leave = () => {
      if (!this.players.delete(server)) return
      Circccle.removePlayer(w, me.id)
      Circccle.balanceBots(w, avatarOf, Math.random)
      if (this.players.size === 0) {
        clearInterval(this.loop)
        this.loop = null
        this.world = Circccle.newWorld(Math.random)
      }
    }
    server.addEventListener("close", leave)
    server.addEventListener("error", leave)
    this.loop ??= setInterval(() => this.tick(), Circccle.TICK_MS)
    return new Response(null, { status: 101, webSocket: client })
  }

  private tick() {
    const w = this.world
    Circccle.step(w, Circccle.TICK_MS, Math.random)
    const base = {
      t: "tick" as const,
      cells: Circccle.wire(w),
      ejecta: w.ejecta.map((e) => [e.id, Math.round(e.x), Math.round(e.y), e.color] as [number, number, number, number]),
      pellets: [...w.changed].map((i) => [i, ...w.pellets[i]!] as [number, number, number, number]),
      ...(this.sentRoster !== w.roster ? { roster: Circccle.roster(w) } : {})
    }
    w.changed.clear()
    this.sentRoster = w.roster
    const shared = JSON.stringify(base)
    for (const [ws, me] of this.players) {
      try {
        // The one who just got eaten also learns by whom (once, on the tick it happened).
        ws.send(!me.cells.length && me.respawnIn > Circccle.RESPAWN_MS - Circccle.TICK_MS ? JSON.stringify({ ...base, eatenBy: me.eatenBy }) : shared)
      } catch {}
    }
  }
}
