/**
 * Interactive MIMO CODE logo + gather/burst particles.
 * OOM-safe: MAX_PARTICLES, gather throttle, single instance, destroyable.
 */

/**
 * Exact CLI logo from packages/opencode logo-data.ts (classic — used by logo.tsx).
 * Do NOT invent glyphs; keep leading spaces on right for Xiaomi/CODE alignment.
 */
const LOGO_LEFT = [
  '                                       ',
  '                                       ',
  '  ███╗   ███╗ ██╗ ███╗   ███╗  ██████╗ ',
  '  ████╗ ████║ ██║ ████╗ ████║ ██╔═══██╗',
  '  ██╔████╔██║ ██║ ██╔████╔██║ ██║   ██║',
  '  ██║╚██╔╝██║ ██║ ██║╚██╔╝██║ ██║   ██║',
  '  ██║ ╚═╝ ██║ ██║ ██║ ╚═╝ ██║ ╚██████╔╝',
  '  ╚═╝     ╚═╝ ╚═╝ ╚═╝     ╚═╝  ╚═════╝ ',
];
const LOGO_RIGHT = [
  '                              Xiaomi',
  '                                    ',
  ' ██████╗  ██████╗  ██████╗  ███████╗',
  '██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝',
  '██║      ██║   ██║ ██║  ██║ █████╗  ',
  '██║      ██║   ██║ ██║  ██║ ██╔══╝  ',
  '╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗',
  ' ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝',
];
const LOGO_FONT =
  '"Cascadia Mono", Consolas, "Courier New", ui-monospace, monospace';

const MIMO_ORANGE = { r: 255, g: 106, b: 0 };
const MIMO_GRAY = { r: 160, g: 160, b: 160 };
const PEAK = { r: 255, g: 255, b: 255 };
const CHARGE_MS = 3000;
const HOLD_MS = 90;
const LIFE_MS = 900;
const EXPAND = 1.5;
const GAIN = 2.0;
const WIDTH = 0.76;
/** Hard ceiling — OOM root was unbounded spawn per frame */
const MAX_PARTICLES = 90;
const GATHER_CAP = 45;
const GATHER_SPAWN_EVERY_MS = 48;

type Cell = {
  ch: string;
  gx: number;
  gy: number;
  base: typeof MIMO_ORANGE;
  px: number;
  py: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  mode: 'gather' | 'burst' | 'ring';
  color: { r: number; g: number; b: number };
  size: number;
};

export type LogoHandle = { destroy: () => void };

let activeLogo: LogoHandle | null = null;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function ramp(age: number, hold: number, charge: number): number {
  if (age <= hold) return 0;
  return Math.max(0, Math.min(1, (age - hold) / Math.max(1, charge - hold)));
}
function push(rise: number): number {
  return Math.pow(Math.max(0, Math.min(1, rise)), 0.72);
}
function tint(
  c: { r: number; g: number; b: number },
  d: { r: number; g: number; b: number },
  t: number
) {
  return {
    r: Math.round(lerp(c.r, d.r, t)),
    g: Math.round(lerp(c.g, d.g, t)),
    b: Math.round(lerp(c.b, d.b, t)),
  };
}
function css(c: { r: number; g: number; b: number }, a?: number): string {
  if (a === undefined || a >= 1) return `rgb(${c.r},${c.g},${c.b})`;
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function noise(x: number, y: number, t: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + t * 0.001) * 43758.5453;
  return n - Math.floor(n);
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

function buildCells(): { cells: Cell[]; cols: number; rows: number } {
  // CLI logo.tsx: FULL = left[y] + " ".repeat(GAP) + right[y] — keep all rows
  // so Xiaomi sits on the same row as the blank top of MIMO (not a huge gap).
  const gap = 1;
  const cells: Cell[] = [];
  const leftW = Math.max(...LOGO_LEFT.map((l) => (l || '').length));
  for (let y = 0; y < LOGO_LEFT.length; y++) {
    const L = LOGO_LEFT[y] || '';
    const R = LOGO_RIGHT[y] || '';
    for (let x = 0; x < leftW; x++) {
      const ch = L[x];
      if (ch && ch !== ' ')
        cells.push({ ch, gx: x, gy: y, base: MIMO_ORANGE, px: 0, py: 0 });
    }
    for (let x = 0; x < R.length; x++) {
      const ch = R[x];
      if (ch && ch !== ' ')
        cells.push({
          ch,
          gx: leftW + gap + x,
          gy: y,
          base: MIMO_GRAY,
          px: 0,
          py: 0,
        });
    }
  }
  const maxX = cells.reduce((m, c) => Math.max(m, c.gx), 0);
  const maxY = cells.reduce((m, c) => Math.max(m, c.gy), 0);
  return { cells, cols: maxX + 1, rows: maxY + 1 };
}

export function paintLogo(host: HTMLElement): LogoHandle {
  if (activeLogo) {
    try {
      activeLogo.destroy();
    } catch {
      /* */
    }
    activeLogo = null;
  }

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mimo-welcome';
  const logoBox = document.createElement('div');
  logoBox.className = 'mimo-welcome-logo';
  const canvas = document.createElement('canvas');
  canvas.className = 'mimo-logo-canvas';
  canvas.style.cursor = 'pointer';
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('tabindex', '0');
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
  let cellW = 12;
  let cellH = 12;
  let fontSize = 12;
  let W = 0;
  let H = 0;
  let hold: { at: number; cx: number; cy: number; vx: number; vy: number } | null =
    null;
  let rings: Array<{ x: number; y: number; at: number; force: number }> = [];
  let particles: Particle[] = [];
  let glow: { at: number; force: number } | null = null;
  let hum = false;
  let running = false;
  let raf = 0;
  let idleRaf = 0;
  let lastGatherSpawn = 0;
  let alive = true;
  let chargeAudio: HTMLAudioElement | null = null;
  let pulseShot = 0;
  const sfx = (window as any).__mimoSfx || {};
  const pulses = [sfx.pulseA, sfx.pulseB, sfx.pulseC].filter(Boolean);

  let fxCanvas = document.getElementById('mimo-logo-fx') as HTMLCanvasElement | null;
  if (!fxCanvas) {
    fxCanvas = document.createElement('canvas');
    fxCanvas.id = 'mimo-logo-fx';
    fxCanvas.className = 'mimo-logo-fx';
    fxCanvas.setAttribute('aria-hidden', 'true');
    const bg = document.getElementById('bg');
    if (bg?.parentNode) bg.parentNode.insertBefore(fxCanvas, bg.nextSibling);
    else document.body.appendChild(fxCanvas);
  }
  let fxW = 0;
  let fxH = 0;
  let logoOffX = 0;
  let logoOffY = 0;

  function syncLogoOffset(): { sx: number; sy: number } {
    try {
      const r = canvas.getBoundingClientRect();
      logoOffX = r.left;
      logoOffY = r.top;
      return { sx: r.width / Math.max(1, W), sy: r.height / Math.max(1, H) };
    } catch {
      return { sx: 1, sy: 1 };
    }
  }
  function localToViewport(lx: number, ly: number) {
    const s = syncLogoOffset();
    return { x: logoOffX + lx * s.sx, y: logoOffY + ly * s.sy };
  }
  function logoZoneRadius() {
    return Math.max(W, H) * 1.2 + 40;
  }
  function cellAt(px: number, py: number): Cell | null {
    let best: Cell | null = null;
    let bestD = 1e9;
    for (const c of grid.cells) {
      // c.px is left edge; hit-test against cell center
      const cx = c.px + cellW * 0.5;
      const cy = c.py;
      const d = (cx - px) ** 2 + (cy - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function pushParticle(p: Particle): void {
    if (particles.length >= MAX_PARTICLES) {
      // drop oldest non-ring first
      const idx = particles.findIndex((x) => x.mode === 'gather');
      if (idx >= 0) particles.splice(idx, 1);
      else particles.shift();
    }
    particles.push(p);
  }

  function layout(): void {
    if (!alive) return;
    // Pixel-perfect mono grid: measure █ at fontSize fs, cell = that advance.
    // NEVER set fontSize = advance (that shrinks glyphs and opens seams).
    const avail = Math.max(220, (host.clientWidth || 360) - 8);
    const probe = canvas.getContext('2d')!;
    // CLI/v1: square mono cells — cellW === cellH === measured █ advance.
    // fontSize stays the measured size (NOT set equal to advance).
    let fs = Math.floor(avail / Math.max(1, grid.cols));
    fs = Math.max(10, Math.min(28, fs)); // classic logo is wide (~70 cols)
    let advance = fs;
    let guard = 0;
    while (guard++ < 64) {
      probe.font = `600 ${fs}px ${LOGO_FONT}`;
      const pair = probe.measureText('██').width;
      const single = probe.measureText('█').width;
      advance = pair > 0 ? pair / 2 : single;
      if (!advance || advance < 3) advance = fs * 0.55;
      advance = Math.max(1, Math.round(advance));
      if (advance * grid.cols <= avail || fs <= 9) break;
      fs -= 1;
    }
    fontSize = fs;
    probe.font = `600 ${fontSize}px ${LOGO_FONT}`;
    const pair = probe.measureText('██').width;
    const pitch = Math.max(
      1,
      Math.round(pair > 0 ? pair / 2 : probe.measureText('█').width || advance)
    );
    // Square TUI cells — edge-to-edge like CLI (no tall row scale)
    cellW = pitch;
    cellH = pitch;
    W = grid.cols * cellW;
    H = grid.rows * cellH;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.style.margin = '0 auto';
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'pixelated';
    const stage = canvas.parentElement;
    if (stage) {
      stage.style.width = '100%';
      stage.style.height = H + 'px';
      stage.style.display = 'flex';
      stage.style.justifyContent = 'center';
      stage.style.alignItems = 'center';
      stage.style.overflow = 'visible';
      stage.style.margin = '0';
      stage.style.padding = '0';
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Left-edge X; top-baseline Y so each row sits in its own tall cell
    for (const c of grid.cells) {
      c.px = c.gx * cellW;
      // center glyph vertically inside taller cell
      c.py = c.gy * cellH + cellH * 0.5;
    }
    fxW = Math.max(1, window.innerWidth || 400);
    fxH = Math.max(1, window.innerHeight || 600);
    const maxFx = 1600;
    const fxScale = Math.min(1, maxFx / Math.max(fxW, fxH));
    const drawW = Math.floor(fxW * Math.min(dpr, 1.5) * fxScale);
    const drawH = Math.floor(fxH * Math.min(dpr, 1.5) * fxScale);
    fxCanvas!.width = Math.max(1, drawW);
    fxCanvas!.height = Math.max(1, drawH);
    fxCanvas!.style.width = fxW + 'px';
    fxCanvas!.style.height = fxH + 'px';
    const fctx = fxCanvas!.getContext('2d')!;
    fctx.setTransform(drawW / fxW, 0, 0, drawH / fxH, 0, 0);
    syncLogoOffset();
  }

  function spawnGather(tx: number, ty: number, rise: number, n: number): void {
    const zone = logoZoneRadius();
    const rMin = zone * lerp(0.4, 0.55, rise);
    const rMax = zone * lerp(0.7, 0.95, rise);
    const room = Math.max(0, Math.min(n, GATHER_CAP - particles.filter((p) => p.mode === 'gather').length, MAX_PARTICLES - particles.length));
    for (let i = 0; i < room; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = lerp(rMin, rMax, Math.random());
      const side = Math.random() < 0.58 ? MIMO_ORANGE : MIMO_GRAY;
      pushParticle({
        x: tx + Math.cos(ang) * r,
        y: ty + Math.sin(ang) * r,
        vx: 0,
        vy: 0,
        life: 1,
        mode: 'gather',
        color: tint(side, PEAK, rise * 0.4 + Math.random() * 0.2),
        size: lerp(1.4, 2.8, Math.random() * (0.4 + rise)),
      });
    }
  }

  function spawnBurst(cx: number, cy: number, level: number): void {
    const reach = logoZoneRadius() * lerp(0.5, 0.85, level);
    const count = Math.min(
      50,
      Math.floor(lerp(28, 55, level)),
      MAX_PARTICLES - particles.length
    );
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = lerp(reach * 0.04, reach * 0.14, level) * (0.5 + Math.random());
      const side = Math.random() < 0.55 ? MIMO_ORANGE : MIMO_GRAY;
      pushParticle({
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 6,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        mode: 'burst',
        color: tint(side, PEAK, 0.4 + level * 0.5),
        size: lerp(1.4, 3.0, Math.random() * level),
      });
    }
    const ringN = Math.min(36, Math.floor(lerp(16, 36, level)));
    for (let i = 0; i < ringN; i++) {
      const ang = (i / ringN) * Math.PI * 2;
      const spd = lerp(reach * 0.05, reach * 0.12, level);
      pushParticle({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        mode: 'ring',
        color: tint(MIMO_ORANGE, PEAK, 0.7),
        size: 2.0,
      });
    }
  }

  function fieldBoost(c: Cell, t: number) {
    let boost = 0;
    let peak = 0;
    if (hold) {
      const age = t - hold.at;
      const rise = ramp(age, HOLD_MS, CHARGE_MS);
      const dist =
        Math.hypot(c.px + cellW * 0.5 - hold.cx, c.py - hold.cy) / cellW;
      const core = Math.exp(-(dist * dist) / Math.max(0.35, lerp(0.5, 12, rise)));
      const shell = Math.exp(-Math.pow((dist - lerp(0.4, 5, rise)) / 1.4, 2));
      boost += (core * 2.2 + shell * 1.1) * rise + rise * 0.3;
      peak += core * rise * 1.1 + rise * 0.15;
      boost += Math.max(0, noise(c.gx, c.gy, t) - 0.7) * rise * 1.8;
    }
    for (const r of rings) {
      const age = t - r.at;
      if (age < 0 || age > LIFE_MS) continue;
      const p = age / LIFE_MS;
      const dist = Math.hypot(c.px + cellW * 0.5 - r.x, c.py - r.y) / cellW;
      const radius =
        Math.max(grid.cols, grid.rows) * 1.1 * (1 - Math.pow(1 - p, EXPAND));
      const fade = Math.pow(1 - p, 1.15);
      const edge =
        Math.exp(-Math.pow((dist - radius) / (WIDTH * 1.35), 2)) *
        GAIN *
        fade *
        r.force;
      const flash =
        Math.exp(-(dist * dist) / 4.5) *
        2.2 *
        r.force *
        Math.max(0, 1 - age / 160);
      boost += edge + flash;
      peak += flash * 0.9 + edge * 0.5;
    }
    if (glow) {
      const age = t - glow.at;
      if (age < 1200) {
        const g = Math.exp(-age / 700) * glow.force;
        boost += g * 0.3;
        peak += g * 0.12;
      }
    }
    return { boost: Math.min(3.5, boost), peak: Math.min(1.4, peak) };
  }

  function soundStart() {
    try {
      if (chargeAudio) {
        chargeAudio.pause();
        chargeAudio = null;
      }
    } catch {
      /* */
    }
    chargeAudio = playUrl(sfx.charge, 0.22);
  }
  function soundStop(delayMs: number) {
    const run = () => {
      try {
        if (chargeAudio) {
          chargeAudio.pause();
          chargeAudio.currentTime = 0;
          chargeAudio = null;
        }
      } catch {
        /* */
      }
    };
    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }
  function soundPulse(scale: number) {
    soundStop(120);
    if (pulses.length) {
      const url = pulses[pulseShot++ % pulses.length];
      setTimeout(() => playUrl(url, 0.24 + 0.12 * scale), 30);
    }
  }

  function doBurst(localCx: number, localCy: number, t: number): void {
    const age = hold ? t - hold.at : CHARGE_MS;
    const rise = ramp(age, HOLD_MS, CHARGE_MS);
    const level = push(Math.max(0.3, rise));
    hum = false;
    const vt = localToViewport(localCx, localCy);
    const bx = hold?.vx ?? vt.x;
    const by = hold?.vy ?? vt.y;
    for (const p of particles) {
      if (p.mode !== 'gather') continue;
      const dx = p.x - bx;
      const dy = p.y - by;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = lerp(3, 10, level);
      p.vx = (dx / dist) * spd * (0.55 + Math.random() * 0.6);
      p.vy = (dy / dist) * spd * (0.55 + Math.random() * 0.6);
      p.mode = 'burst';
      p.color = tint(p.color, PEAK, 0.55);
      p.life = 1;
    }
    spawnBurst(bx, by, level);
    rings.push({ x: localCx, y: localCy, at: t, force: lerp(0.9, 2.4, level) });
    if (rings.length > 3) rings.shift();
    glow = { at: t, force: lerp(0.3, 1.5, rise * level) };
    soundPulse(lerp(0.75, 1, level));
    startLoop();
  }

  function draw(t: number): void {
    if (!alive) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    // Draw at measurement font; left-align at cell origin so █ edges touch
    ctx.font = `600 ${fontSize}px ${LOGO_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;
    try {
      (ctx as any).letterSpacing = '0px';
    } catch {
      /* */
    }
    for (const c of grid.cells) {
      const f = fieldBoost(c, t);
      let col = c.base;
      if (f.boost > 0.02) {
        col = tint(c.base, MIMO_ORANGE, Math.min(0.6, f.boost * 0.28));
        col = tint(col, PEAK, Math.min(1, f.peak * 0.85 + f.boost * 0.12));
      } else if (!hold && !rings.length) {
        const sh = 0.5 + 0.5 * Math.sin(t * 0.0015 + c.gx * 0.4 + c.gy);
        col = tint(c.base, PEAK, sh * 0.04);
      }
      ctx.fillStyle = css(col, 1);
      // No idle shadow — blur made blocks look gapped
      if (f.boost > 0.35) {
        ctx.shadowColor = css(tint(c.base, PEAK, 0.55), 0.55);
        ctx.shadowBlur = 4 + f.boost * 10;
      } else {
        ctx.shadowBlur = 0;
      }
      const px = Math.round(c.px * dpr) / dpr;
      const py = Math.round(c.py * dpr) / dpr;
      ctx.fillText(c.ch, px, py);
    }
    ctx.shadowBlur = 0;

    const fctx = fxCanvas!.getContext('2d')!;
    fctx.clearRect(0, 0, fxW, fxH);
    for (const p of particles) {
      const a = Math.max(0, Math.min(1, p.life));
      fctx.beginPath();
      fctx.fillStyle = css(p.color, a * (p.mode === 'gather' ? 0.9 : 0.85));
      fctx.arc(p.x, p.y, p.size * (0.55 + a * 0.5), 0, Math.PI * 2);
      fctx.fill();
    }
  }

  function tick(t: number): void {
    if (!alive) return;
    if (document.hidden) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (hold && !hum && t - hold.at >= HOLD_MS) {
      hum = true;
      soundStart();
    }
    if (hold && t - hold.at >= CHARGE_MS) {
      doBurst(hold.cx, hold.cy, t);
      hold = null;
    }
    if (hold) {
      const age = t - hold.at;
      const rise = ramp(age, HOLD_MS, CHARGE_MS);
      const vt = localToViewport(hold.cx, hold.cy);
      hold.vx = vt.x;
      hold.vy = vt.y;
      if (t - lastGatherSpawn >= GATHER_SPAWN_EVERY_MS) {
        lastGatherSpawn = t;
        const gatherCount = particles.filter((p) => p.mode === 'gather').length;
        if (gatherCount < GATHER_CAP && particles.length < MAX_PARTICLES) {
          spawnGather(hold.vx, hold.vy, rise, 2 + Math.floor(rise * 2));
        }
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.mode === 'gather' && hold) {
        const dx = hold.vx - p.x;
        const dy = hold.vy - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const rise = ramp(t - hold.at, HOLD_MS, CHARGE_MS);
        const speed = lerp(3.5, 12, rise) + dist * 0.035;
        p.vx = (dx / dist) * speed;
        p.vy = (dy / dist) * speed;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.hypot(hold.vx - p.x, hold.vy - p.y) < Math.max(10, cellW * 0.9))
          p.life = 0;
        else p.life -= 0.004;
      } else {
        p.vx *= 0.975;
        p.vy *= 0.975;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.mode === 'ring' ? 0.016 : 0.013;
      }
      if (p.life <= 0) particles.splice(i, 1);
    }
    rings = rings.filter((r) => t - r.at < LIFE_MS);
    if (glow && t - glow.at >= 1200) glow = null;

    draw(t);

    const live = hold || rings.length > 0 || particles.length > 0 || glow;
    if (!live) {
      running = false;
      raf = 0;
      // one idle frame already drawn; idleLoop handles shimmer
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function startLoop(): void {
    if (!alive || running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }

  function press(px: number, py: number): void {
    if (!alive) return;
    const t = performance.now();
    if (hold) doBurst(hold.cx, hold.cy, t);
    const cell = cellAt(px, py);
    // hold coords = cell center (px is left edge in left-align layout)
    const cx = cell ? cell.px + cellW * 0.5 : px;
    const cy = cell ? cell.py : py;
    const vt = localToViewport(cx, cy);
    hold = { at: t, cx, cy, vx: vt.x, vy: vt.y };
    hum = false;
    particles = particles.filter((p) => p.mode !== 'gather');
    lastGatherSpawn = 0;
    startLoop();
  }

  function release(): void {
    if (!hold || !alive) return;
    const t = performance.now();
    doBurst(hold.cx, hold.cy, t);
    hold = null;
  }

  function onPointerDown(e: MouseEvent | TouchEvent): void {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const px = (clientX - rect.left) * (W / Math.max(1, rect.width));
    const py = (clientY - rect.top) * (H / Math.max(1, rect.height));
    press(px, py);
  }
  function onPointerUp(e: Event): void {
    e.preventDefault();
    release();
  }
  function onResize(): void {
    layout();
    draw(performance.now());
  }

  layout();
  draw(performance.now());

  // Idle shimmer at ~20fps when not charging (not 60fps forever waste)
  let lastIdle = 0;
  function idleLoop(t: number) {
    if (!alive) return;
    if (!running && !document.hidden && t - lastIdle > 50) {
      lastIdle = t;
      draw(t);
    }
    idleRaf = requestAnimationFrame(idleLoop);
  }
  idleRaf = requestAnimationFrame(idleLoop);

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', () => {
    if (hold) release();
  });
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchend', onPointerUp);
  window.addEventListener('resize', onResize);

  const handle: LogoHandle = {
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (idleRaf) cancelAnimationFrame(idleRaf);
      raf = 0;
      idleRaf = 0;
      running = false;
      particles = [];
      rings = [];
      hold = null;
      glow = null;
      soundStop(0);
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('resize', onResize);
      try {
        const fctx = fxCanvas?.getContext('2d');
        if (fctx && fxCanvas) fctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      } catch {
        /* */
      }
      if (activeLogo === handle) activeLogo = null;
    },
  };
  activeLogo = handle;
  return handle;
}
