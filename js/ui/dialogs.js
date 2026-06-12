// ============================================================
// dialogs — parchment-scroll modal dialogs (confirm, info, win).
// showDialog returns a Promise resolving to the clicked button's
// value (or the cancel button's value on Escape/backdrop).
// ============================================================

export function showDialog({ title, bodyHtml = '', buttons, tone = '' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    const overlay = document.createElement('div');
    overlay.className = `overlay dialog-overlay ${tone}`;

    const card = document.createElement('div');
    card.className = 'scroll-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const h = document.createElement('h2');
    h.textContent = title;
    card.appendChild(h);

    if (bodyHtml) {
      const body = document.createElement('div');
      body.className = 'dialog-body';
      body.innerHTML = bodyHtml; // app-controlled content only
      card.appendChild(body);
    }

    const row = document.createElement('div');
    row.className = 'dialog-buttons';
    const cancelBtn = buttons.find((b) => b.isCancel);

    function finish(value) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape' && cancelBtn) {
        e.stopPropagation();
        finish(cancelBtn.value);
      }
    }

    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${b.kind || 'btn-parchment'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      row.appendChild(btn);
    }
    card.appendChild(row);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && cancelBtn) finish(cancelBtn.value);
    });
    document.addEventListener('keydown', onKey, true);
    root.appendChild(overlay);
  });
}
