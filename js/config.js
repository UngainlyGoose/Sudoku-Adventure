// ============================================================
// Sudoku Adventure — central configuration (spec §5, §6, §6.5)
// Difficulty is a SINGLE value (ACTIVE_DIFFICULTY); everything
// else derives from the tier table. Re-enabling other tiers
// later is a config change, not a code hunt.
// ============================================================

// Technique tiers used by the logical solver / difficulty rating (§2.5c).
// Tier numbers are referenced by the bands below.
//   1: naked single, hidden single
//   2: locked candidates (pointing/claiming), naked pair, hidden pair
//   3: naked triple, hidden triple, X-wing
//   4: XY-wing, swordfish
export const TECHNIQUE_TIERS = {
  nakedSingle: 1,
  hiddenSingle: 1,
  lockedCandidates: 2,
  nakedPair: 2,
  hiddenPair: 2,
  nakedTriple: 3,
  hiddenTriple: 3,
  xWing: 3,
  xyWing: 4,
  swordfish: 4,
};

// The one knob. v1 ships Hard only (no difficulty-select UI).
export const ACTIVE_DIFFICULTY = 'hard';

export const DIFFICULTY_TIERS = {
  // Defined but INACTIVE in v1 (spec §5) — do not expose in UI.
  easy: {
    label: 'Easy',
    mainBoard: {
      size: 9, // 9x9 main board in all tiers; difficulty differs by band
      band: { minRequiredTier: 1, maxTier: 1 },
      relaxAfterAttempts: 20,
      relaxedMinTier: 1,
    },
    subPuzzle: { size: 4, killerWeight: 0.2, band: { minRequiredTier: 1, maxTier: 1 } },
    specialCells: { min: 2, max: 3 },
  },
  medium: {
    label: 'Medium',
    mainBoard: {
      size: 9,
      band: { minRequiredTier: 2, maxTier: 2 },
      relaxAfterAttempts: 20,
      relaxedMinTier: 1,
    },
    subPuzzle: { size: 6, killerWeight: 0.5, band: { minRequiredTier: 1, maxTier: 2 } },
    specialCells: { min: 3, max: 4 },
  },
  // ACTIVE — build & tune this (spec §5).
  // NOTE (user decision 2026-06-12): the spec's original "11–13 givens" is
  // mathematically impossible with a unique solution (proven 17-clue minimum).
  // Hard instead digs to a minimal unique puzzle (~22–26 givens) and enforces
  // difficulty via the technique band: the rating solver must NEED a tier-3
  // technique and may use up to tier 4.
  hard: {
    label: 'Hard',
    mainBoard: {
      size: 9,
      band: { minRequiredTier: 3, maxTier: 4 },
      relaxAfterAttempts: 24, // after this many rejected boards, accept tier-2+
      relaxedMinTier: 2,
    },
    subPuzzle: {
      size: 9,
      killerWeight: 0.65, // "lean killer"
      // User decision: sub-puzzles are MEDIUM — a real but moderate challenge.
      band: { minRequiredTier: 2, maxTier: 2 },
    },
    specialCells: { min: 3, max: 5 },
  },
  expert: {
    label: 'Expert',
    mainBoard: {
      size: 9,
      band: { minRequiredTier: 4, maxTier: 4 },
      relaxAfterAttempts: 40,
      relaxedMinTier: 3,
    },
    subPuzzle: { size: 9, killerWeight: 0.85, band: { minRequiredTier: 2, maxTier: 3 } },
    specialCells: { min: 4, max: 6 },
  },
};

// Reveal economy (spec §6). All gating flows through revealController.
export const REVEAL_CONFIG = {
  // §6a — TEMPORARY full reveal; keep behind the gating layer so it is
  // trivial to disable later (set count to 0).
  full: { count: 1 },
  // §6b — constrained reveals: player picks 1 of N random empty tiles.
  constrained: { count: 2, choices: 3 },
  // §7a — hint-only sub-puzzles, labeled upfront (user decision).
  // Reward type is pre-rolled per reveal slot at game start so the player
  // always knows what a slot pays before committing (no reroll exploit).
  hintChance: { full: 0, constrained: 0.35 },
  hintCandidateCount: 3, // "this cell is one of {a, b, c}"
};

// Killer sub-puzzle calibration (spec §12 open question — tuned for Medium).
// Generation merges 1-cell cages upward while uniqueness holds; fewer cages =
// bigger cages = harder. targetCageFraction 0.4 → ~33 cages on a 9×9
// (mostly 2s and 3s with a few singles), a solid Medium.
export const KILLER_CONFIG = {
  maxCageSize: 4,
  targetCageFraction: 0.4,
  mergeTimeBudgetMs: 8000,
  // Abort a uniqueness check that explores too many nodes — the pre-merge
  // partition is already verified unique, so we just revert that merge.
  uniquenessNodeBudget: 150000,
};

// Generation safety rails.
export const GENERATION_CONFIG = {
  maxBoardAttempts: 80, // absolute cap before returning best-so-far
  yieldEveryAttempts: 1, // keep the UI responsive during generation
};

export function activeTier() {
  return DIFFICULTY_TIERS[ACTIVE_DIFFICULTY];
}
