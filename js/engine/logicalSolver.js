// ============================================================
// logicalSolver — solves using only human techniques (no brute
// force) and reports the hardest technique tier required.
// Drives difficulty rating (spec §2.5c). Technique→tier mapping
// lives in config (TECHNIQUE_TIERS).
// ============================================================

import { getStructure } from './sudokuEngine.js';
import { TECHNIQUE_TIERS } from '../config.js';

function popcount(x) {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

function bitsOf(mask) {
  const out = [];
  let d = 0;
  while (mask) {
    if (mask & 1) out.push(d);
    mask >>= 1;
    d++;
  }
  return out; // 0-based digit indices
}

// k-subsets of an array (k is 2 or 3 here; arrays are tiny)
function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

/**
 * Solve `grid` (flat array, 0=empty) using human techniques up to `maxTier`.
 * Returns:
 *   solved        — true if fully solved within the tier ceiling
 *   contradiction — a candidate set emptied out (invalid puzzle)
 *   grid          — final state (the solution when solved)
 *   hardestTier   — highest tier actually NEEDED during the solve
 *   techniques    — Set of technique names used
 */
export function solveLogically(grid, size, maxTier = 4) {
  const S = getStructure(size);
  const { peers, units, rows, cols, boxes, boxOf } = S;
  const n = size * size;
  const full = (1 << size) - 1;
  const work = grid.slice();
  const cands = new Int32Array(n);
  let emptyCount = 0;
  let contradiction = false;
  let hardestTier = 0;
  const techniques = new Set();

  for (let i = 0; i < n; i++) {
    if (work[i] !== 0) continue;
    emptyCount++;
    let mask = full;
    for (const p of peers[i]) {
      if (work[p] !== 0) mask &= ~(1 << (work[p] - 1));
    }
    cands[i] = mask;
    if (mask === 0) contradiction = true;
  }

  function place(idx, digit1based) {
    work[idx] = digit1based;
    cands[idx] = 0;
    emptyCount--;
    const bit = 1 << (digit1based - 1);
    for (const p of peers[idx]) {
      if (work[p] === 0 && (cands[p] & bit)) {
        cands[p] &= ~bit;
        if (cands[p] === 0) contradiction = true;
      }
    }
  }

  function eliminate(idx, bit) {
    if (work[idx] === 0 && (cands[idx] & bit)) {
      cands[idx] &= ~bit;
      if (cands[idx] === 0) contradiction = true;
      return true;
    }
    return false;
  }

  // ---- Tier 1 ----------------------------------------------------------

  function nakedSingle() {
    let progress = false;
    for (let i = 0; i < n; i++) {
      if (work[i] === 0 && popcount(cands[i]) === 1) {
        place(i, Math.log2(cands[i]) + 1);
        progress = true;
        if (contradiction) return progress;
      }
    }
    return progress;
  }

  function hiddenSingle() {
    for (const unit of units) {
      for (let d = 0; d < size; d++) {
        const bit = 1 << d;
        let pos = -1, count = 0, present = false;
        for (const idx of unit) {
          if (work[idx] === d + 1) { present = true; break; }
          if (work[idx] === 0 && (cands[idx] & bit)) { pos = idx; count++; }
        }
        if (present) continue;
        if (count === 1) {
          place(pos, d + 1);
          return true;
        }
      }
    }
    return false;
  }

  // ---- Tier 2 ----------------------------------------------------------

  function lockedCandidates() {
    // Pointing: digit confined to one row/col within a box → eliminate from
    // the rest of that row/col outside the box.
    for (let b = 0; b < boxes.length; b++) {
      for (let d = 0; d < size; d++) {
        const bit = 1 << d;
        const positions = boxes[b].filter((i) => work[i] === 0 && (cands[i] & bit));
        if (positions.length < 2) continue;
        const rs = new Set(positions.map((i) => Math.floor(i / size)));
        const cs = new Set(positions.map((i) => i % size));
        let progress = false;
        if (rs.size === 1) {
          const r = [...rs][0];
          for (const idx of rows[r]) {
            if (boxOf[idx] !== b) progress = eliminate(idx, bit) || progress;
          }
        } else if (cs.size === 1) {
          const c = [...cs][0];
          for (const idx of cols[c]) {
            if (boxOf[idx] !== b) progress = eliminate(idx, bit) || progress;
          }
        }
        if (progress) return true;
      }
    }
    // Claiming: digit confined to one box within a row/col → eliminate from
    // the rest of that box.
    for (const lineSet of [rows, cols]) {
      for (const line of lineSet) {
        for (let d = 0; d < size; d++) {
          const bit = 1 << d;
          const positions = line.filter((i) => work[i] === 0 && (cands[i] & bit));
          if (positions.length < 2) continue;
          const bs = new Set(positions.map((i) => boxOf[i]));
          if (bs.size !== 1) continue;
          const b = [...bs][0];
          let progress = false;
          for (const idx of boxes[b]) {
            if (!line.includes(idx)) progress = eliminate(idx, bit) || progress;
          }
          if (progress) return true;
        }
      }
    }
    return false;
  }

  function nakedSubset(k) {
    for (const unit of units) {
      const empties = unit.filter((i) => work[i] === 0 && popcount(cands[i]) <= k);
      if (empties.length < k) continue;
      for (const combo of combinations(empties, k)) {
        let union = 0;
        for (const i of combo) union |= cands[i];
        if (popcount(union) !== k) continue;
        let progress = false;
        for (const idx of unit) {
          if (work[idx] !== 0 || combo.includes(idx)) continue;
          for (const d of bitsOf(union & cands[idx])) {
            progress = eliminate(idx, 1 << d) || progress;
          }
        }
        if (progress) return true;
      }
    }
    return false;
  }

  function hiddenSubset(k) {
    for (const unit of units) {
      // digits not yet placed in this unit, with their candidate positions
      const digitPositions = [];
      for (let d = 0; d < size; d++) {
        const bit = 1 << d;
        if (unit.some((i) => work[i] === d + 1)) continue;
        const pos = unit.filter((i) => work[i] === 0 && (cands[i] & bit));
        if (pos.length >= 1 && pos.length <= k) digitPositions.push({ d, pos });
      }
      if (digitPositions.length < k) continue;
      for (const combo of combinations(digitPositions, k)) {
        const cellSet = new Set();
        for (const { pos } of combo) pos.forEach((i) => cellSet.add(i));
        if (cellSet.size !== k) continue;
        const keepMask = combo.reduce((m, { d }) => m | (1 << d), 0);
        let progress = false;
        for (const idx of cellSet) {
          for (const d of bitsOf(cands[idx] & ~keepMask)) {
            progress = eliminate(idx, 1 << d) || progress;
          }
        }
        if (progress) return true;
      }
    }
    return false;
  }

  // ---- Tier 3/4: fish (X-wing n=2, swordfish n=3) -----------------------

  function fish(nSize) {
    for (const [baseLines, coverLines, coverCoord] of [
      [rows, cols, (i) => i % size],
      [cols, rows, (i) => Math.floor(i / size)],
    ]) {
      for (let d = 0; d < size; d++) {
        const bit = 1 << d;
        const candidateLines = [];
        for (let li = 0; li < baseLines.length; li++) {
          const pos = baseLines[li].filter((i) => work[i] === 0 && (cands[i] & bit));
          if (pos.length >= 2 && pos.length <= nSize) {
            candidateLines.push({ li, coverIdxs: new Set(pos.map(coverCoord)) });
          }
        }
        if (candidateLines.length < nSize) continue;
        for (const combo of combinations(candidateLines, nSize)) {
          const coverSet = new Set();
          for (const { coverIdxs } of combo) coverIdxs.forEach((c) => coverSet.add(c));
          if (coverSet.size !== nSize) continue;
          const baseSet = new Set(combo.map(({ li }) => li));
          let progress = false;
          for (const c of coverSet) {
            for (const idx of coverLines[c]) {
              const baseCoord = baseLines === rows ? Math.floor(idx / size) : idx % size;
              if (baseSet.has(baseCoord)) continue;
              progress = eliminate(idx, bit) || progress;
            }
          }
          if (progress) return true;
        }
      }
    }
    return false;
  }

  // ---- Tier 4: XY-wing --------------------------------------------------

  function xyWing() {
    const bivalue = [];
    for (let i = 0; i < n; i++) {
      if (work[i] === 0 && popcount(cands[i]) === 2) bivalue.push(i);
    }
    for (const pivot of bivalue) {
      const pm = cands[pivot];
      const pincers = peers[pivot].filter(
        (p) => work[p] === 0 && popcount(cands[p]) === 2 && (cands[p] & pm) && cands[p] !== pm
      );
      for (let a = 0; a < pincers.length; a++) {
        for (let b = a + 1; b < pincers.length; b++) {
          const A = pincers[a], B = pincers[b];
          // pincers must share exactly one digit z, which is NOT in the pivot,
          // and together with the pivot cover exactly 3 digits {x, y, z}
          const shared = cands[A] & cands[B] & ~pm;
          if (popcount(shared) !== 1) continue;
          if (popcount(cands[A] | cands[B] | pm) !== 3) continue;
          const peersA = new Set(peers[A]);
          let progress = false;
          for (const idx of peers[B]) {
            if (idx !== pivot && idx !== A && peersA.has(idx)) {
              progress = eliminate(idx, shared) || progress;
            }
          }
          if (progress) return true;
        }
      }
    }
    return false;
  }

  // ---- Main loop: cheapest technique first ------------------------------

  const techniqueList = [
    { name: 'nakedSingle', fn: nakedSingle },
    { name: 'hiddenSingle', fn: hiddenSingle },
    { name: 'lockedCandidates', fn: lockedCandidates },
    { name: 'nakedPair', fn: () => nakedSubset(2) },
    { name: 'hiddenPair', fn: () => hiddenSubset(2) },
    { name: 'nakedTriple', fn: () => nakedSubset(3) },
    { name: 'hiddenTriple', fn: () => hiddenSubset(3) },
    { name: 'xWing', fn: () => fish(2) },
    { name: 'xyWing', fn: xyWing },
    { name: 'swordfish', fn: () => fish(3) },
  ].filter(({ name }) => TECHNIQUE_TIERS[name] <= maxTier);

  while (!contradiction && emptyCount > 0) {
    let progressed = false;
    for (const { name, fn } of techniqueList) {
      if (fn()) {
        techniques.add(name);
        hardestTier = Math.max(hardestTier, TECHNIQUE_TIERS[name]);
        progressed = true;
        break; // restart from the cheapest technique
      }
      if (contradiction) break;
    }
    if (!progressed) break;
  }

  return {
    solved: !contradiction && emptyCount === 0,
    contradiction,
    grid: work,
    hardestTier,
    techniques,
  };
}

/**
 * Rate a puzzle against a difficulty band (spec §2.5c).
 * A puzzle is in-band when the solver can FULLY solve it without exceeding
 * band.maxTier, and the solve genuinely NEEDED at least band.minRequiredTier.
 */
export function rateAgainstBand(grid, size, band) {
  const result = solveLogically(grid, size, band.maxTier);
  return {
    inBand: result.solved && result.hardestTier >= band.minRequiredTier,
    solved: result.solved,
    hardestTier: result.hardestTier,
    techniques: result.techniques,
  };
}
