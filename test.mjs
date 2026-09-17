// node test.mjs — fails loudly if the rules or the numbers we feed jev break
import assert from 'node:assert/strict';
import { emptyBoard, spawn, cells, drop, lock, metrics, rotate, preview, bestPlan, rowGaps, turnShapes, wells, fillers, COLS, ROWS } from './tetris.js';

// an O piece dropped from spawn lands on the floor
const o = drop(emptyBoard(), spawn('O'));
assert.deepEqual(cells(o).map(([r]) => r).sort(), [ROWS - 2, ROWS - 2, ROWS - 1, ROWS - 1]);

// a row missing two cells clears once an O fills them
let b = emptyBoard();
for (let c = 2; c < COLS; c++) b[ROWS - 1][c] = 'X';
const res = lock(b, drop(b, { k: 'O', rot: 0, x: 0, y: 0 }));
assert.equal(res.lines, 1, 'bottom row should clear');
assert.equal(metrics(res.board).heights[0], 1, 'the O leaves one row behind');

// I rotates from flat to vertical: 4 cells in one column
const i = rotate(emptyBoard(), spawn('I'), 1);
assert.equal(cells(i).length, 4);
assert.equal(new Set(cells(i).map(([, c]) => c)).size, 1, 'vertical I occupies one column');

// a covered gap counts as a hole
b = emptyBoard();
b[ROWS - 1][0] = 'X'; b[ROWS - 3][0] = 'X';
assert.equal(metrics(b).holes, 1);

// preview reports the holes a move would create
b = emptyBoard();
for (let r = ROWS - 4; r < ROWS; r++) b[r][0] = 'X';        // 4-high wall in column 0
const spawnCols = cells(spawn('O')).map((x) => x[1]);
assert.deepEqual(preview(b, spawn('O'), 'none').columns, [Math.min(...spawnCols), Math.max(...spawnCols)]);
assert.equal(preview(b, spawn('O'), 'none').new_holes_created, 0, 'clear of the wall');
assert.equal(preview(b, { k: 'O', rot: 0, x: 0, y: 0 }, 'none').new_holes_created, 4,
  'an O bridging the wall buries column 1');

// impossible moves report null
assert.equal(preview(emptyBoard(), { k: 'O', rot: 0, x: 0, y: 0 }, 'left'), null);  // already at the wall

// rowGaps ranks partly-filled rows by how close they are to completing
{
  const g = emptyBoard();
  for (let c = 0; c < COLS - 1; c++) g[ROWS - 1][c] = 'X';   // needs 1
  for (let c = 0; c < COLS - 3; c++) g[ROWS - 2][c] = 'X';   // needs 3
  const gaps = rowGaps(g);
  assert.deepEqual(gaps.map((o) => o.row), [ROWS - 1, ROWS - 2], 'closest row first');
  assert.deepEqual(gaps[0].empty_columns, [COLS - 1]);
  assert.equal(gaps[1].empty_columns.length, 3);
  assert.equal(rowGaps(emptyBoard()).length, 0, 'empty rows are not "close"');
}

// ahead() finds a good landing several steps away that one step cannot see
{
  const g = emptyBoard();
  for (let c = 0; c < COLS; c++) { g[ROWS-1][c] = 'X'; g[ROWS-2][c] = 'X'; }
  g[ROWS-1][0] = g[ROWS-1][1] = null;
  g[ROWS-2][0] = g[ROWS-2][1] = null;                 // a clean 2x2 well at the far left
  const p = spawn('O');                               // spawns mid-board, 4 columns away
  assert.equal(preview(g, p, 'left').lines_cleared, 0, 'one step left clears nothing, so it looks no better than dropping');
  const a = bestPlan(g, p);
  assert.equal(a.columns[0], 0, 'best reachable landing is the well at column 0');
  assert.equal(a.lines_cleared, 2, 'filling it clears both rows');
  assert.equal(a.steps, cells(p).map((x) => x[1]).sort((m, n) => m - n)[0], 'reported as N steps away');
  assert.equal(bestPlan(g, p) !== null, true, 'a plan always exists');
}

// rowGaps hides rows whose gaps are sealed under blocks: they cannot be completed
{
  const g = emptyBoard();
  for (let c = 0; c < COLS; c++) { g[ROWS-1][c] = 'X'; g[ROWS-3][c] = 'X'; }
  g[ROWS-1][4] = null;                                 // gap buried under row ROWS-3
  g[ROWS-2][7] = null; g[ROWS-2][8] = null;            // also buried
  assert.equal(rowGaps(g).some((o) => o.row === ROWS-1), false, 'buried gap is not "close"');
  assert.equal(rowGaps(g).some((o) => o.row === ROWS-2), false, 'buried row is not "close"');
  g[ROWS-3][4] = null;                                 // uncover the column-4 gap
  assert.equal(rowGaps(g).some((o) => o.row === ROWS-1), true, 'now reachable from above');
}

// lands_on_row grows as the piece settles deeper, and turnShapes dedupes by symmetry
{
  const g = emptyBoard();
  for (let r = ROWS-5; r < ROWS; r++) g[r][0] = g[r][1] = 'X';   // 5-high wall, columns 0-1
  const onWall = preview(g, { k:'O', rot:0, x:-1, y:0 }, 'none');
  const onFloor = preview(g, spawn('O'), 'none');
  assert.equal(onFloor.lands_on_row > onWall.lands_on_row, true, 'the floor is lower than the wall top');
  assert.equal(onFloor.lands_on_row, ROWS - 1, 'reaches the floor');

  assert.deepEqual(Object.keys(turnShapes({ k:'O', rot:0, x:0, y:0 })), ['as_it_is_now'], 'O has one shape');
  assert.deepEqual(Object.keys(turnShapes({ k:'I', rot:0, x:0, y:0 })), ['as_it_is_now','after_rotate_cw'],
    'I has two, cw and ccw give the same bar');
  assert.equal(Object.keys(turnShapes({ k:'T', rot:0, x:0, y:0 })).length, 3, 'T shows now, cw and ccw');
}

// ahead() must walk towards low ground, not settle on the mountain it is standing on
{
  const g = emptyBoard();
  for (let r = ROWS-8; r < ROWS; r++) for (let c = 4; c <= 7; c++) g[r][c] = 'X';  // mountain mid-board
  const p = { k: 'O', rot: 0, x: 4, y: 0 };            // sitting on top of the mountain
  const here = preview(g, p, 'none');
  const west = bestPlan(g, p);
  assert.equal(here.lands_on_row, ROWS - 9, 'dropping now lands on the mountain top');
  assert.equal(west.lands_on_row, ROWS - 1, 'the flat ground to the west reaches the floor');
  assert.equal(west.lands_on_row > here.lands_on_row, true, 'lookahead finds the lower ground');
}

// wells() finds the dips a piece can still drop into, deepest first, edges included
{
  const g = emptyBoard();
  for (let r = ROWS-6; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r][c] = 'X';
  for (let r = ROWS-6; r < ROWS; r++) g[r][3] = null;        // a 6-deep shaft at column 3
  g[ROWS-6][9] = null;                                       // a 1-deep dip at column 9
  const w = wells(g);
  assert.equal(w[0].column, 3, 'deepest dip first');
  assert.equal(w[0].depth, 6);
  assert.equal(w.some((o) => o.column === 9 && o.depth === 1), true, 'shallow dip also listed');
  assert.equal(w.some((o) => o.column === 0), false, 'a flat edge column is not a dip');
  assert.equal(wells(emptyBoard()).length, 0, 'a flat board has no dips');
}

// fillers() says which pieces can drop into a dip without sealing anything
{
  const g = emptyBoard();
  for (let r = ROWS-4; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r][c] = 'X';
  for (let r = ROWS-4; r < ROWS; r++) g[r][5] = null;          // 1 wide, 4 deep shaft
  assert.deepEqual(fillers(g, 5), ['I'], 'only a vertical I reaches the bottom of a 4-deep shaft');

  const f = emptyBoard();
  for (let r = ROWS-2; r < ROWS; r++) for (let c = 0; c < COLS; c++) f[r][c] = 'X';
  f[ROWS-2][4] = f[ROWS-2][5] = null;                          // 2 wide, 1 deep notch
  assert.equal(fillers(f, 4).length, 7, 'a 1-deep notch takes any piece: nothing is trapped under it');
}

// A flat I bar must discover that turning upright fills a one-wide well on the side
{
  const g = emptyBoard();
  for (let r = ROWS-4; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r][c] = 'X';
  for (let r = ROWS-4; r < ROWS; r++) g[r][COLS-1] = null;    // 1 wide, 4 deep well, far right
  const p = spawn('I');                                       // horizontal, mid-board
  const a = bestPlan(g, p);
  assert.equal(a.turns > 0, true, 'it must be turned upright first');
  assert.deepEqual(a.columns, [COLS-1, COLS-1], 'it stands up in the well');
  assert.equal(a.lands_on_row, ROWS-1, 'and reaches the floor');
  assert.equal(a.lines_cleared, 4, 'filling the well completes all four rows');
}
console.log('ok')
