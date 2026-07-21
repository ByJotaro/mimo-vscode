/** CLI logoThin — square mono cells, #FF6A00 / #a0a0a0 */

const LOGO_LEFT = [
  '                  ',
  '                  ',
  '█▀▄▀█ █ █▀▄▀█ █▀▀█',
  '█ ▀ █ █ █ ▀ █ █  █',
  '▀   ▀ ▀ ▀   ▀ ▀▀▀▀',
];
const LOGO_RIGHT = [
  '            Xiaomi',
  '                  ',
  '█▀▀ █▀▀█ █▀▀▄ █▀▀▀',
  '█   █  █ █  █ █▀▀ ',
  '▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀',
];

const ORANGE = { r: 255, g: 106, b: 0 };
const GRAY = { r: 160, g: 160, b: 160 };

type Cell = { ch: string; gx: number; gy: number; base: typeof ORANGE; px?: number; py?: number };

function buildCells(): { cells: Cell[]; cols: number; rows: number } {
  const gap = 1;
  const cells: Cell[] = [];
  let y0 = 0;
  for (let y = 0; y < LOGO_LEFT.length; y++) {
    if (/[^\s]/.test(LOGO_LEFT[y]) || /[^\s]/.test(LOGO_RIGHT[y] || '')) {
      y0 = y;
      break;
    }
  }
  const leftW = Math.max(...LOGO_LEFT.map((l) => (l || '').replace(/\s+$/, '').length || 0));
  for (let y = y0; y < LOGO_LEFT.length; y++) {
    const L = LOGO_LEFT[y] || '';
    const R = LOGO_RIGHT[y] || '';
    const gy = y - y0;
    for (let x = 0; x < leftW; x++) {
      const ch = L[x];
      if (ch && ch !== ' ') cells.push({ ch, gx: x, gy, base: ORANGE });
    }
    for (let x = 0; x < R.length; x++) {
      const ch = R[x];
      if (ch && ch !== ' ') cells.push({ ch, gx: leftW + gap + x, gy, base: GRAY });
    }
  }
  const maxX = cells.reduce((m, c) => Math.max(m, c.gx), 0);
  const maxY = cells.reduce((m, c) => Math.max(m, c.gy), 0);
  return { cells, cols: maxX + 1, rows: maxY + 1 };
}

export function paintLogo(host: HTMLElement): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mimo-welcome';
  const logoBox = document.createElement('div');
  logoBox.className = 'mimo-welcome-logo';
  const canvas = document.createElement('canvas');
  canvas.className = 'mimo-logo-canvas';
  logoBox.appendChild(canvas);
  wrap.appendChild(logoBox);
  const sub = document.createElement('div');
  sub.className = 'mimo-welcome-sub';
  sub.textContent = 'Where models and agents co-evolve';
  wrap.appendChild(sub);
  host.appendChild(wrap);

  const grid = buildCells();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function layout(): void {
    const avail = Math.max(220, (host.clientWidth || 360) - 8);
    let fs = Math.floor(avail / Math.max(1, grid.cols));
    fs = Math.max(14, Math.min(36, fs));
    let advance = fs;
    let guard = 0;
    while (guard++ < 48) {
      ctx!.font = `600 ${fs}px "Cascadia Mono", Consolas, monospace`;
      const pair = ctx!.measureText('██').width;
      advance = pair > 0 ? pair / 2 : ctx!.measureText('█').width;
      if (!advance || advance < 4) advance = fs * 0.55;
      advance = Math.max(1, Math.round(advance));
      if (advance * grid.cols <= avail || fs <= 12) break;
      fs -= 1;
    }
    const cell = advance;
    const W = grid.cols * cell;
    const H = grid.rows * cell;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of grid.cells) {
      c.px = c.gx * cell + cell * 0.5;
      c.py = c.gy * cell + cell * 0.5;
    }
    ctx!.clearRect(0, 0, W, H);
    ctx!.font = `600 ${cell}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.imageSmoothingEnabled = false;
    for (const c of grid.cells) {
      ctx!.fillStyle = `rgb(${c.base.r},${c.base.g},${c.base.b})`;
      ctx!.fillText(c.ch, c.px!, c.py!);
    }
  }
  layout();
  window.addEventListener('resize', layout);
}
