# Design — Pocket Arcade

Selected by the user from the three working design proposals on 22 October 2026.
This is the shared system for the library and all five multiplayer games.

## Intent

A miniature arcade for friends. The characteristic moment is a custom isometric
arcade with small pixel characters. The interface is quiet enough to make the game,
whose turn it is, and the next action immediately clear.

## Structure

- Library: Ecosystem Index. A short introduction and arcade illustration lead into
  a compact shelf containing every game. Each game has a distinct cover, player
  count, one-line description, and direct room action. Circccle also has a global action.
- Game rooms: Workbench. Current status and board share one surface. Player state,
  controls, rules, and invite form a sidebar. While waiting, the invite has priority.
- Mobile rooms: status, invitation when waiting, board, player/actions, then the
  compact invitation when playing. No horizontal document scrolling.
- Poker variant (`data-variant="table"`): the table owns the left column, sized to the
  viewport so every pod is visible without scrolling. The right column is one console:
  status (with a full-width turn clock) on top, then your hand, bet sizing, Fold/Call/Raise,
  and a single row of taunts. Rules, vote kick and hand history are quiet links under it;
  the invite follows. On phones: table, console, extras; while waiting, the invite leads.

## Color and typography

`tokens.css` is the source of truth for interface and SVG colors.
`src/paint.ts` exports the corresponding canvas palette as `ARCADE`.

- Indigo page and wells; elevated surfaces use a lighter indigo.
- Mint means a primary action, your turn, a winning state, or an available move.
- Lavender establishes the board frames, illustrations and deck backs.
- Coral X / red checkers, sky O, warm ivory white pieces.
- Poker uses dark green felt with lavender trim and four distinguishable suit inks.
- Focus is a high-contrast cyan ring. A turn is also identified with text and borders.

Jersey 10 is for the wordmark, titles, scores and board numerals. Manrope is for
instructions, controls, names and metadata. Both are served locally from
`assets/fonts/`, along with their licenses. No body `font-size-adjust` workaround.

## Shape, space and motion

- A 4px named spacing scale; 1248px maximum content width.
- One-pixel quiet panel borders; 12px panel corners; 5px controls.
- Game artwork keeps crisp geometry. Board pieces are pixel sprites; the library
  illustration and covers are authored SVG. No generated screenshots in the app.
- Buttons translate in response to hover/press. Motion uses the named easing tokens.
- Reduced motion removes decorative transitions, shakes, confetti and sprite glides.
- Focus rings appear immediately. Keyboard controls remain real DOM buttons over
  canvas boards, and native buttons in Sudoku.

## Interaction and copy

- Primary verbs remain stable: New room, Copy link, Play the computer, Take a seat,
  Deal, Fold, Call, Raise, Play again.
- Room status announces whose turn it is, waiting, reconnecting, errors and results.
- Rules are in a native details disclosure, separate from the current action.
- The game menu is a native disclosure with outside-click dismissal and Escape.
- Copy success appears on its button; a failed copy selects the existing link field.
- Player names continue to render through textContent. SVG templates contain only
  authored artwork and internal game identifiers.

## Implementation boundaries

- `src/style.css` retains the original game-specific structural rules.
- `src/pocket.css`, loaded after it, contains the selected visual system and
  responsive layouts. Do not add page-level themes that compete with this system.
- `src/home.ts`, `src/ui.ts`, and `src/arcade-art.ts` own the library, shared shell,
  and authored library illustrations respectively.
- Existing routes, server-authoritative rules, invitations, clocks, bots, rematches,
  poker controls/history, Sudoku notes and Circccle actions remain available.
- `design-candidates/` is the review archive and is not imported into production.

## Exports

### CSS

The full set of reusable tokens is in `tokens.css`.

```css
:root {
  color-scheme: dark;
  --color-void: oklch(17% .038 282);
  --color-paper: oklch(21% .045 282);
  --color-paper-2: oklch(26% .052 282);
  --color-paper-3: oklch(35% .055 282);
  --color-ink: oklch(96% .016 86);
  --color-ink-2: oklch(75% .039 286);
  --color-accent: oklch(88% .14 155);
  --color-accent-ink: oklch(22% .045 282);
  --color-focus: oklch(87% .11 207);
  --color-x: oklch(72% .17 25);
  --color-o: oklch(76% .12 232);
  --color-ok: var(--color-accent);
  --color-bad: oklch(73% .16 20);
  --color-felt: oklch(37% .06 169);
  --color-panel-edge: oklch(36% .05 282);
  --color-purple: oklch(74% .135 294);
  --color-purple-deep: oklch(45% .09 288);
  --color-yellow: oklch(88% .15 87);
  --color-red: var(--color-x);
  --color-blue: var(--color-o);
  --color-green: oklch(78% .13 165);
  --color-white: oklch(97% .014 90);
  --color-dark: oklch(19% .035 280);
  --color-pink: oklch(81% .10 355);
  --color-shadow: oklch(12% .028 280 / .55);
  --color-backdrop: oklch(12% .028 280 / .86);
  /* Illustration roles share the same palette as the interface. */
  --color-panel: var(--color-paper-2);
  --color-well: var(--color-void);
  --color-muted: var(--color-ink-2);
  --color-rule: var(--color-panel-edge);
  --font-display: "Jersey 10", ui-monospace, monospace;
  --font-body: "Manrope", ui-sans-serif, sans-serif;
  --text-2xs: .75rem;
  --text-xs: .8125rem;
  --text-sm: .9375rem;
  --text-md: 1.125rem;
  --text-lg: 1.375rem;
  --text-display-s: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);
  --text-display: clamp(3.5rem, 4.8vw + 1rem, 5rem);
  --space-3xs: .25rem;
  --space-2xs: .5rem;
  --space-xs: .75rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2rem;
  --space-xl: 3rem;
  --space-2xl: 4.5rem;
  --rule: 1px;
  --rule-board: 3px;
  --shadow-step: 3px;
  --radius: 5px;
  --radius-panel: 12px;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-in: cubic-bezier(.7, 0, .84, 0);
  --ease-in-out: cubic-bezier(.65, 0, .35, 1);
  --dur-press: 100ms;
  --dur-short: 160ms;
}
```

### Tailwind v4

```css
@theme {
  --color-void: oklch(17% .038 282);
  --color-paper: oklch(21% .045 282);
  --color-paper-2: oklch(26% .052 282);
  --color-paper-3: oklch(35% .055 282);
  --color-ink: oklch(96% .016 86);
  --color-ink-2: oklch(75% .039 286);
  --color-accent: oklch(88% .14 155);
  --color-accent-ink: oklch(22% .045 282);
  --color-focus: oklch(87% .11 207);
  --color-x: oklch(72% .17 25);
  --color-o: oklch(76% .12 232);
  --color-ok: var(--color-accent);
  --color-bad: oklch(73% .16 20);
  --color-felt: oklch(37% .06 169);
  --color-panel-edge: oklch(36% .05 282);
  --color-purple: oklch(74% .135 294);
  --color-purple-deep: oklch(45% .09 288);
  --color-yellow: oklch(88% .15 87);
  --color-red: var(--color-x);
  --color-blue: var(--color-o);
  --color-green: oklch(78% .13 165);
  --color-white: oklch(97% .014 90);
  --color-dark: oklch(19% .035 280);
  --color-pink: oklch(81% .10 355);
  --color-shadow: oklch(12% .028 280 / .55);
  --color-backdrop: oklch(12% .028 280 / .86);
  --color-panel: var(--color-paper-2);
  --color-well: var(--color-void);
  --color-muted: var(--color-ink-2);
  --color-rule: var(--color-panel-edge);
  --font-display: "Jersey 10", ui-monospace, monospace;
  --font-body: "Manrope", ui-sans-serif, sans-serif;
  --text-2xs: .75rem;
  --text-xs: .8125rem;
  --text-sm: .9375rem;
  --text-md: 1.125rem;
  --text-lg: 1.375rem;
  --text-display-s: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);
  --text-display: clamp(3.5rem, 4.8vw + 1rem, 5rem);
  --spacing-3xs: .25rem;
  --spacing-2xs: .5rem;
  --spacing-xs: .75rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  --spacing-2xl: 4.5rem;
  --radius-panel: 12px;
}
```

### DTCG

```json
{
  "color": {
    "void": {
      "$value": "oklch(17% .038 282)",
      "$type": "color"
    },
    "paper": {
      "$value": "oklch(21% .045 282)",
      "$type": "color"
    },
    "paper-2": {
      "$value": "oklch(26% .052 282)",
      "$type": "color"
    },
    "paper-3": {
      "$value": "oklch(35% .055 282)",
      "$type": "color"
    },
    "ink": {
      "$value": "oklch(96% .016 86)",
      "$type": "color"
    },
    "ink-2": {
      "$value": "oklch(75% .039 286)",
      "$type": "color"
    },
    "accent": {
      "$value": "oklch(88% .14 155)",
      "$type": "color"
    },
    "accent-ink": {
      "$value": "oklch(22% .045 282)",
      "$type": "color"
    },
    "focus": {
      "$value": "oklch(87% .11 207)",
      "$type": "color"
    },
    "x": {
      "$value": "oklch(72% .17 25)",
      "$type": "color"
    },
    "o": {
      "$value": "oklch(76% .12 232)",
      "$type": "color"
    },
    "bad": {
      "$value": "oklch(73% .16 20)",
      "$type": "color"
    },
    "felt": {
      "$value": "oklch(37% .06 169)",
      "$type": "color"
    },
    "panel-edge": {
      "$value": "oklch(36% .05 282)",
      "$type": "color"
    },
    "purple": {
      "$value": "oklch(74% .135 294)",
      "$type": "color"
    },
    "purple-deep": {
      "$value": "oklch(45% .09 288)",
      "$type": "color"
    },
    "yellow": {
      "$value": "oklch(88% .15 87)",
      "$type": "color"
    },
    "green": {
      "$value": "oklch(78% .13 165)",
      "$type": "color"
    },
    "white": {
      "$value": "oklch(97% .014 90)",
      "$type": "color"
    },
    "dark": {
      "$value": "oklch(19% .035 280)",
      "$type": "color"
    },
    "pink": {
      "$value": "oklch(81% .10 355)",
      "$type": "color"
    },
    "shadow": {
      "$value": "oklch(12% .028 280 / .55)",
      "$type": "color"
    },
    "backdrop": {
      "$value": "oklch(12% .028 280 / .86)",
      "$type": "color"
    }
  },
  "font": {
    "display": {
      "$value": "\"Jersey 10\", ui-monospace, monospace",
      "$type": "fontFamily"
    },
    "body": {
      "$value": "\"Manrope\", ui-sans-serif, sans-serif",
      "$type": "fontFamily"
    }
  },
  "space": {
    "3xs": {
      "$value": ".25rem",
      "$type": "dimension"
    },
    "2xs": {
      "$value": ".5rem",
      "$type": "dimension"
    },
    "xs": {
      "$value": ".75rem",
      "$type": "dimension"
    },
    "sm": {
      "$value": "1rem",
      "$type": "dimension"
    },
    "md": {
      "$value": "1.5rem",
      "$type": "dimension"
    },
    "lg": {
      "$value": "2rem",
      "$type": "dimension"
    },
    "xl": {
      "$value": "3rem",
      "$type": "dimension"
    },
    "2xl": {
      "$value": "4.5rem",
      "$type": "dimension"
    }
  }
}
```

### shadcn/ui variable mapping

```css
:root {
  --background: var(--color-paper);
  --foreground: var(--color-ink);
  --primary: var(--color-accent);
  --primary-foreground: var(--color-accent-ink);
  --muted: var(--color-paper-2);
  --muted-foreground: var(--color-ink-2);
  --border: var(--color-panel-edge);
  --input: var(--color-panel-edge);
  --ring: var(--color-focus);
}
```
