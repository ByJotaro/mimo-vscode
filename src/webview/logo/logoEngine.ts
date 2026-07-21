/** CLI logoThin — square mono cells, hold-to-charge + SFX */

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
const PEAK = { r: 255, g: 255, b: 255 };

type Cell = {
  ch: string;
  gx: number;
  gy: number;
  base: typeof ORANGE;
  px?: number;
  py?: number;
};

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

function playUrl(url: string | undefined, volume: number): HTMLAudioElement | null {
  if (!url) return null;
  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
    return a;
  } catch {
    return null;
  }
}

function tint(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
) {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export function paintLogo(host: HTMLElement): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mimo-welcome';
  const logoBox = document.createElement('div');
  logoBox.className = 'mimo-welcome-logo';
  const canvas = document.createElement('canvas');
  canvas.className = 'mimo-logo-canvas';
  canvas.style.cursor = 'pointer';
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'MiMo Code logo — hold to charge');
  logoBox.appendChild(canvas);
  wrap.appendChild(logoBox);
  const sub = document.createElement('div');
  sub.className = 'mimo-welcome-sub';
  sub.textContent = 'Where models and agents co-evolve';
  wrap.appendChild(sub);
  const hint = document.createElement('div');
  hint.className = 'mimo-welcome-hint';
  hint.textContent = 'Hold the logo to charge · release to burst · / commands';
  wrap.appendChild(hint);
  host.appendChild(wrap);

  const grid = buildCells();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let cell = 12;
  let W = 0;
  let H = 0;
  let holdAt: number | null = null;
  let chargeAudio: HTMLAudioElement | null = null;
  let pulseShot = 0;
  const sfx = (window as any).__mimoSfx || {};
  const pulses = [sfx.pulseA, sfx.pulseB, sfx.pulseC].filter(Boolean);

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
    cell = advance;
    W = grid.cols * cell;
    H = grid.rows * cell;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of grid.cells) {
      c.px = c.gx * cell + cell * 0.5;
      c.py = c.gy * cell + cell * 0.5;
    }
  }

  function draw(t: number): void {
    const charge =
      holdAt != null ? Math.min(1, (t - holdAt) / 3000) : 0;
    ctx!.clearRect(0, 0, W, H);
    ctx!.font = `600 ${cell}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    ctx!.imageSmoothingEnabled = false;
    for (const c of grid.cells) {
      let col = c.base;
      if (charge > 0.02) {
        col = tint(c.base, ORANGE, Math.min(0.55, charge * 0.4));
        col = tint(col, PEAK, charge * 0.35);
      } else {
        const sh = 0.5 + 0.5 * Math.sin(t * 0.0015 + c.gx * 0.4 + c.gy);
        col = tint(c.base, PEAK, sh * 0.04);
      }
      ctx!.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      if (charge > 0.3) {
        ctx!.shadowColor = `rgba(255,106,0,${0.35 + charge * 0.4})`;
        ctx!.shadowBlur = 4 + charge * 14;
      } else {
        ctx!.shadowBlur = 0;
      }
      ctx!.fillText(c.ch, c.px!, c.py!);
    }
    ctx!.shadowBlur = 0;
  }

  function loop(t: number): void {
    draw(t);
    requestAnimationFrame(loop);
  }

  function press(): void {
    holdAt = performance.now();
    try {
      if (chargeAudio) {
        chargeAudio.pause();
        chargeAudio = null;
      }
    } catch {
      /* */
    }
    chargeAudio = playUrl(sfx.charge, 0.24);
  }

  function release(): void {
    if (holdAt == null) return;
    const scale = Math.min(1, (performance.now() - holdAt) / 3000);
    holdAt = null;
    try {
      if (chargeAudio) {
        chargeAudio.pause();
        chargeAudio.currentTime = 0;
        chargeAudio = null;
      }
    } catch {
      /* */
    }
    if (pulses.length) {
      const url = pulses[pulseShot++ % pulses.length];
      setTimeout(() => playUrl(url, 0.26 + 0.14 * scale), 30);
    }
  }

  layout();
  requestAnimationFrame(loop);
  window.addEventListener('resize', () => {
    layout();
  });
  canvas.addEventListener('mousedown', press);
  canvas.addEventListener('mouseup', release);
  canvas.addEventListener('mouseleave', release);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    press();
  }, { passive: false });
  canvas.addEventListener('touchend', release);
}
