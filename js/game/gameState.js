// ============================================================
// gameState — hidden solution, player's board, locked cells,
// special cells, key count, reveal slots (spec §9).
// Invariant #1: the hidden solution is generated once per game
// and never changes.
// ============================================================

import { findConflicts, isLegalPlacement } from '../engine/sudokuEngine.js';

// Typed rewards (spec §7a) — reward type is DATA, not behavior.
export const REWARD_TYPES = {
  REVEAL_DIGIT: 'REVEAL_DIGIT',
  HINT_CONSTRAINT: 'HINT_CONSTRAINT',
};

export class GameState {
  constructor({ size, solution, puzzle, specialCells, revealSlots, difficulty, rating }) {
    const n = size * size;
    this.size = size;
    this.solution = solution; // the hidden solution — never displayed (spec §2)
    this.board = puzzle.slice();
    this.givens = new Set();
    for (let i = 0; i < n; i++) if (puzzle[i] !== 0) this.givens.add(i);
    this.notes = new Array(n).fill(0); // bitmask of pencil marks per cell
    this.revealed = new Set(); // cells filled via reveals — locked
    this.specialCells = new Set(specialCells);
    this.openedSpecials = new Set();
    this.hints = new Map(); // idx -> array of candidate digits (HINT_CONSTRAINT)
    this.keysEarned = 0;
    this.keys = 0;
    this.revealSlots = revealSlots; // [{ id, gate, reward, used }]
    this.difficulty = difficulty;
    this.rating = rating;
  }

  isGiven(idx) { return this.givens.has(idx); }
  isRevealed(idx) { return this.revealed.has(idx); }
  isSpecial(idx) { return this.specialCells.has(idx); }
  isLockedSpecial(idx) { return this.specialCells.has(idx) && !this.openedSpecials.has(idx); }

  // Special cells cannot be filled by normal entry, notes, or reveals (§6.5).
  canEdit(idx) {
    return !this.isGiven(idx) && !this.isRevealed(idx) && !this.isSpecial(idx);
  }

  setCell(idx, digit) {
    if (!this.canEdit(idx)) return false;
    this.board[idx] = digit;
    this.notes[idx] = 0;
    return true;
  }

  erase(idx) {
    if (!this.canEdit(idx)) return false;
    this.board[idx] = 0;
    this.notes[idx] = 0;
    return true;
  }

  toggleNote(idx, digit) {
    if (!this.canEdit(idx) || this.board[idx] !== 0) return false;
    this.notes[idx] ^= 1 << (digit - 1);
    return true;
  }

  // QoL: placing a digit clears that pencil mark from peers' notes.
  clearPeerNotes(idx, digit, peers) {
    const bit = 1 << (digit - 1);
    for (const p of peers[idx]) this.notes[p] &= ~bit;
  }

  conflicts() {
    return findConflicts(this.board, this.size);
  }

  // Cells a §6 reveal may target: empty, editable, never special (§6.5).
  emptyEditableCells() {
    const out = [];
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === 0 && this.canEdit(i)) out.push(i);
    }
    return out;
  }

  // Digits that are currently Sudoku-legal in this cell (for hint distractors).
  legalDigits(idx) {
    const out = [];
    for (let d = 1; d <= this.size; d++) {
      if (isLegalPlacement(this.board, this.size, idx, d)) out.push(d);
    }
    return out;
  }

  // Invariant #2: a REVEAL_DIGIT reward always equals the hidden solution.
  applyRevealDigit(idx) {
    this.board[idx] = this.solution[idx];
    this.revealed.add(idx);
    this.notes[idx] = 0;
    this.hints.delete(idx);
  }

  applyHint(idx, candidates) {
    this.hints.set(idx, candidates);
  }

  openSpecial(idx) {
    this.board[idx] = this.solution[idx];
    this.openedSpecials.add(idx);
    this.notes[idx] = 0;
  }

  // Win: every cell on the main board matches the hidden solution (spec §2).
  isWon() {
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] !== this.solution[i]) return false;
    }
    return true;
  }
}
