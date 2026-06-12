// ============================================================
// revealController — the SINGLE gating layer for all unlocks
// (spec §9). Handles the §6 reveal budget (full + constrained)
// and the §6.5 key/special-cell gate as distinct gate types.
// Future limits/costs and the removal of the temporary full
// reveal happen HERE and only here.
// ============================================================

import { REVEAL_CONFIG } from '../config.js';
import { REWARD_TYPES } from './gameState.js';
import { shuffle } from '../engine/sudokuEngine.js';

export const GATE_TYPES = {
  FULL: 'full', // §6a — TEMPORARY; set REVEAL_CONFIG.full.count = 0 to disable
  CONSTRAINED: 'constrained', // §6b
  KEY: 'key', // §6.5 — independent of the §6 budget (invariant #6)
};

// Pre-roll each reveal slot's reward type at game start so the player can be
// shown what a slot pays BEFORE committing (user decision: labeled upfront,
// no reroll exploit).
export function createRevealSlots(rng = Math.random) {
  const slots = [];
  let id = 0;
  for (let i = 0; i < REVEAL_CONFIG.full.count; i++) {
    slots.push({
      id: `slot-${id++}`,
      gate: GATE_TYPES.FULL,
      reward: rng() < REVEAL_CONFIG.hintChance.full ? REWARD_TYPES.HINT_CONSTRAINT : REWARD_TYPES.REVEAL_DIGIT,
      used: false,
    });
  }
  for (let i = 0; i < REVEAL_CONFIG.constrained.count; i++) {
    slots.push({
      id: `slot-${id++}`,
      gate: GATE_TYPES.CONSTRAINED,
      reward:
        rng() < REVEAL_CONFIG.hintChance.constrained ? REWARD_TYPES.HINT_CONSTRAINT : REWARD_TYPES.REVEAL_DIGIT,
      used: false,
    });
  }
  return slots;
}

export class RevealController {
  constructor(state, rng = Math.random) {
    this.state = state;
    this.rng = rng;
  }

  availableSlots(gate) {
    return this.state.revealSlots.filter((s) => s.gate === gate && !s.used);
  }

  nextSlot(gate) {
    return this.availableSlots(gate)[0] || null;
  }

  // "Can the player start an unlock of type X right now?"
  canStart(gate) {
    switch (gate) {
      case GATE_TYPES.FULL:
      case GATE_TYPES.CONSTRAINED:
        return this.availableSlots(gate).length > 0 && this.state.emptyEditableCells().length > 0;
      case GATE_TYPES.KEY: {
        return [...this.state.specialCells].some((i) => this.state.isLockedSpecial(i));
      }
      default:
        return false;
    }
  }

  // §6b: offer N randomly-selected empty tiles; the player picks one.
  pickConstrainedChoices() {
    const empties = shuffle(this.state.emptyEditableCells(), this.rng);
    return empties.slice(0, Math.min(REVEAL_CONFIG.constrained.choices, empties.length));
  }

  // Called ONLY on sub-puzzle success (abandoning consumes nothing, §7).
  // Applies the slot's typed reward to the target cell and consumes the slot.
  consumeReveal(slot, targetIdx) {
    slot.used = true;
    if (slot.reward === REWARD_TYPES.REVEAL_DIGIT) {
      this.state.applyRevealDigit(targetIdx);
      return { type: REWARD_TYPES.REVEAL_DIGIT, cell: targetIdx, digit: this.state.solution[targetIdx] };
    }
    // HINT_CONSTRAINT: "this cell is one of {a, b, c}" — the true digit plus
    // distractors that are currently plausible in that cell (spec §7a).
    const truth = this.state.solution[targetIdx];
    const distractorPool = this.state.legalDigits(targetIdx).filter((d) => d !== truth);
    const fallbackPool = [];
    for (let d = 1; d <= this.state.size; d++) {
      if (d !== truth && !distractorPool.includes(d)) fallbackPool.push(d);
    }
    const wanted = REVEAL_CONFIG.hintCandidateCount - 1;
    const distractors = shuffle(distractorPool, this.rng).slice(0, wanted);
    while (distractors.length < wanted && fallbackPool.length > 0) {
      distractors.push(fallbackPool.shift());
    }
    const candidates = shuffle([truth, ...distractors], this.rng);
    this.state.applyHint(targetIdx, candidates);
    return { type: REWARD_TYPES.HINT_CONSTRAINT, cell: targetIdx, candidates };
  }

  // §6.5: called ONLY on sub-puzzle success. Earn a key, immediately spend it
  // to open the chosen special cell. Kept as a real counter so a future item
  // economy can extend it.
  consumeKeyUnlock(specialIdx) {
    this.state.keysEarned += 1;
    this.state.keys += 1;
    this.state.keys -= 1;
    this.state.openSpecial(specialIdx);
    return { type: 'KEY_UNLOCK', cell: specialIdx, digit: this.state.solution[specialIdx] };
  }
}

// Generator-side helper (spec §6.5): pick special-cell positions. Placed only
// by the generator, never on a starting given (invariant #6).
export function pickSpecialCells(puzzle, countRange, rng = Math.random) {
  const empties = [];
  for (let i = 0; i < puzzle.length; i++) if (puzzle[i] === 0) empties.push(i);
  const count = countRange.min + Math.floor(rng() * (countRange.max - countRange.min + 1));
  return shuffle(empties, rng).slice(0, Math.min(count, empties.length));
}
