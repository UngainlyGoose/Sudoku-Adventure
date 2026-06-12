// ============================================================
// hud — reveal budget display (spec §6), key count (spec §8),
// and sealed-cell count. Each reveal slot is its own chip with
// its pre-rolled reward labeled upfront (user decision).
// ============================================================

import { GATE_TYPES } from '../game/revealController.js';
import { REWARD_TYPES } from '../game/gameState.js';

const GATE_META = {
  [GATE_TYPES.FULL]: { icon: '🔮', label: 'Full Reveal' },
  [GATE_TYPES.CONSTRAINED]: { icon: '🎲', label: 'Fated Reveal' },
};

const REWARD_META = {
  [REWARD_TYPES.REVEAL_DIGIT]: { icon: '✦', label: 'Digit' },
  [REWARD_TYPES.HINT_CONSTRAINT]: { icon: '❖', label: 'Hint' },
};

export function renderHUD(el, state) {
  el.innerHTML = '';

  const diff = document.createElement('div');
  diff.className = 'hud-chip hud-difficulty';
  diff.innerHTML = `<span class="chip-icon">⚔</span><span>${state.difficulty}</span>`;
  el.appendChild(diff);

  for (const slot of state.revealSlots) {
    const gate = GATE_META[slot.gate];
    const reward = REWARD_META[slot.reward];
    const chip = document.createElement('div');
    chip.className = `hud-chip slot-chip ${slot.used ? 'used' : ''}`;
    chip.title = slot.used
      ? `${gate.label} — already spent`
      : `${gate.label} — pays a ${reward.label.toLowerCase()} on success`;
    chip.innerHTML =
      `<span class="chip-icon">${gate.icon}</span>` +
      `<span class="chip-label">${gate.label}</span>` +
      `<span class="chip-reward">${reward.icon} ${reward.label}</span>`;
    el.appendChild(chip);
  }

  const sealed = [...state.specialCells].filter((i) => state.isLockedSpecial(i)).length;
  const keys = document.createElement('div');
  keys.className = 'hud-chip';
  keys.title = 'Keys are earned by solving challenges and spent immediately to break seals';
  keys.innerHTML = `<span class="chip-icon">🗝</span><span>Keys: ${state.keys} (earned ${state.keysEarned})</span>`;
  el.appendChild(keys);

  const stones = document.createElement('div');
  stones.className = 'hud-chip';
  stones.title = 'Sealed cells can only be opened with a key';
  stones.innerHTML = `<span class="chip-icon">🪨</span><span>Sealed: ${sealed}</span>`;
  el.appendChild(stones);
}
