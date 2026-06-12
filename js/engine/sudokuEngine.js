// ============================================================
// sudokuEngine — solved-board generation + structural helpers
// for any supported size (4, 6, 9). Spec §2, §7, §9.
// Grids are flat arrays of length size*size; 0 = empty.
// ============================================================

export const SIZE_CONFIGS = {
  4: { boxRows: 2, boxCols: 2 },
  6: { boxRows: 2, boxCols: 3 }, // boxes are 2 rows × 3 columns (spec §7)
  9: { boxRows: 3, boxCols: 3 },
};

const structureCache = new Map();

// Precomputed structure for a board size: units (rows, cols, boxes),
// peers per cell, and box index per cell. Cached per size.
export function getStructure(size) {
  if (structureCache.has(size)) return structureCache.get(size);
  const { boxRows, boxCols } = SIZE_CONFIGS[size];
  const n = size * size;
  const rows = [], cols = [], boxes = [];
  for (let i = 0; i < size; i++) {
    rows.push([]);
    cols.push([]);
    boxes.push([]);
  }
  const boxOf = new Array(n);
  for (let idx = 0; idx < n; idx++) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const b = Math.floor(r / boxRows) * (size / boxCols) + Math.floor(c / boxCols);
    boxOf[idx] = b;
    rows[r].push(idx);
    cols[c].push(idx);
    boxes[b].push(idx);
  }
  const units = [...rows, ...cols, ...boxes];
  const peers = [];
  for (let idx = 0; idx < n; idx++) {
    const set = new Set();
    const r = Math.floor(idx / size);
    const c = idx % size;
    for (const p of rows[r]) set.add(p);
    for (const p of cols[c]) set.add(p);
    for (const p of boxes[boxOf[idx]]) set.add(p);
    set.delete(idx);
    peers.push([...set]);
  }
  const structure = { size, boxRows, boxCols, rows, cols, boxes, units, peers, boxOf };
  structureCache.set(size, structure);
  return structure;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate one complete, valid, fully-solved board (the hidden solution,
// spec §2) via backtracking with randomized digit order. With ~6.7e21
// valid 9×9 grids, boards are functionally never-repeating (§2.5a).
export function generateSolvedGrid(size, rng = Math.random) {
  const { peers } = getStructure(size);
  const n = size * size;
  const grid = new Array(n).fill(0);
  const digits = [];
  for (let d = 1; d <= size; d++) digits.push(d);

  function fill(idx) {
    if (idx === n) return true;
    const tryOrder = shuffle(digits.slice(), rng);
    for (const d of tryOrder) {
      let ok = true;
      for (const p of peers[idx]) {
        if (grid[p] === d) { ok = false; break; }
      }
      if (ok) {
        grid[idx] = d;
        if (fill(idx + 1)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

// Is placing `val` at `idx` legal given the current grid (ignoring idx itself)?
export function isLegalPlacement(grid, size, idx, val) {
  const { peers } = getStructure(size);
  for (const p of peers[idx]) {
    if (grid[p] === val) return false;
  }
  return true;
}

// Real-time validation (spec §4.3, §8): return the set of cell indices that
// participate in a row/column/box duplicate.
export function findConflicts(grid, size) {
  const { units } = getStructure(size);
  const conflicts = new Set();
  for (const unit of units) {
    const dupes = new Map(); // digit -> all idxs
    for (const idx of unit) {
      const v = grid[idx];
      if (v === 0) continue;
      if (!dupes.has(v)) dupes.set(v, []);
      dupes.get(v).push(idx);
    }
    for (const [, idxs] of dupes) {
      if (idxs.length > 1) idxs.forEach((i) => conflicts.add(i));
    }
  }
  return conflicts;
}

export function gridsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
