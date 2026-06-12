// ============================================================
// killerGenerator — Killer Sudoku sub-puzzles (spec §7).
// No givens; the grid is partitioned into cages, each labeled
// with the sum of its digits. Digits may not repeat in a cage.
//
// Uniqueness strategy: random partitions are almost never
// unique, so instead we BUILD uniqueness in. Start from all
// 1-cell cages (sum = digit → trivially unique) and repeatedly
// merge random adjacent cages, keeping a merge only if the
// puzzle still has exactly one solution. Merging stops at a
// target cage count (difficulty calibration) or when the time
// budget runs out — the result is unique at every step.
// ============================================================

import { generateSolvedGrid, getStructure } from './sudokuEngine.js';
import { KILLER_CONFIG } from '../config.js';

function orthogonalNeighbors(idx, size) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0) out.push(idx - size);
  if (r < size - 1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size - 1) out.push(idx + 1);
  return out;
}

// Count solutions of a killer puzzle (no givens) up to `limit`, with a node
// budget so expensive proofs get rejected instead of hanging the page.
export function countKillerSolutions(size, cages, limit = 2, nodeBudget = KILLER_CONFIG.uniquenessNodeBudget) {
  const { peers } = getStructure(size);
  const n = size * size;
  const full = (1 << size) - 1;
  const work = new Array(n).fill(0);

  const cageOf = new Array(n).fill(-1);
  cages.forEach((cage, ci) => cage.cells.forEach((i) => (cageOf[i] = ci)));
  const remSum = cages.map((c) => c.sum);
  const remCount = cages.map((c) => c.cells.length);
  const usedMask = cages.map(() => 0);

  let nodes = 0;
  let aborted = false;

  function popcount(x) {
    let c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
  }

  // Bounds for the other (count-1) cells of the cage given digits still
  // available to it — prunes hard enough to keep no-given searches fast.
  function valueFeasible(ci, v) {
    const rs = remSum[ci];
    const rc = remCount[ci];
    if (rc === 1) return v === rs;
    if (v >= rs) return false;
    const avail = full & ~usedMask[ci] & ~(1 << (v - 1));
    const restCount = rc - 1;
    if (popcount(avail) < restCount) return false;
    let min = 0, max = 0, picked = 0;
    for (let d = 1; d <= size && picked < restCount; d++) {
      if (avail & (1 << (d - 1))) { min += d; picked++; }
    }
    picked = 0;
    for (let d = size; d >= 1 && picked < restCount; d--) {
      if (avail & (1 << (d - 1))) { max += d; picked++; }
    }
    const rest = rs - v;
    return rest >= min && rest <= max;
  }

  function candidatesFor(idx) {
    let mask = full;
    for (const p of peers[idx]) {
      if (work[p] !== 0) mask &= ~(1 << (work[p] - 1));
    }
    mask &= ~usedMask[cageOf[idx]];
    let out = 0;
    let m = mask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      const v = Math.log2(bit) + 1;
      if (valueFeasible(cageOf[idx], v)) out |= bit;
    }
    return out;
  }

  function search() {
    if (++nodes > nodeBudget) { aborted = true; return 0; }
    let best = -1, bestMask = 0, bestCount = size + 1;
    for (let i = 0; i < n; i++) {
      if (work[i] !== 0) continue;
      const mask = candidatesFor(i);
      const pc = popcount(mask);
      if (pc === 0) return 0;
      if (pc < bestCount) { bestCount = pc; best = i; bestMask = mask; if (pc === 1) break; }
    }
    if (best === -1) return 1;

    let count = 0;
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      const v = Math.log2(bit) + 1;
      const ci = cageOf[best];
      work[best] = v;
      usedMask[ci] |= bit;
      remSum[ci] -= v;
      remCount[ci] -= 1;
      count += search();
      work[best] = 0;
      usedMask[ci] &= ~bit;
      remSum[ci] += v;
      remCount[ci] += 1;
      if (aborted || count >= limit) return count;
    }
    return count;
  }

  const count = search();
  return { count: Math.min(count, limit), aborted };
}

/**
 * Generate a killer sub-puzzle: { size, cages: [{cells, sum}], solution }.
 * Unique by construction (see header comment). Async: yields to the event
 * loop between uniqueness checks so the UI stays responsive.
 */
export async function generateKillerPuzzle(size, rng = Math.random) {
  const yieldToUI = () => new Promise((r) => setTimeout(r, 0));
  const solution = generateSolvedGrid(size, rng);
  const n = size * size;

  // cage id per cell; cage data keyed by id
  const cageOf = [...Array(n).keys()];
  const cages = new Map();
  for (let i = 0; i < n; i++) cages.set(i, { cells: [i], values: new Set([solution[i]]) });

  const snapshot = () =>
    [...cages.values()].map(({ cells }) => ({
      cells: cells.slice().sort((a, b) => a - b),
      sum: cells.reduce((s, i) => s + solution[i], 0),
    }));

  const blacklist = new Set();
  const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  function eligiblePairs() {
    const seen = new Set();
    const pairs = [];
    for (const [id, cage] of cages) {
      for (const cell of cage.cells) {
        for (const nb of orthogonalNeighbors(cell, size)) {
          const other = cageOf[nb];
          if (other === id) continue;
          const key = pairKey(id, other);
          if (seen.has(key) || blacklist.has(key)) continue;
          seen.add(key);
          const oc = cages.get(other);
          if (cage.cells.length + oc.cells.length > KILLER_CONFIG.maxCageSize) continue;
          let clash = false;
          for (const v of oc.values) if (cage.values.has(v)) { clash = true; break; }
          if (!clash) pairs.push([id, other, key]);
        }
      }
    }
    return pairs;
  }

  const targetCageCount = Math.ceil(n * KILLER_CONFIG.targetCageFraction);
  const deadline = Date.now() + KILLER_CONFIG.mergeTimeBudgetMs;
  let checksSinceYield = 0;

  while (cages.size > targetCageCount && Date.now() < deadline) {
    let pairs = eligiblePairs();
    if (pairs.length === 0) break;
    // Prefer absorbing 1-cell cages: each leftover single's sum is a free
    // digit, which undercuts the intended difficulty.
    const singlePairs = pairs.filter(
      ([a, b]) => cages.get(a).cells.length === 1 || cages.get(b).cells.length === 1
    );
    if (singlePairs.length > 0 && rng() < 0.85) pairs = singlePairs;
    const [a, b, key] = pairs[Math.floor(rng() * pairs.length)];

    // tentative merge of b into a
    const cageA = cages.get(a);
    const cageB = cages.get(b);
    const backupCells = cageB.cells.slice();
    for (const cell of backupCells) {
      cageA.cells.push(cell);
      cageA.values.add(solution[cell]);
      cageOf[cell] = a;
    }
    cages.delete(b);

    const { count, aborted } = countKillerSolutions(size, snapshot(), 2);
    if (aborted || count !== 1) {
      // revert — the pre-merge partition was verified unique
      for (const cell of backupCells) {
        const at = cageA.cells.indexOf(cell);
        cageA.cells.splice(at, 1);
        cageA.values.delete(solution[cell]);
        cageOf[cell] = b;
      }
      cages.set(b, cageB);
      blacklist.add(key);
    }

    if (++checksSinceYield >= 4) {
      checksSinceYield = 0;
      await yieldToUI();
    }
  }

  return { size, cages: snapshot(), solution };
}
