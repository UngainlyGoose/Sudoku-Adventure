// ============================================================
// main — wires config, engine, game layer, and UI together.
// Core loop (spec §4): new game → hidden solution → play by
// logic → reveals/keys via sub-puzzles → win when the board
// matches the hidden solution.
// ============================================================

import { ACTIVE_DIFFICULTY, activeTier, GENERATION_CONFIG } from './config.js';
import { getStructure } from './engine/sudokuEngine.js';
import { generateRatedPuzzle } from './engine/puzzleGenerator.js';
import { GameState, REWARD_TYPES } from './game/gameState.js';
import {
  RevealController,
  createRevealSlots,
  pickSpecialCells,
  GATE_TYPES,
} from './game/revealController.js';
import { createSubPuzzle, prefetchSubPuzzle } from './game/subPuzzleController.js';
import { BoardView } from './ui/boardView.js';
import { renderHUD } from './ui/hud.js';
import { SubPuzzleModal } from './ui/subPuzzleModal.js';
import { showDialog } from './ui/dialogs.js';

const rng = Math.random;

let state = null;
let revealCtl = null;
let boardView = null;
let modal = null;
let selection = null;
let notesMode = false;
let mode = { type: 'normal' }; // | {type:'fullTarget',slot} | {type:'constrainedOffer',slot,choices}
let won = false;
let startTime = 0;

const $ = (sel) => document.querySelector(sel);

const DEFAULT_TIP = 'Fill the board by logic. Spend reveals wisely — and break the sealed stones with keys.';

function setMessage(text) {
  $('#message-log').textContent = text || DEFAULT_TIP;
}

function posLabel(idx, size) {
  return `row ${Math.floor(idx / size) + 1}, column ${(idx % size) + 1}`;
}

function rewardLabel(slot) {
  return slot.reward === REWARD_TYPES.REVEAL_DIGIT ? 'a true digit' : 'a hint (the cell narrowed to 3 candidates)';
}

// ---------------- rendering ----------------

function render() {
  renderHUD($('#hud'), state);

  const size = state.size;
  const conflicts = state.conflicts();
  const selVal = selection !== null ? state.board[selection] : 0;
  const { peers } = getStructure(size);
  const peerSet = selection !== null ? new Set(peers[selection]) : new Set();

  boardView.render((idx) => {
    const classes = [];
    let lockGlyph = null;
    let notes = state.notes[idx];

    if (state.isGiven(idx)) classes.push('given');
    else if (state.isRevealed(idx)) classes.push('revealed');
    else if (state.isLockedSpecial(idx)) {
      classes.push('special-locked');
      lockGlyph = '🔒';
    } else if (state.openedSpecials.has(idx)) classes.push('special-opened');
    else classes.push('user');

    if (state.hints.has(idx) && state.board[idx] === 0) {
      notes = state.hints.get(idx).reduce((m, d) => m | (1 << (d - 1)), 0);
      classes.push('hint-cell');
    }

    if (idx === selection) classes.push('selected');
    else if (peerSet.has(idx)) classes.push('peer');
    if (conflicts.has(idx)) classes.push('conflict');
    if (selVal !== 0 && state.board[idx] === selVal && idx !== selection) classes.push('same-digit');

    if (mode.type === 'fullTarget' && state.board[idx] === 0 && state.canEdit(idx)) classes.push('eligible');
    if (mode.type === 'constrainedOffer' && mode.choices.includes(idx)) classes.push('choice');

    return { value: state.board[idx], notes, classes, lockGlyph };
  });

  $('#full-reveal-btn').disabled = won || !revealCtl.canStart(GATE_TYPES.FULL);
  $('#constrained-reveal-btn').disabled = won || !revealCtl.canStart(GATE_TYPES.CONSTRAINED);
}

// ---------------- game flow ----------------

async function newGame({ confirm = true } = {}) {
  if (confirm && state && !won && state.board.some((v, i) => v !== 0 && !state.isGiven(i))) {
    const choice = await showDialog({
      title: 'Abandon this quest?',
      bodyHtml: '<p>Your current board will be lost and a fresh dungeon charted.</p>',
      buttons: [
        { label: 'Keep playing', value: 'stay', isCancel: true },
        { label: 'New quest', value: 'new', kind: 'btn-danger' },
      ],
    });
    if (choice !== 'new') return;
  }

  const overlay = $('#gen-overlay');
  overlay.classList.remove('hidden');
  const progressEl = overlay.querySelector('.progress');
  progressEl.textContent = 'Summoning a worthy board…';
  await new Promise((r) => setTimeout(r, 30)); // let the overlay paint

  const tier = activeTier();
  const mb = tier.mainBoard;
  const gen = await generateRatedPuzzle(mb.size, mb.band, {
    rng,
    relaxAfterAttempts: mb.relaxAfterAttempts,
    relaxedMinTier: mb.relaxedMinTier,
    maxAttempts: GENERATION_CONFIG.maxBoardAttempts,
    onProgress: (attempt) => {
      progressEl.textContent = `Summoning a worthy board… attempt ${attempt}`;
    },
  });

  const specials = pickSpecialCells(gen.puzzle, tier.specialCells, rng);
  state = new GameState({
    size: mb.size,
    solution: gen.solution,
    puzzle: gen.puzzle,
    specialCells: specials,
    revealSlots: createRevealSlots(rng),
    difficulty: tier.label,
    rating: gen.rating,
  });
  revealCtl = new RevealController(state, rng);
  selection = null;
  notesMode = false;
  mode = { type: 'normal' };
  won = false;
  startTime = Date.now();

  $('#notes-btn').classList.remove('active');
  overlay.classList.add('hidden');
  setMessage(null);
  render();
  prefetchSubPuzzle(rng); // forge the first trial in the background
}

function checkWin() {
  if (won || !state.isWon()) {
    nudgeIfOnlySealsRemain();
    return;
  }
  won = true;
  render();
  const mins = Math.max(1, Math.round((Date.now() - startTime) / 60000));
  const revealsUsed = state.revealSlots.filter((s) => s.used).length;
  showDialog({
    title: '⚔ Quest Complete!',
    tone: 'tone-win',
    bodyHtml:
      `<p>The board matches the hidden solution. The dungeon yields.</p>` +
      `<p class="win-stats">~${mins} min · ${revealsUsed}/${state.revealSlots.length} reveals spent · ${state.keysEarned} keys earned</p>`,
    buttons: [
      { label: 'Admire the board', value: 'stay', isCancel: true },
      { label: 'New quest', value: 'new' },
    ],
  }).then((choice) => {
    if (choice === 'new') newGame({ confirm: false });
  });
}

function nudgeIfOnlySealsRemain() {
  if (!state) return;
  for (let i = 0; i < state.board.length; i++) {
    if (state.isLockedSpecial(i)) continue;
    if (state.board[i] !== state.solution[i]) return;
  }
  if ([...state.specialCells].some((i) => state.isLockedSpecial(i))) {
    setMessage('Only sealed stones remain — earn keys to break them and finish the quest.');
  }
}

// ---------------- reveal flows (all gated via revealController) ----------------

async function startFullReveal() {
  if (!revealCtl.canStart(GATE_TYPES.FULL)) return;
  mode = { type: 'fullTarget', slot: revealCtl.nextSlot(GATE_TYPES.FULL) };
  setMessage('Full Reveal: choose ANY empty cell to aim it at. (Esc to cancel)');
  render();
}

async function startConstrainedReveal() {
  if (!revealCtl.canStart(GATE_TYPES.CONSTRAINED)) return;
  const slot = revealCtl.nextSlot(GATE_TYPES.CONSTRAINED);
  // The offered triple is rolled ONCE per slot and persists across cancels —
  // no rerolling the fates. Cells already filled since are pruned.
  let choices = (slot.choices || []).filter((i) => state.board[i] === 0 && state.canEdit(i));
  if (choices.length === 0) choices = revealCtl.pickConstrainedChoices();
  slot.choices = choices;
  mode = { type: 'constrainedOffer', slot, choices };
  setMessage(`The fates offer ${choices.length} cell${choices.length > 1 ? 's' : ''} — choose one. (Esc to cancel)`);
  render();
}

async function beginTrialForTarget(slot, targetIdx) {
  mode = { type: 'normal' };
  render();
  const pos = posLabel(targetIdx, state.size);
  const choice = await showDialog({
    title: 'Begin the trial?',
    bodyHtml:
      `<p>Solve the challenge to claim <b>${rewardLabel(slot)}</b> for <b>${pos}</b>.</p>` +
      `<p>Abandoning the trial costs nothing.</p>`,
    buttons: [
      { label: 'Not yet', value: 'cancel', isCancel: true },
      { label: 'Begin', value: 'begin' },
    ],
  });
  if (choice !== 'begin') {
    setMessage(null);
    return;
  }
  const result = await modal.run({
    rewardLabel: `Reward: ${rewardLabel(slot)} — ${pos}`,
    generate: () => createSubPuzzle(rng),
  });
  if (result === 'success') {
    const outcome = revealCtl.consumeReveal(slot, targetIdx);
    if (outcome.type === REWARD_TYPES.REVEAL_DIGIT) {
      setMessage(`The trial is won — a true ${outcome.digit} now stands at ${pos}.`);
    } else {
      setMessage(`The trial is won — the cell at ${pos} holds one of {${outcome.candidates.join(', ')}}.`);
    }
    render();
    checkWin();
  } else {
    setMessage('The trial was abandoned. Nothing gained, nothing lost.');
    render();
  }
}

async function promptSpecialUnlock(idx) {
  if (!state.isLockedSpecial(idx)) return;
  const pos = posLabel(idx, state.size);
  const choice = await showDialog({
    title: 'A sealed stone',
    bodyHtml:
      `<p>The cell at <b>${pos}</b> is sealed. It cannot be filled by hand or by reveal — ` +
      `only a <b>key</b> can break the seal.</p>` +
      `<p>Solve a challenge to earn a key and open it. Abandoning costs nothing.</p>`,
    buttons: [
      { label: 'Not now', value: 'cancel', isCancel: true },
      { label: 'Seek the key', value: 'begin' },
    ],
  });
  if (choice !== 'begin') return;
  const result = await modal.run({
    rewardLabel: `Reward: a key — breaks the seal at ${pos}`,
    generate: () => createSubPuzzle(rng),
  });
  if (result === 'success') {
    const outcome = revealCtl.consumeKeyUnlock(idx);
    setMessage(`The seal shatters — a true ${outcome.digit} is revealed at ${pos}.`);
    render();
    checkWin();
  } else {
    setMessage('The trial was abandoned. The seal holds.');
    render();
  }
}

// ---------------- input ----------------

function onCellTap(idx) {
  if (won) return;
  if (mode.type === 'fullTarget') {
    if (state.board[idx] === 0 && state.canEdit(idx)) {
      beginTrialForTarget(mode.slot, idx);
    } else {
      setMessage('Choose an EMPTY, unsealed cell for the Full Reveal.');
    }
    return;
  }
  if (mode.type === 'constrainedOffer') {
    if (mode.choices.includes(idx)) {
      beginTrialForTarget(mode.slot, idx);
    } else {
      setMessage('Choose one of the glowing offered cells. (Esc to cancel)');
    }
    return;
  }
  if (state.isLockedSpecial(idx)) {
    promptSpecialUnlock(idx);
    return;
  }
  selection = idx;
  render();
}

function enterDigit(d) {
  if (won || selection === null) return;
  if (!state.canEdit(selection)) return;
  if (notesMode && state.board[selection] === 0) {
    state.toggleNote(selection, d);
  } else if (state.setCell(selection, d)) {
    state.clearPeerNotes(selection, d, getStructure(state.size).peers);
  }
  render();
  checkWin();
}

function eraseSelection() {
  if (won || selection === null) return;
  state.erase(selection);
  render();
}

function cancelTargeting() {
  if (mode.type !== 'normal') {
    mode = { type: 'normal' };
    setMessage(null);
    render();
  }
}

function onKey(e) {
  // The sub-puzzle modal and dialogs own the keyboard while open.
  if (document.body.classList.contains('modal-open')) return;
  if ($('#dialog-root').children.length > 0) return;
  const k = e.key;
  if (k === 'Escape') {
    cancelTargeting();
    return;
  }
  if (won || !state) return;
  let handled = true;
  if (/^[1-9]$/.test(k)) {
    enterDigit(Number(k));
  } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
    eraseSelection();
  } else if (k.toLowerCase() === 'n') {
    $('#notes-btn').click();
  } else if (k.startsWith('Arrow')) {
    const size = state.size;
    const cur = selection ?? 0;
    let r = Math.floor(cur / size), c = cur % size;
    if (k === 'ArrowUp') r = Math.max(0, r - 1);
    if (k === 'ArrowDown') r = Math.min(size - 1, r + 1);
    if (k === 'ArrowLeft') c = Math.max(0, c - 1);
    if (k === 'ArrowRight') c = Math.min(size - 1, c + 1);
    selection = r * size + c;
    render();
  } else {
    handled = false;
  }
  if (handled) e.preventDefault();
}

// ---------------- bootstrap ----------------

function buildStaticUI() {
  const size = activeTier().mainBoard.size;
  boardView = new BoardView($('#main-board'), { size, onCellTap });
  modal = new SubPuzzleModal($('#modal-root'));

  const pad = $('#number-pad');
  for (let d = 1; d <= size; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad-btn';
    b.textContent = String(d);
    b.addEventListener('click', () => enterDigit(d));
    pad.appendChild(b);
  }

  $('#notes-btn').addEventListener('click', function () {
    notesMode = !notesMode;
    this.classList.toggle('active', notesMode);
  });
  $('#erase-btn').addEventListener('click', eraseSelection);
  $('#new-game-btn').addEventListener('click', () => newGame());
  $('#full-reveal-btn').addEventListener('click', startFullReveal);
  $('#constrained-reveal-btn').addEventListener('click', startConstrainedReveal);
  document.addEventListener('keydown', onKey);
}

buildStaticUI();
newGame({ confirm: false });

// Exposed for in-browser engine sanity checks (not used by the game itself).
window.__SA_DEBUG = {
  getState: () => state,
  getModal: () => modal,
  difficulty: ACTIVE_DIFFICULTY,
};
