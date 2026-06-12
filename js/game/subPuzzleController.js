// ============================================================
// subPuzzleController — launches sub-puzzles in isolation and
// validates completion (spec §7). Sub-puzzles are independent
// of the main board (invariant #3): their only output is
// success/abandon, which the caller maps to a typed reward.
// ============================================================

import { activeTier } from '../config.js';
import { generateRatedPuzzle } from '../engine/puzzleGenerator.js';
import { generateKillerPuzzle } from '../engine/killerGenerator.js';
import { gridsEqual } from '../engine/sudokuEngine.js';

const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

async function buildSubPuzzle(rng) {
  const cfg = activeTier().subPuzzle;
  const isKiller = rng() < cfg.killerWeight;

  if (isKiller) {
    await yieldToUI(); // let whatever spinner is up paint first
    const killer = await generateKillerPuzzle(cfg.size, rng);
    return {
      type: 'killer',
      size: cfg.size,
      puzzle: new Array(cfg.size * cfg.size).fill(0), // killer has no givens
      solution: killer.solution,
      cages: killer.cages,
    };
  }

  const normal = await generateRatedPuzzle(cfg.size, cfg.band, { rng, maxAttempts: 40 });
  return {
    type: 'normal',
    size: cfg.size,
    puzzle: normal.puzzle,
    solution: normal.solution,
    cages: null,
  };
}

// One-slot prefetch cache: killer generation can take a few seconds, so the
// next sub-puzzle is forged in the background while the player works the main
// board. Sub-puzzles are independent of the main board (invariant #3), so a
// cached one is indistinguishable from a fresh one.
let cached = null;
let pending = null;

export function prefetchSubPuzzle(rng = Math.random) {
  if (cached || pending) return;
  pending = buildSubPuzzle(rng)
    .then((sub) => { cached = sub; })
    .catch(() => {}) // a failed prefetch just means we generate on demand
    .finally(() => { pending = null; });
}

/**
 * Get a sub-puzzle per the active tier's size, type weighting, and difficulty
 * band (Hard: 9×9, lean killer, Medium-band — spec §5). Uses the prefetched
 * one when available, then immediately starts forging the next.
 * Returns { type: 'normal'|'killer', size, puzzle, solution, cages? }.
 */
export async function createSubPuzzle(rng = Math.random) {
  if (pending) await pending;
  let sub = cached;
  cached = null;
  if (!sub) sub = await buildSubPuzzle(rng);
  prefetchSubPuzzle(rng);
  return sub;
}

// Success means the completed grid matches the sub-puzzle's own solution
// (§7 — and since sub-puzzles are verified unique, any valid completion IS
// that solution).
export function isSubPuzzleSolved(subPuzzle, board) {
  return gridsEqual(board, subPuzzle.solution);
}
