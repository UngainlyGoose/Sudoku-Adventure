// ============================================================
// puzzleGenerator — turns a solved grid into a playable puzzle
// with a UNIQUE solution (spec §2.5b, non-negotiable) rated
// into a difficulty band by the logical solver (spec §2.5c).
//
// Strategy: dig to a minimal unique puzzle, then restore givens
// one at a time until the human-technique solver can finish it.
// This lands puzzles right at the edge of the technique ceiling,
// which is exactly where the Hard band lives.
// ============================================================

import { generateSolvedGrid, shuffle } from './sudokuEngine.js';
import { hasUniqueSolution } from './solutionCounter.js';
import { rateAgainstBand } from './logicalSolver.js';
import { GENERATION_CONFIG } from '../config.js';

const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

// Remove cells in random order; a cell stays removed only if the puzzle
// still has exactly one solution afterward (spec §2.5b).
export function digToMinimal(solution, size, rng = Math.random) {
  const puzzle = solution.slice();
  const removed = [];
  const order = shuffle([...Array(size * size).keys()], rng);
  for (const idx of order) {
    const saved = puzzle[idx];
    puzzle[idx] = 0;
    if (hasUniqueSolution(puzzle, size)) {
      removed.push(idx);
    } else {
      puzzle[idx] = saved;
    }
  }
  return { puzzle, removed };
}

/**
 * Generate a puzzle whose logical-solve rating falls in `band`
 * ({ minRequiredTier, maxTier }). Async: yields to the event loop between
 * attempts so the UI stays responsive.
 *
 * Returns { solution, puzzle, rating, givens, attempts }.
 */
export async function generateRatedPuzzle(size, band, opts = {}) {
  const {
    rng = Math.random,
    relaxAfterAttempts = 24,
    relaxedMinTier = Math.max(1, band.minRequiredTier - 1),
    maxAttempts = GENERATION_CONFIG.maxBoardAttempts,
    onProgress = null,
  } = opts;

  let best = null; // hardest solvable puzzle seen so far (fallback)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = generateSolvedGrid(size, rng);
    const { puzzle, removed } = digToMinimal(solution, size, rng);

    // If the minimal puzzle is beyond the band's technique ceiling, restore
    // removed givens (uniqueness is preserved by adding clues) until the
    // logical solver can finish it.
    let rating = rateAgainstBand(puzzle, size, band);
    const restorable = shuffle(removed.slice(), rng);
    while (!rating.solved && restorable.length > 0) {
      const idx = restorable.pop();
      puzzle[idx] = solution[idx];
      rating = rateAgainstBand(puzzle, size, band);
    }

    if (rating.solved) {
      const minTier =
        attempt > relaxAfterAttempts ? Math.min(relaxedMinTier, band.minRequiredTier) : band.minRequiredTier;
      if (rating.hardestTier >= minTier) {
        return finish(solution, puzzle, rating, attempt);
      }
      if (!best || rating.hardestTier > best.rating.hardestTier) {
        best = { solution, puzzle: puzzle.slice(), rating };
      }
      if (attempt > relaxAfterAttempts && best.rating.hardestTier >= minTier) {
        return finish(best.solution, best.puzzle, best.rating, attempt);
      }
    }

    if (onProgress) onProgress(attempt, maxAttempts);
    if (attempt % GENERATION_CONFIG.yieldEveryAttempts === 0) await yieldToUI();
  }

  // Exhausted: ship the hardest fair puzzle we found rather than a broken one.
  if (best) return finish(best.solution, best.puzzle, best.rating, maxAttempts);
  throw new Error('puzzleGenerator: could not produce a solvable rated puzzle');
}

function finish(solution, puzzle, rating, attempts) {
  const givens = puzzle.filter((v) => v !== 0).length;
  return { solution, puzzle, rating, givens, attempts };
}
