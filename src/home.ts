import { arcadeBot, arcadeScene, gameCover } from "./arcade-art.ts"
import { el, GAMES } from "./ui.ts"
import { GLOBAL_ROOM } from "./circccle/logic.ts"

const newRoom = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("")

export const mountHome = (main: HTMLElement) => {
  main.className = "home"
  main.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <h1>Small games.<br>Great company.</h1>
        <p class="lead">A little arcade for you and your friends. Pick a game, share a link, settle the score.</p>
        <a class="btn hero-cta" href="#games">Find your game <span aria-hidden="true">↓</span></a>
        <p class="hero-note">Free to play. No account needed.</p>
      </div>
      <figure class="hero-art">${arcadeScene()}<figcaption>Your browser’s favorite hangout.</figcaption></figure>
    </section>
    <section class="games" id="games" aria-labelledby="games-title">
      <div class="games-heading"><h2 id="games-title">Pick your next obsession</h2><p>Six games. Always room for one more.</p></div>
      <div class="shelf"></div>
    </section>
    <section class="home-invite" aria-label="How to play together">
      <div class="invite-bot" aria-hidden="true">${arcadeBot("yellow")}</div>
      <p><strong>A room for your people.</strong> Every game starts with a link. Send it to a friend and you’re in.</p>
      <span class="home-invite-note">One link. You’re both in.</span>
    </section>`

  const blurbs: Record<string, string> = {
    tictactoe: "A little rivalry. Three in a row.",
    poker: "Big bluffs. Play chips.",
    checkers: "Think ahead. Take the crown.",
    sudoku: "A quiet puzzle. Or a friendly race.",
    circccle: "Start small. Eat everything.",
    ceki: "Seven cards. Meld them all, close first."
  }
  const shelf = main.querySelector(".shelf")!
  for (const game of GAMES) {
    const card = el("article", `cabinet cabinet--${game.slug}`)
    card.id = game.slug
    const open = () => { location.href = `/${game.slug}/${newRoom()}` }
    const screen = el("button", "cabinet-screen")
    screen.type = "button"
    screen.setAttribute("aria-label", game.slug === "circccle" ? "Start a private Circccle room" : `Start a ${game.name} room`)
    screen.onclick = open
    screen.innerHTML = `${gameCover(game.slug)}<span class="cover-open" aria-hidden="true">↗</span>`
    const body = el("div", "cabinet-body")
    const title = el("div", "cabinet-heading")
    title.append(el("h3", "", game.name), el("p", "meta", game.players))
    body.append(title, el("p", "game-blurb", blurbs[game.slug]!))
    const start = el("button", "btn btn--game", "New room")
    start.type = "button"
    start.onclick = open
    if (game.slug === "circccle") {
      const global = el("button", "btn btn--game", "Play global")
      global.type = "button"
      global.onclick = () => { location.href = `/circccle/${GLOBAL_ROOM}` }
      start.textContent = "Private room"
      start.classList.add("btn--quiet")
      const actions = el("div", "act-buttons")
      actions.append(global, start)
      body.append(actions)
    } else body.append(start)
    card.append(screen, body)
    shelf.append(card)
  }
}
