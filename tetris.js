// Pure Tetris rules. No DOM, no network — imported by index.html and test.mjs.
export const COLS = 12, ROWS = 20;
export const MOVES = ['left', 'right', 'rotate_cw', 'rotate_ccw', 'soft_drop', 'hard_drop', 'none'];

// spawn-state cells as [row, col] inside a BOX x BOX square
const SHAPES = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  J: [[0, 0], [1, 0], [1, 1], [1, 2]],
  L: [[0, 2], [1, 0], [1, 1], [1, 2]],
  S: [[0, 1], [0, 2], [1, 0], [1, 1]],
  T: [[0, 1], [1, 0], [1, 1], [1, 2]],
  Z: [[0, 0], [0, 1], [1, 1], [1, 2]],
};
const BOX = { I: 4, O: 2, J: 3, L: 3, S: 3, T: 3, Z: 3 };   // O in a 2-box: rotating it is a true no-op
export const KINDS = Object.keys(SHAPES);

export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
export const spawn = (k) => ({ k, rot: 0, x: Math.floor((COLS - 4) / 2), y: 0 });

export function cells(p) {
  const n = BOX[p.k];
  let cs = SHAPES[p.k];
  for (let i = (((p.rot % 4) + 4) % 4); i > 0; i--) cs = cs.map(([r, c]) => [c, n - 1 - r]);
  return cs.map(([r, c]) => [r + p.y, c + p.x]);
}

export const valid = (b, p) =>
  cells(p).every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !b[r][c]);

export function shift(b, p, dx, dy) {
  const n = { ...p, x: p.x + dx, y: p.y + dy };
  return valid(b, n) ? n : null;
}

export function rotate(b, p, dir) {
  for (const dx of [0, -1, 1, -2, 2]) {          // basic wall kicks
    const n = { ...p, rot: p.rot + dir, x: p.x + dx };
    if (valid(b, n)) return n;
  }
  return null;
}

export function drop(b, p) {
  for (let q = p; ;) { const n = shift(b, q, 0, 1); if (!n) return q; q = n; }
}

export function lock(b, p) {
  const nb = b.map((r) => r.slice());
  for (const [r, c] of cells(p)) nb[r][c] = p.k;
  const kept = nb.filter((r) => r.some((x) => !x));
  const lines = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return { board: kept, lines };
}

export function metrics(b) {
  const heights = [];
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let top = ROWS;
    for (let r = 0; r < ROWS; r++) if (b[r][c]) { top = r; break; }
    heights.push(ROWS - top);
    for (let r = top + 1; r < ROWS; r++) if (!b[r][c]) holes++;
  }
  let bumpiness = 0;
  for (let c = 0; c < COLS - 1; c++) bumpiness += Math.abs(heights[c] - heights[c + 1]);
  return { heights, holes, maxHeight: Math.max(...heights), bumpiness };
}

// the piece after `move`, or null if the move is impossible
export function apply(b, p, move) {
  switch (move) {
    case 'left': return shift(b, p, -1, 0);
    case 'right': return shift(b, p, 1, 0);
    case 'rotate_cw': return rotate(b, p, 1);
    case 'rotate_ccw': return rotate(b, p, -1);
    case 'soft_drop': return shift(b, p, 0, 1);
    case 'hard_drop': return drop(b, p);
    case 'none': return p;
    default: return null;
  }
}

// Drop the piece from wherever it is and measure what that costs.
function outcome(b, q) {
  const before = metrics(b);
  const { board: nb, lines } = lock(b, drop(b, q));
  const after = metrics(nb);
  const landed = drop(b, q);
  const cs = cells(q).map(([, c]) => c);
  return {
    columns: [Math.min(...cs), Math.max(...cs)],
    lines_cleared: lines,
    new_holes_created: after.holes - before.holes,
    tallest_column_after: after.maxHeight,
    surface_roughness_after: after.bumpiness,
    // How deep into the well it settles. Bigger row = lower down = better.
    lands_on_row: Math.max(...cells(landed).map(([r]) => r)),
  };
}

// What actually happens if we take `move` and then let the piece fall.
// jev cannot count a grid reliably, so every number it sees is computed here.
export function preview(b, p, move) {
  const q = apply(b, p, move);
  return q ? outcome(b, q) : null;
}

// Every landing still reachable by turning the piece and then sliding it this way.
// Turn first, then walk: a flat I bar cannot slide to the far wall and stand up there,
// but it can stand up here and walk over. Without this the lookahead never finds the
// one placement that matters, and a single step looks no better than dropping.
export function reachable(b, p) {
  const out = [];
  for (let turns = 0; turns < 4; turns++) {
    const base = { ...p, rot: p.rot + turns };
    if (!valid(b, base)) continue;
    out.push({ ...outcome(b, base), steps: 0, turns, dx: 0 });   // turning on the spot counts
    for (const dx of [-1, 1]) {
      let q = base;
      for (let steps = 1; ; steps++) {
        const n = shift(b, q, dx, 0);
        if (!n) break;
        q = n;
        out.push({ ...outcome(b, q), steps, turns, dx });
      }
    }
  }
  return out;
}

// ponytail: fixed weights, good enough to rank reachable landings; tune if it plays badly
// lands_on_row matters most after holes and lines: tallest_column_after is board-wide, so
// filling a valley does not improve it and the depth of THIS piece would otherwise be ignored.
const cost = (o) => o.new_holes_created * 1000 - o.lines_cleared * 200
                  - o.lands_on_row * 15 + o.tallest_column_after * 5 + o.surface_roughness_after;

// ONE best landing over every direction and rotation, plus the single action that
// starts towards it. One target beats a hint per direction: two hints that each say
// "head this way" point opposite ways, and the piece ends up going nowhere.
export function bestPlan(b, p) {
  const all = reachable(b, p);
  if (!all.length) return null;
  const best = all.reduce((a, z) => (cost(z) < cost(a) ? z : a));
  best.next_action = best.turns ? (best.turns === 3 ? 'rotate_ccw' : 'rotate_cw')
    : best.dx < 0 ? 'left' : best.dx > 0 ? 'right' : 'hard_drop';
  best.actions_needed = best.steps + Math.min(best.turns, 4 - best.turns);
  return best;
}

// Rows that are partly filled AND still completable, nearest-to-complete first.
// A gap with any block above it is sealed: no piece can ever reach it, so a row
// containing one is dead until the rows above clear. Advertising those as "one
// square away" sends jev chasing lines that cannot be made.
export function rowGaps(b) {
  const covered = (r, c) => b.slice(0, r).some((row) => row[c]);
  return b
    .map((row, r) => ({ row: r, empty_columns: row.map((x, c) => (x ? -1 : c)).filter((c) => c >= 0) }))
    .filter((o) => o.empty_columns.length > 0 && o.empty_columns.length < COLS)
    .filter((o) => !o.empty_columns.some((c) => covered(o.row, c)))
    .sort((a, z) => a.empty_columns.length - z.empty_columns.length);
}

// Open notches in the surface: columns sitting below their neighbours, deepest first.
// These are the gaps a piece can still drop into. A hole already covered by a block
// is NOT here, because nothing can ever reach it.
export function wells(b) {
  const h = metrics(b).heights;
  const out = [];
  for (let c = 0; c < COLS; c++) {
    const depth = Math.min(c ? h[c - 1] : Infinity, c < COLS - 1 ? h[c + 1] : Infinity) - h[c];
    if (depth > 0) out.push({ column: c, depth, height: h[c] });
  }
  return out.sort((a, z) => z.depth - a.depth);
}

// Which piece kinds can drop into the dip at `col` without sealing anything.
// Simulated rather than guessed from width and depth, so the answer is exact.
export function fillers(b, col) {
  const before = metrics(b).holes;
  return KINDS.filter((k) => {
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -3; x < COLS; x++) {
        const p = { k, rot, x, y: 0 };
        if (!valid(b, p)) continue;
        const landed = drop(b, p);
        if (!cells(landed).some(([, c]) => c === col)) continue;   // must actually reach the dip
        if (metrics(lock(b, landed).board).holes <= before) return true;
      }
    }
    return false;
  });
}

// '+' is the landing shadow: where the piece stops if left alone. The canvas draws
// this as a faint ghost, so jev is shown the same thing the player sees.
export const render = (b, p) => {
  const g = b.map((r) => r.map((x) => (x ? '#' : '.')));
  if (p) {
    for (const [r, c] of cells(drop(b, p))) if (r >= 0) g[r][c] = '+';
    for (const [r, c] of cells(p)) if (r >= 0) g[r][c] = '@';
  }
  return g.map((r) => r.join(''));
};

// What the piece looks like now and after each turn, so jev can see the shape it
// would be choosing rather than having to imagine the rotation.
export function turnShapes(p) {
  const out = {};
  for (const [label, rot] of [['as_it_is_now', 0], ['after_rotate_cw', 1], ['after_rotate_ccw', -1]]) {
    const rows = shapeRows({ ...p, rot: p.rot + rot });
    out[label] = rows;
  }
  if (String(out.after_rotate_cw) === String(out.as_it_is_now)) return { as_it_is_now: out.as_it_is_now };
  if (String(out.after_rotate_ccw) === String(out.after_rotate_cw)) delete out.after_rotate_ccw;
  return out;
}

export const shapeRows = (p) => {
  const cs = cells({ ...p, x: 0, y: 0 });
  const rs = cs.map(([r]) => r), cols = cs.map(([, c]) => c);
  const r0 = Math.min(...rs), c0 = Math.min(...cols);
  const g = Array.from({ length: Math.max(...rs) - r0 + 1 }, () =>
    Array(Math.max(...cols) - c0 + 1).fill('.'));
  for (const [r, c] of cs) g[r - r0][c - c0] = '@';
  return g.map((r) => r.join(''));
};
