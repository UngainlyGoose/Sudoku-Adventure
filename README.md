# Sudoku Adventure (v1)

A dungeon-flavored Sudoku game: hard boards, a scarce reveal economy, sealed
"stone" cells, and keys earned by solving sub-puzzle trials. Client-side only —
plain HTML/CSS/JS ES modules, no build step, no backend, no storage.

## How to play

- **New Quest** generates a fresh Hard board (procedurally generated, verified
  to have exactly one solution, and rated by a human-technique solver so it is
  always solvable by pure logic — no guessing ever required).
- Fill cells like normal Sudoku. Pencil marks via **Notes** (or `N`).
  Conflicts highlight in red. Keyboard: `1-9`, arrows, `Backspace`, `N`.
- Stuck? Spend a reveal — each launches a **trial** (a 9×9 Normal or Killer
  sudoku of medium difficulty). Solving it pays the reward; abandoning costs
  nothing.
  - 🔮 **Full Reveal** (1 per quest): aim at ANY empty cell.
  - 🎲 **Fated Reveal** (2 per quest): the game offers three random cells; pick one.
  - Each reveal slot is labeled upfront with what it pays: ✦ **Digit** (the
    cell's true value) or ❖ **Hint** (the cell narrowed to 3 candidates).
- 🔒 **Sealed cells** can't be filled by hand or by reveal. Tap one to seek its
  **key**: solve a trial, the seal breaks, the true digit appears. Keys are
  unlimited in supply but each costs a trial.
- Win by matching the entire board to the hidden solution.

## Run locally

Any static file server works (it's just static files — opening `index.html`
directly won't work because ES modules require http). Two easy options:

```powershell
# Windows (no installs needed)
powershell -ExecutionPolicy Bypass -File serve.ps1   # http://localhost:8412
```

```bash
# or with Python installed
python -m http.server 8412
```

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `sudoku-adventure`).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Sudoku Adventure v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/sudoku-adventure.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch →
   Branch: `main`, folder: `/ (root)` → Save**.
4. After a minute the game is live at
   `https://<your-username>.github.io/sudoku-adventure/` — shareable by link,
   no install needed. (All paths in the app are relative, so it works from a
   subpath out of the box.)

To update the live site later: commit and `git push` — Pages redeploys
automatically.

## Project structure

```
index.html              entry point
css/style.css           adventure/parchment theme, fully responsive
js/config.js            THE config: difficulty tiers, technique bands, reveal
                        economy, killer calibration — tune here, not in code
js/engine/
  sudokuEngine.js       solved-grid generation (4/6/9), units/peers, conflicts
  solutionCounter.js    counts solutions (stop at 2) — uniqueness guarantee
  logicalSolver.js      human-technique solver + difficulty rating (the most
                        involved module: singles, locked candidates, pairs,
                        triples, X-wing, XY-wing, swordfish)
  puzzleGenerator.js    dig-to-minimal + restore-until-solvable, band rating
  killerGenerator.js    killer cages, unique BY CONSTRUCTION (merge-up method)
js/game/
  gameState.js          hidden solution, board, notes, specials, keys, slots
  revealController.js   the single gating layer for ALL unlocks (full /
                        constrained / key are distinct gate types)
  subPuzzleController.js sub-puzzle creation + background prefetch cache
js/ui/
  boardView.js          generic grid renderer (main board + sub-puzzles)
  hud.js                reveal slots, key count, sealed count
  subPuzzleModal.js     the trial overlay
  dialogs.js            confirm/win dialogs
js/main.js              wiring, input, game flow
```

## Design notes (v1 decisions)

- **Difficulty is one config value** (`ACTIVE_DIFFICULTY = 'hard'`). Easy /
  Medium / Expert tiers are defined but inactive; there is deliberately no
  difficulty-select UI in v1.
- **Givens count**: the original spec's "11–13 givens" is mathematically
  impossible for a unique-solution Sudoku (proven 17-clue minimum). Hard
  instead digs to a *minimal* unique puzzle (~22–26 givens) and enforces
  difficulty via the technique band: a Hard board must *require* tier-3+
  techniques (triples / X-wing) and is solvable within tier 4 (XY-wing /
  swordfish).
- **Reward types are data** (`REVEAL_DIGIT`, `HINT_CONSTRAINT`), and all
  unlock gating goes through `revealController` — so re-costing reveals,
  removing the temporary full reveal, or adding Phase-2 items are config/data
  changes, not rewrites.
- **Sealed cells & win**: you must break every seal to literally complete the
  board, but trials are unlimited — seals gate effort, never information. The
  board is always finishable by logic + trials.
- **Killer uniqueness**: random cage partitions of a no-given killer are almost
  never unique (measured ~1 in 8). The generator instead starts from all
  1-cell cages (trivially unique) and merges neighbors while uniqueness holds —
  unique at every step, ~50–300 ms typical. Remaining 1-cell cages are ones the
  uniqueness check refused to merge; their sums are load-bearing.
- **Prefetch**: the next trial is forged in the background so the modal opens
  instantly most of the time.

## v1 scope

No saving between sessions, no accounts, no analytics, no difficulty select,
no custom domain — all per spec. Phase 2 ideas (item economy, twist dungeons,
decoy digits, meta-progression) are documented in the spec and the
architecture leaves room for them.
