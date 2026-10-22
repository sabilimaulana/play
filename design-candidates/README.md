# PLAY: three design directions

These are working design proposals, prepared before choosing the full app redesign.
Production source, multiplayer behavior, and the current `design.md` are unchanged.

Run `bun run web --host 127.0.0.1` from `play`, then open:

- A: http://127.0.0.1:5173/design-candidates/?direction=pocket
- B: http://127.0.0.1:5173/design-candidates/?direction=playroom
- C: http://127.0.0.1:5173/design-candidates/?direction=afterhours

Use the Library / Game room controls to compare each system in both contexts.
All game links in this prototype lead to the shared Tic Tac Toe room sample.
The room supports local two-player moves, wins, draws, scores, and restarting.
It is explicitly labeled as a preview and does not connect to multiplayer.

## What the existing UI needs

The current homepage spends over half the initial desktop viewport explaining
the app before showing games. The same pixel font and heavy box treatment are
used for almost every element. Detailed rules dominate the game cards, and the
art previews vary in density and framing.

Each proposal makes game discovery more immediate, separates display type from
readable UI text, shortens the descriptions, and clarifies the game-room hierarchy:
current turn, board, players, invitation, rules.

## A — Pocket Arcade (recommended)

- Mood: a miniature social arcade, indigo, mint, lavender.
- Structure: illustrated arcade scene above a compact five-game shelf.
- Typography: Jersey 10 for identity and headings; Manrope for controls and text.
- Art: an original isometric arcade, pixel characters, and consistent game covers.
- Room: a dark board well, mint turn cue, and a focused player/invite sidebar.
- Why: the most natural evolution of the existing pixel identity.
- Full implementation: develop a consistent pixel asset set for all five games,
  refine cabinet and character details, and apply the same typography and hierarchy
  to poker actions, checkers, sudoku, and Circccle controls.

## B — Playroom

- Mood: bright, friendly, tactile; lilac surfaces and colorful tabletop objects.
- Structure: a large Tic Tac Toe feature beside four smaller games.
- Typography: Bricolage Grotesque display and Manrope UI.
- Art: rounded tiles, cutout cards, offset physical shadows, playful circles.
- Room: soft board edges, lilac frame, readable controls on light surfaces.
- Why: the boldest departure and the most approachable casual-game direction.
- Tradeoff: moves away from the established pixel-first identity.
- Full implementation: replace pixel surfaces with a consistent tactile piece
  system, including poker cards/chips, checker kings, sudoku cells and arena art.

## C — After Hours

- Mood: a late-night games lounge; oxblood, warm ivory, brass, green felt.
- Structure: persistent game menu beside a featured poker table.
- Typography: Space Grotesk display and Manrope UI.
- Art: table geometry, quiet lighting through surface contrast, restrained cards.
- Room: felt play surface, brass turn indicator, compact player panel.
- Why: stronger for poker and longer sessions with friends.
- Tradeoff: the poker-led home gives quick games less prominence; a full version
  should let the player choose the featured game.

## Visual proof and validation

`screenshots/` contains the original desktop homepage plus all three proposals'
desktop library, mobile library, desktop room, and mobile room screenshots.

The screenshots are actual Chromium renders of the HTML/CSS/SVG implementation.
They were visually inspected, including the mobile layouts. The small-game cover
backgrounds in B were corrected after the first visual pass.

Reproduce the captures and checks with:

```sh
bun design-candidates/capture.mjs
```

The script checks both screens at 320, 375, 390, 414, 768, 1024, 1440 and 1920px,
page overflow, browser errors, the room's win/draw/reset behavior, keyboard moves,
and reduced-motion behavior. Results are in `validation.json`.

These checks validate the prototypes, not the production multiplayer game flows.
After a direction is selected, implementation and testing must cover all five
real games, invitations, waiting/reconnecting, actions, results, and rematches.

## Assets

All illustrations are native SVG built in `preview.js`; no generated raster mockups
or external runtime image dependencies. Font files are local Google Fonts assets
(Jersey 10, Bricolage Grotesque, Manrope, Space Grotesk), used for these previews.
Proposed tokens are isolated in this directory's `tokens.css`.
