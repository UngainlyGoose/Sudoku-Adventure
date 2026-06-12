// ============================================================
// boardView — generic grid renderer shared by the main board
// and sub-puzzle modal. Supports any SIZE_CONFIGS size, pencil
// notes, killer cage borders + sums, and arbitrary cell classes.
// ============================================================

import { SIZE_CONFIGS } from '../engine/sudokuEngine.js';

export class BoardView {
  constructor(container, { size, onCellTap }) {
    this.size = size;
    this.onCellTap = onCellTap;
    this.container = container;
    this.cells = [];
    this.cageSumEls = new Map(); // cage first-cell idx -> sum element

    const { boxRows, boxCols } = SIZE_CONFIGS[size];
    container.innerHTML = '';
    container.classList.add('board');
    container.dataset.size = String(size);
    container.style.setProperty('--size', String(size));

    for (let idx = 0; idx < size * size; idx++) {
      const r = Math.floor(idx / size);
      const c = idx % size;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.idx = String(idx);
      // thick box-boundary edges
      if (r % boxRows === 0) cell.classList.add('edge-top');
      if (c % boxCols === 0) cell.classList.add('edge-left');
      if (r === size - 1) cell.classList.add('edge-bottom');
      if (c === size - 1) cell.classList.add('edge-right');

      const value = document.createElement('span');
      value.className = 'cell-value';
      cell.appendChild(value);

      const notes = document.createElement('div');
      notes.className = 'notes-grid';
      notes.style.setProperty('--note-cols', String(boxCols));
      for (let d = 1; d <= size; d++) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = String(d);
        notes.appendChild(n);
      }
      cell.appendChild(notes);

      cell.addEventListener('click', () => this.onCellTap && this.onCellTap(idx));
      container.appendChild(cell);
      this.cells.push(cell);
    }
  }

  // Killer cages: dashed inner borders where a neighbor is in a different
  // cage, plus the sum label in each cage's top-left-most cell.
  setCages(cages) {
    const size = this.size;
    const cageOf = new Array(size * size).fill(-1);
    cages.forEach((cage, ci) => cage.cells.forEach((i) => (cageOf[i] = ci)));
    for (let idx = 0; idx < size * size; idx++) {
      const cell = this.cells[idx];
      const r = Math.floor(idx / size);
      const c = idx % size;
      const mine = cageOf[idx];
      cell.classList.add('caged');
      if (r === 0 || cageOf[idx - size] !== mine) cell.classList.add('cage-top');
      if (r === size - 1 || cageOf[idx + size] !== mine) cell.classList.add('cage-bottom');
      if (c === 0 || cageOf[idx - 1] !== mine) cell.classList.add('cage-left');
      if (c === size - 1 || cageOf[idx + 1] !== mine) cell.classList.add('cage-right');
    }
    for (const cage of cages) {
      const anchor = Math.min(...cage.cells);
      const sumEl = document.createElement('span');
      sumEl.className = 'cage-sum';
      sumEl.textContent = String(cage.sum);
      this.cells[anchor].appendChild(sumEl);
      this.cageSumEls.set(anchor, sumEl);
    }
  }

  markCageSum(anchorIdx, bad) {
    const el = this.cageSumEls.get(anchorIdx);
    if (el) el.classList.toggle('cage-sum-bad', bad);
  }

  /**
   * Re-render all cells. `getCellState(idx)` returns:
   *   { value, notes (bitmask), classes: string[], lockGlyph?: string }
   * Hint candidates are rendered by passing note bits + 'hint-cell' class.
   */
  render(getCellState) {
    for (let idx = 0; idx < this.cells.length; idx++) {
      const cell = this.cells[idx];
      const { value, notes, classes, lockGlyph } = getCellState(idx);
      const valueEl = cell.querySelector('.cell-value');
      valueEl.textContent = lockGlyph || (value ? String(value) : '');
      const notesEl = cell.querySelector('.notes-grid');
      const showNotes = !value && !lockGlyph && notes !== 0;
      notesEl.classList.toggle('visible', showNotes);
      if (showNotes) {
        const noteEls = notesEl.children;
        for (let d = 0; d < this.size; d++) {
          noteEls[d].classList.toggle('on', (notes & (1 << d)) !== 0);
        }
      }
      cell.className = cell.className
        .split(' ')
        .filter((cl) => cl === 'cell' || cl.startsWith('edge-') || cl.startsWith('cage') || cl === 'caged')
        .join(' ');
      for (const cl of classes) cell.classList.add(cl);
    }
  }
}
