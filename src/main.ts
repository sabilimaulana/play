import "./style.css"
import "./pocket.css"
import { mountHome } from "./home.ts"
import { roomLayout, shell } from "./ui.ts"

const root = document.getElementById("app")!
const [, game, room] = location.pathname.match(/^\/(tictactoe|poker|checkers|sudoku|circccle|ceki)\/([a-z0-9]{4,32})$/) ?? []
const main = shell(root, game ?? null)

if (game === "poker" && room) {
  const ui = roomLayout(main, "Poker", room, "table")
  void import("./poker/client.ts").then((m) => m.mountPoker(ui, room))
} else if (game === "ceki" && room) {
  const ui = roomLayout(main, "Ceki", room)
  void import("./ceki/client.ts").then((m) => m.mountCeki(ui, room))
} else if (game === "checkers" && room) {
  const ui = roomLayout(main, "Checkers", room)
  void import("./checkers/client.ts").then((m) => m.mountCheckers(ui, room))
} else if (game === "circccle" && room) {
  const ui = roomLayout(main, "Circccle", room)
  void import("./circccle/client.ts").then((m) => m.mountCircccle(ui, room))
} else if (game === "sudoku" && room) {
  const ui = roomLayout(main, "Sudoku", room)
  void import("./sudoku/client.ts").then((m) => m.mountSudoku(ui, room))
} else if (game === "tictactoe" && room) {
  const ui = roomLayout(main, "Tic Tac Toe", room)
  void import("./tictactoe/client.ts").then((m) => m.mountTicTacToe(ui, room))
} else {
  mountHome(main)
}
