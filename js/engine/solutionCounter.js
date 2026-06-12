// ============================================================
// solutionCounter — counts solutions of a (possibly partial)
// grid, stopping at `limit` (2 is enough to reject non-unique
// puzzles). Spec §2.5b: THE non-negotiable rule.
// Bitmask + MRV (fewest-candidates-first) backtracking.
// ============================================================

import { getStructure } from './sudokuEngine.js';

const FULL_MASK = (size) => (1 << size) - 1;

function popcount(x) {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

// Counts solutions up to `limit`. Optional `nodeBudget` aborts long searches
// (returns { count, aborted: true }) — used by killer generation retries.
export function countSolutions(grid, size, limit = 2, nodeBudget = Infinity) {
  const { peers } = getStructure(size);
  const n = size * size;
  const full = FULL_MASK(size);
  const work = grid.slice();
  let nodes = 0;
  let aborted = false;

  // candidate mask per cell, maintained incrementally
  const cands = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (work[i] !== 0) { cands[i] = 0; continue; }
    let mask = full;
    for (const p of peers[i]) {
      if (work[p] !== 0) mask &= ~(1 << (work[p] - 1));
    }
    if (mask === 0) return { count: 0, aborted: false }; // contradiction
    cands[i] = mask;
  }

  function search() {
    if (++nodes > nodeBudget) { aborted = true; return 0; }
    // MRV: pick the empty cell with the fewest candidates
    let best = -1, bestCount = size + 1;
    for (let i = 0; i < n; i++) {
      if (work[i] !== 0) continue;
      const pc = popcount(cands[i]);
      if (pc === 0) return 0; // dead end
      if (pc < bestCount) { bestCount = pc; best = i; if (pc === 1) break; }
    }
    if (best === -1) return 1; // all filled — one solution found

    let count = 0;
    let mask = cands[best];
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      const d = Math.log2(bit) + 1;
      // place d, record peer-candidate changes for undo
      work[best] = d;
      const touched = [];
      let dead = false;
      for (const p of peers[best]) {
        if (work[p] === 0 && (cands[p] & bit)) {
          cands[p] &= ~bit;
          touched.push(p);
          if (cands[p] === 0) dead = true;
        }
      }
      if (!dead) {
        count += search();
        if (aborted || count >= limit) {
          // undo before bailing out
          for (const p of touched) cands[p] |= bit;
          work[best] = 0;
          return count;
        }
      }
      for (const p of touched) cands[p] |= bit;
      work[best] = 0;
    }
    return count;
  }

  const count = search();
  return { count: Math.min(count, limit), aborted };
}

// Convenience: does this puzzle have exactly one solution?
export function hasUniqueSolution(grid, size) {
  const { count, aborted } = countSolutions(grid, size, 2);
  return !aborted && count === 1;
}
