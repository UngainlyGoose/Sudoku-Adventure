// ============================================================
// subPuzzleModal — runs a sub-puzzle in a modal overlay (spec
// §7). The main game pauses behind it. Resolves 'success' or
// 'abandon'; abandoning grants nothing and consumes nothing.
// ============================================================

import { BoardView } from './boardView.js';
import { showDialog } from './dialogs.js';
import { findConflicts } from '../engine/sudokuEngine.js';
import { isSubPuzzleSolved } from '../game/subPuzzleController.js';

export class SubPuzzleModal {
  constructor(root) {
    this.root = root;
    this.overlay = null;
  }

  get isOpen() {
    return this.overlay !== null;
  }

  /**
   * opts: { rewardLabel, generate: async () => subPuzzle }
   * Returns 'success' | 'abandon'.
   */
  async run(opts) {
    this.openShell(opts.rewardLabel);
    let sub;
    try {
      sub = await opts.generate();
    } catch (err) {
      this.close();
      throw err;
    }
    this.buildPlayfield(sub);
    return new Promise((resolve) => {
      this.finish = (result) => {
        this.close();
        resolve(result);
      };
    });
  }

  openShell(rewardLabel) {
    document.body.classList.add('modal-open');
    const overlay = document.createElement('div');
    overlay.className = 'overlay subpuzzle-overlay';
    overlay.innerHTML = `
      <div class="scroll-card subpuzzle-card">
        <div class="subpuzzle-head">
          <h2 id="sub-title">Forging a challenge…</h2>
          <p class="reward-label">${rewardLabel}</p>
        </div>
        <div class="subpuzzle-body">
          <div class="gen-spinner">◈</div>
        </div>
        <div class="subpuzzle-foot"></div>
      </div>`;
    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  close() {
    document.removeEventListener('keydown', this.keyHandler, true);
    document.body.classList.remove('modal-open');
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }

  buildPlayfield(sub) {
    const { size } = sub;
    this.sub = sub;
    this.board = sub.puzzle.slice();
    this.notes = new Array(size * size).fill(0);
    this.givens = new Set();
    for (let i = 0; i < this.board.length; i++) if (this.board[i] !== 0) this.givens.add(i);
    this.selection = null;
    this.notesMode = false;
    this.locked = false; // input lock during the success flourish

    this.overlay.querySelector('#sub-title').textContent =
      sub.type === 'killer' ? 'Killer Sudoku Trial' : 'Sudoku Trial';

    const body = this.overlay.querySelector('.subpuzzle-body');
    body.innerHTML = '<div class="board-wrap"><div class="sub-board"></div></div>';
    this.view = new BoardView(body.querySelector('.sub-board'), {
      size,
      onCellTap: (idx) => this.onCellTap(idx),
    });
    if (sub.cages) this.view.setCages(sub.cages);

    const foot = this.overlay.querySelector('.subpuzzle-foot');
    foot.innerHTML = `
      <div class="number-pad sub-pad"></div>
      <div class="pad-actions">
        <button type="button" class="btn btn-parchment" data-act="notes">✎ Notes</button>
        <button type="button" class="btn btn-parchment" data-act="erase">⌫ Erase</button>
        <button type="button" class="btn btn-dim" data-act="abandon">Abandon</button>
      </div>
      <p class="sub-message" aria-live="polite"></p>`;

    const pad = foot.querySelector('.sub-pad');
    pad.style.setProperty('--pad-count', String(size));
    for (let d = 1; d <= size; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad-btn';
      b.textContent = String(d);
      b.addEventListener('click', () => this.enterDigit(d));
      pad.appendChild(b);
    }
    this.notesBtn = foot.querySelector('[data-act="notes"]');
    this.notesBtn.addEventListener('click', () => {
      this.notesMode = !this.notesMode;
      this.notesBtn.classList.toggle('active', this.notesMode);
    });
    foot.querySelector('[data-act="erase"]').addEventListener('click', () => this.eraseSelection());
    foot.querySelector('[data-act="abandon"]').addEventListener('click', () => this.confirmAbandon());

    this.keyHandler = (e) => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler, true);

    this.render();
  }

  setMessage(text) {
    const el = this.overlay.querySelector('.sub-message');
    if (el) el.textContent = text;
  }

  onCellTap(idx) {
    if (this.locked) return;
    this.selection = idx;
    this.render();
  }

  enterDigit(d) {
    if (this.locked || this.selection === null) return;
    const idx = this.selection;
    if (this.givens.has(idx)) return;
    if (this.notesMode && this.board[idx] === 0) {
      this.notes[idx] ^= 1 << (d - 1);
    } else {
      this.board[idx] = d;
      this.notes[idx] = 0;
    }
    this.afterChange();
  }

  eraseSelection() {
    if (this.locked || this.selection === null) return;
    const idx = this.selection;
    if (this.givens.has(idx)) return;
    this.board[idx] = 0;
    this.notes[idx] = 0;
    this.afterChange();
  }

  onKey(e) {
    if (this.locked) return;
    const { size } = this.sub;
    const k = e.key;
    if (k === 'Escape') {
      e.stopPropagation();
      this.confirmAbandon();
      return;
    }
    let handled = true;
    if (/^[1-9]$/.test(k) && Number(k) <= size) {
      this.enterDigit(Number(k));
    } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
      this.eraseSelection();
    } else if (k.toLowerCase() === 'n') {
      this.notesBtn.click();
    } else if (k.startsWith('Arrow')) {
      const cur = this.selection ?? 0;
      let r = Math.floor(cur / size), c = cur % size;
      if (k === 'ArrowUp') r = Math.max(0, r - 1);
      if (k === 'ArrowDown') r = Math.min(size - 1, r + 1);
      if (k === 'ArrowLeft') c = Math.max(0, c - 1);
      if (k === 'ArrowRight') c = Math.min(size - 1, c + 1);
      this.selection = r * size + c;
      this.render();
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  async confirmAbandon() {
    const choice = await showDialog({
      title: 'Abandon this trial?',
      bodyHtml: '<p>No reward will be granted — but nothing is consumed either. You may return later.</p>',
      buttons: [
        { label: 'Keep solving', value: 'stay', isCancel: true },
        { label: 'Abandon', value: 'abandon', kind: 'btn-danger' },
      ],
    });
    if (choice === 'abandon') this.finish('abandon');
  }

  // Killer cage check: a fully-filled cage must hit its sum with no repeats.
  checkCages() {
    if (!this.sub.cages) return true;
    let allGood = true;
    for (const cage of this.sub.cages) {
      const anchor = Math.min(...cage.cells);
      const vals = cage.cells.map((i) => this.board[i]);
      if (vals.some((v) => v === 0)) {
        this.view.markCageSum(anchor, false);
        continue;
      }
      const sum = vals.reduce((a, b) => a + b, 0);
      const distinct = new Set(vals).size === vals.length;
      const ok = sum === cage.sum && distinct;
      this.view.markCageSum(anchor, !ok);
      if (!ok) allGood = false;
    }
    return allGood;
  }

  afterChange() {
    const cagesOk = this.checkCages();
    this.render();
    const full = this.board.every((v) => v !== 0);
    if (!full) return;
    if (isSubPuzzleSolved(this.sub, this.board)) {
      this.locked = true;
      this.setMessage('The trial is complete!');
      this.overlay.querySelector('.subpuzzle-card').classList.add('solved');
      setTimeout(() => this.finish('success'), 900);
    } else {
      const conflicts = findConflicts(this.board, this.sub.size);
      this.setMessage(
        conflicts.size > 0
          ? 'Something is amiss — duplicate digits clash.'
          : cagesOk
            ? 'Something is amiss…'
            : 'Something is amiss — the cage sums do not add up.'
      );
    }
  }

  render() {
    const conflicts = findConflicts(this.board, this.sub.size);
    const selVal = this.selection !== null ? this.board[this.selection] : 0;
    this.view.render((idx) => {
      const classes = [];
      if (this.givens.has(idx)) classes.push('given');
      if (idx === this.selection) classes.push('selected');
      if (conflicts.has(idx)) classes.push('conflict');
      if (selVal !== 0 && this.board[idx] === selVal && idx !== this.selection) classes.push('same-digit');
      return { value: this.board[idx], notes: this.notes[idx], classes };
    });
  }
}
