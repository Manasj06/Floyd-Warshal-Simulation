/* ── Floyd–Warshall Visualizer · script.js ─────────────────── */

const PRESETS = {
  disconnected: {
    n: 4,
    matrix: [
      [0,     3,    "INF", 7   ],
      [8,     0,    2,    "INF"],
      [5,     "INF",0,    1   ],
      ["INF", 2,    "INF",0   ]
    ]
  },
  dense: {
    n: 4,
    matrix: [
      [0, 5, 9, 2],
      [3, 0, 1, 8],
      [7, 4, 0, 6],
      [1, 9, 3, 0]
    ]
  },
  chain: {
    n: 5,
    matrix: [
      [0,    2,    "INF","INF","INF"],
      ["INF",0,    4,    "INF","INF"],
      ["INF","INF",0,    1,   "INF"],
      ["INF","INF","INF",0,    3   ],
      ["INF","INF","INF","INF",0   ]
    ]
  }
};

/* ── State ─────────────────────────────────────────────────── */
let state = {
  steps: [],
  currentStep: 0,
  n: 0,
  autoPlayTimer: null,
  isPlaying: false
};

/* ── DOM refs ──────────────────────────────────────────────── */
const vertexCountEl   = document.getElementById('vertexCount');
const buildBtn        = document.getElementById('buildMatrixBtn');
const matrixInputCont = document.getElementById('matrixInputContainer');
const runBtn          = document.getElementById('runBtn');
const resetBtn        = document.getElementById('resetBtn');
const errorMsg        = document.getElementById('errorMsg');
const vizPanel        = document.getElementById('vizPanel');
const matrixDisplay   = document.getElementById('matrixDisplay');
const prevBtn         = document.getElementById('prevBtn');
const nextBtn         = document.getElementById('nextBtn');
const stepBadge       = document.getElementById('stepBadge');
const iterK           = document.getElementById('iterK');
const iterDesc        = document.getElementById('iterDesc');
const progressBar     = document.getElementById('progressBar');
const autoPlayBtn     = document.getElementById('autoPlayBtn');
const speedSlider     = document.getElementById('speedSlider');
const changesLog      = document.getElementById('changesLog');
const negativeCycleWarning = document.getElementById('negativeCycleWarning');

/* ── Build matrix input ────────────────────────────────────── */
function buildMatrixInput(n, prefill) {
  matrixInputCont.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'matrix-input-grid';
  grid.style.gridTemplateColumns = `repeat(${n}, 70px)`;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'matrix-input-cell' + (i === j ? ' diag' : '');
      inp.dataset.row = i;
      inp.dataset.col = j;
      inp.setAttribute('autocomplete', 'off');

      if (i === j) {
        inp.value = '0';
        inp.readOnly = true;
      } else if (prefill) {
        const v = prefill[i][j];
        inp.value = (v === 'INF' || v === null) ? 'INF' : String(v);
      } else {
        inp.placeholder = 'INF';
      }

      // Normalize on blur
      inp.addEventListener('blur', () => {
        const raw = inp.value.trim().toUpperCase();
        if (raw === '' || raw === 'INF' || raw === '∞' || raw === 'INFINITY') {
          inp.value = 'INF';
        }
      });

      grid.appendChild(inp);
    }
  }
  matrixInputCont.appendChild(grid);
  runBtn.disabled = false;
}

function getCurrentN() {
  const v = parseInt(vertexCountEl.value, 10);
  return isNaN(v) ? 0 : v;
}

buildBtn.addEventListener('click', () => {
  const n = getCurrentN();
  if (n < 2 || n > 10) {
    showError('Please enter a number of vertices between 2 and 10.');
    return;
  }
  clearError();
  buildMatrixInput(n);
});

/* Build default on load */
buildMatrixInput(4, PRESETS.disconnected.matrix);
vertexCountEl.value = 4;

/* ── Presets ───────────────────────────────────────────────── */
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.dataset.preset];
    if (!preset) return;
    vertexCountEl.value = preset.n;
    buildMatrixInput(preset.n, preset.matrix);
    clearError();
  });
});

/* ── Read matrix from inputs ───────────────────────────────── */
function readMatrixFromInputs() {
  const n = getCurrentN();
  const inputs = matrixInputCont.querySelectorAll('.matrix-input-cell');
  const matrix = Array.from({length: n}, () => Array(n).fill(null));

  for (const inp of inputs) {
    const r = parseInt(inp.dataset.row, 10);
    const c = parseInt(inp.dataset.col, 10);
    const raw = inp.value.trim().toUpperCase();
    if (raw === '' || raw === 'INF' || raw === '∞' || raw === 'INFINITY') {
      matrix[r][c] = 'INF';
    } else {
      const num = parseFloat(raw);
      if (isNaN(num)) {
        throw new Error(`Invalid value at [${r}][${c}]: "${inp.value}"`);
      }
      matrix[r][c] = num;
    }
  }
  return { n, matrix };
}

/* ── Run simulation ────────────────────────────────────────── */
runBtn.addEventListener('click', async () => {
  clearError();
  stopAutoPlay();

  let payload;
  try {
    payload = readMatrixFromInputs();
  } catch (e) {
    showError(e.message);
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = 'Computing…';

  try {
    const res = await fetch('/api/compute', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showError(data.error || 'Unknown error from server.');
      return;
    }

    state.steps = data.steps;
    state.n = data.n;
    state.currentStep = 0;

    negativeCycleWarning.style.display = data.has_negative_cycle ? 'block' : 'none';
    vizPanel.style.display = 'block';
    vizPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
    renderStep(0);

  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Simulation`;
  }
});

/* ── Reset ─────────────────────────────────────────────────── */
resetBtn.addEventListener('click', () => {
  stopAutoPlay();
  vizPanel.style.display = 'none';
  state = { steps: [], currentStep: 0, n: 0, autoPlayTimer: null, isPlaying: false };
  buildMatrixInput(getCurrentN());
  clearError();
});

/* ── Render a step ─────────────────────────────────────────── */
function renderStep(idx) {
  if (!state.steps.length) return;
  idx = Math.max(0, Math.min(idx, state.steps.length - 1));
  state.currentStep = idx;

  const step = state.steps[idx];
  const total = state.steps.length;

  // Update header info
  stepBadge.textContent = `Step ${idx} / ${total - 1}`;

  if (step.k === -1) {
    iterK.textContent = '—';
    iterDesc.textContent = 'Initial Matrix (A₀)';
  } else {
    iterK.textContent = `k = ${step.k}`;
    iterDesc.textContent = step.label;
  }

  // Progress bar
  const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
  progressBar.style.width = pct + '%';

  // Build set of changed cells for quick lookup
  const changedSet = new Set();
  const kRowCols = new Set(); // cells in k-th row/col
  if (step.k >= 0) {
    for (let x = 0; x < state.n; x++) {
      kRowCols.add(`${step.k}-${x}`);
      kRowCols.add(`${x}-${step.k}`);
    }
  }
  (step.changed || []).forEach(c => changedSet.add(`${c.row}-${c.col}`));

  // Render matrix grid
  matrixDisplay.style.gridTemplateColumns = `repeat(${state.n}, 64px)`;
  matrixDisplay.innerHTML = '';

  for (let i = 0; i < state.n; i++) {
    for (let j = 0; j < state.n; j++) {
      const cell = document.createElement('div');
      cell.className = 'matrix-cell';

      const val = step.matrix[i][j];
      const key = `${i}-${j}`;

      if (val === null) {
        cell.textContent = '∞';
        cell.classList.add('is-inf');
      } else {
        cell.textContent = val % 1 === 0 ? String(val) : val.toFixed(1);
      }

      if (i === j) {
        cell.classList.add('is-diagonal');
      } else if (changedSet.has(key)) {
        cell.classList.add('is-changed');
      } else if (step.k >= 0 && kRowCols.has(key)) {
        cell.classList.add('is-k-row');
      }

      // Tooltip
      cell.title = `dist[${i}][${j}] = ${val === null ? '∞' : val}`;

      matrixDisplay.appendChild(cell);
    }
  }

  // Changes log
  changesLog.innerHTML = '';
  const changed = step.changed || [];
  if (changed.length === 0) {
    changesLog.innerHTML = '<span class="no-changes">No cells updated in this step.</span>';
  } else {
    changed.forEach(c => {
      const span = document.createElement('span');
      span.className = 'change-item';
      const oldStr = c.old === null ? '∞' : c.old;
      const newStr = c.new === null ? '∞' : c.new;
      span.textContent = `[${c.row}→${c.col}] ${oldStr} → ${newStr}`;
      changesLog.appendChild(span);
    });
  }

  // Button states
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === total - 1;
}

/* ── Navigation ────────────────────────────────────────────── */
prevBtn.addEventListener('click', () => {
  stopAutoPlay();
  renderStep(state.currentStep - 1);
});
nextBtn.addEventListener('click', () => {
  stopAutoPlay();
  renderStep(state.currentStep + 1);
});

/* ── Keyboard navigation ───────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (vizPanel.style.display === 'none') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    stopAutoPlay();
    renderStep(state.currentStep + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    stopAutoPlay();
    renderStep(state.currentStep - 1);
  }
});

/* ── Auto play ─────────────────────────────────────────────── */
autoPlayBtn.addEventListener('click', () => {
  if (state.isPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
});

function startAutoPlay() {
  if (state.currentStep >= state.steps.length - 1) {
    renderStep(0);
  }
  state.isPlaying = true;
  autoPlayBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause`;
  scheduleNext();
}

function scheduleNext() {
  const delay = parseInt(speedSlider.value, 10);
  state.autoPlayTimer = setTimeout(() => {
    if (state.currentStep < state.steps.length - 1) {
      renderStep(state.currentStep + 1);
      scheduleNext();
    } else {
      stopAutoPlay();
    }
  }, delay);
}

function stopAutoPlay() {
  clearTimeout(state.autoPlayTimer);
  state.isPlaying = false;
  autoPlayBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Auto Play`;
}

/* ── Error helpers ─────────────────────────────────────────── */
function showError(msg) {
  errorMsg.textContent = '⚠ ' + msg;
  errorMsg.style.display = 'block';
}
function clearError() {
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
}
