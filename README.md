# Agent (JEV) playing Tetris

Tetris where every single move is chosen by [TypeSafe](https://docs.typesafe.ai/)'s **jev** model.
The game never decides anything. Each turn it sends the board state and a `choice` question over the
seven legal moves, and plays back whatever jev picks.

## Demo

<!--
  Drag a 30s screen recording (.mp4 or .mov) into this section while editing the README
  on github.com. GitHub uploads it and replaces this comment with the video link.
-->

## Why the game does the maths

jev returns typed judgements and probabilities rather than generated text, and the
[jev-1.13 jaggedness notes](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) are explicit that it is
unreliable at counting, grids and arithmetic, and that accuracy drops as irrelevant state grows.

So the game measures every consequence in code and jev only ever judges pre-computed outcomes.
Every option it is offered arrives like this:

```json
"left": {
  "does": "Move the piece one column to the left.",
  "then_lands": { "in_columns": "3-5", "on_row": 19, "clears_lines": 0,
                  "new_holes": 0, "roughness_after": 4 },
  "this_starts_the_best_plan": "The best placement found for this piece is columns 6-6,
     on_row 19, clears 4, new_holes 0. This action is the first step towards it."
}
```

Four things turned out to matter far more than the wording of the prompt:

- **One plan, not one hint per direction.** An earlier version attached a "head this way" hint to
  both `left` and `right`. They pointed opposite ways, and the piece ping-ponged in place until it
  landed. A single `bestPlan` over every rotation and both directions fixed it.
- **Zero-slide placements count.** The lookahead originally required a sideways step before it
  evaluated anything, so "stand the I bar upright right here" was invisible — exactly the placement
  that matters most.
- **Only advertise reachable targets.** Rows whose gaps are sealed under blocks are filtered out,
  and each open dip reports which piece kinds still fit it, by simulation rather than by a
  width-and-depth rule of thumb.
- **Depth of *this* piece, not height of the board.** `tallest_column_after` never moves when you
  fill a valley, so it silently punished the right play. `lands_on_row` replaced it.

Gravity runs on a wall clock independent of API latency, so jev gets several actions per row of
fall the way a human player does, and a slow request cannot cheat the fall.

## Running it

Needs Node 18+ and a TypeSafe API key from [console.typesafe.ai](https://console.typesafe.ai/settings/keys).

```bash
export TYPESAFE_API_KEY="your key"    # PowerShell: $env:TYPESAFE_API_KEY = "your key"
node server.mjs                       # then open http://localhost:8080
```

The key stays server-side: the page talks to a local `/move` endpoint that proxies to the API, so
the key is never sent to the browser.

Press **Start** to let it play, **Step once** to advance a single decision, or change **gravity**
(ms per row) to give it more or fewer actions per row of fall.

The panel shows the exact JSON sent each turn, jev's answer with the full probability distribution
across all seven moves, response time, and a running token count.

```bash
node test.mjs    # rules and every measurement fed to jev
```

## Files

| file | what |
| --- | --- |
| `tetris.js` | pure rules and board measurements, no DOM and no network |
| `index.html` | canvas game, payload builder, decision panel, latency chart |
| `server.mjs` | static server plus the `/move` proxy |
| `test.mjs` | assertions for the rules and for every number jev is shown |

## How well does it play

Best run so far: **14,300 points, 114 lines, 363 pieces, zero holes** — the run in the demo above,
at gravity 300 ms/row. That took 1,713 requests and ~4.7M tokens, about 4.7 requests per piece at
~2,700 tokens each, with a median response around 310 ms.

Not one hole in 363 pieces is the part worth noticing: it is not surviving by luck, it is refusing
to seal squares it cannot get back.

It has no memory between requests and no search beyond the current piece, so it cannot plan a
Tetris setup or hold a well open across several pieces on purpose. Everything strategic it appears
to do comes from which pre-computed facts it is shown.
