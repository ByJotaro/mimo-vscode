/**
 * CLI-style starfield — OOM-safe:
 * capped star count, one RAF, pause when tab hidden, destroyable.
 */

// CLI 1:1 — braille dots only (no decorative ✦/✧/✶). Base = U+2800 + bit mask.
function brailleChar(mask: number): string {
  return String.fromCharCode(0x2800 + (mask & 0xff));
}
/** Single-dot braille patterns (quiet field) */
const STAR_MASKS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];
/** Multi-dot “hot” twinkles */
const HOT_MASKS = [0x15, 0x2a, 0x3f, 0x55, 0xaa, 0x5a];
const HOT_THRESHOLD = 0.88;
const MAX_STARS = 160;
const TWINKLE_MS = 240;
const METEOR_INTERVAL = 8000;
const METEOR_DURATION = 2800;
const METEOR_ANGLE = 0.36;
const METEOR_TAIL = 20;
const METEOR_STEP = 0.35;
const BG = '#0a0a0a';
const GOLD = { r: 237, g: 220, b: 170 };
const WHITE = { r: 255, g: 255, b: 255 };
const BEAM_CORE = { r: 255, g: 255, b: 255 };
const BEAM_GLOW = { r: 180, g: 215, b: 255 };

type Star = { x: number; y: number; mask: number; b: number; phase: number };
type Meteor = { at: number; startX: number; startY: number; speed: number };

type StarfieldHandle = { destroy: () => void };

let active: StarfieldHandle | null = null;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
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
function brailleBit(col: number, row: number): number {
  if (col === 0) return row === 3 ? 6 : row;
  return row === 3 ? 7 : 3 + row;
}

export function startStarfield(canvas: HTMLCanvasElement | null): StarfieldHandle {
  if (active) {
    try {
      active.destroy();
    } catch {
      /* */
    }
    active = null;
  }
  if (!canvas) {
    return { destroy: () => undefined };
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return { destroy: () => undefined };

  // Cap DPR — full retina * huge canvas = OOM
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0;
  let H = 0;
  let cell = 14;
  let cols = 0;
  let rows = 0;
  let stars: Star[] = [];
  let meteor: Meteor | null = null;
  let lastTwinkle = 0;
  let lastMeteor = 0;
  let raf = 0;
  let alive = true;
  let paused = document.hidden;

  function resize(): void {
    if (!alive) return;
    W = Math.max(1, window.innerWidth || 400);
    H = Math.max(1, window.innerHeight || 600);
    // Slightly lower internal res than CSS for cheap paint
    const scale = dpr;
    canvas!.width = Math.floor(W * scale);
    canvas!.height = Math.floor(H * scale);
    canvas!.style.width = W + 'px';
    canvas!.style.height = H + 'px';
    ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    cell = Math.max(12, Math.min(16, Math.floor(W / 42)));
    cols = Math.max(8, Math.floor(W / cell));
    rows = Math.max(8, Math.floor(H / (cell * 1.2)));
    // denser field than before but still OOM-capped
    const target = Math.min(MAX_STARS, Math.floor(cols * rows * 0.028));
    stars = [];
    for (let i = 0; i < target; i++) {
      stars.push({
        x: Math.random() * cols,
        y: Math.random() * rows,
        mask: STAR_MASKS[Math.floor(Math.random() * STAR_MASKS.length)],
        b: 0.22 + Math.random() * 0.48,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function twinkle(): void {
    const count = Math.min(12, Math.floor(stars.length * 0.1));
    for (let i = 0; i < count; i++) {
      const s = stars[Math.floor(Math.random() * stars.length)];
      if (!s) continue;
      const r = Math.random();
      s.b =
        r < 0.12
          ? 0.92 + Math.random() * 0.08
          : r < 0.8
            ? 0.65 + Math.random() * 0.25
            : 0.08 + Math.random() * 0.2;
      s.mask =
        s.b >= HOT_THRESHOLD
          ? HOT_MASKS[Math.floor(Math.random() * HOT_MASKS.length)]
          : STAR_MASKS[Math.floor(Math.random() * STAR_MASKS.length)];
    }
  }

  function spawnMeteor(now: number): void {
    const startY = Math.random() * 2;
    const speed = Math.max(
      0.012,
      Math.min(0.032, (rows - startY) / (Math.sin(METEOR_ANGLE) * METEOR_DURATION))
    );
    meteor = {
      at: now,
      startX: cols - Math.random() * Math.max(1, cols * 0.15),
      startY,
      speed,
    };
  }

  function drawMeteor(now: number): void {
    if (!meteor) return;
    const elapsed = now - meteor.at;
    if (elapsed < 0 || elapsed > METEOR_DURATION) {
      meteor = null;
      return;
    }
    const distance = elapsed * meteor.speed;
    const dx = -Math.cos(METEOR_ANGLE);
    const dy = Math.sin(METEOR_ANGLE);
    const headX = meteor.startX + distance * dx;
    const headY = meteor.startY + distance * dy;
    const envelope = Math.sin((elapsed / METEOR_DURATION) * Math.PI);
    const cellAcc = new Map<string, { dots: number; minT: number }>();
    const setDot = (px: number, py: number, t: number) => {
      const subX = Math.floor(px * 2);
      const subY = Math.floor(py * 4);
      const cx = subX >> 1;
      const cy = subY >> 2;
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
      const bit = brailleBit(subX & 1, subY & 3);
      const key = `${cx},${cy}`;
      const existing = cellAcc.get(key);
      cellAcc.set(key, {
        dots: (existing?.dots ?? 0) | (1 << bit),
        minT: Math.min(existing?.minT ?? Infinity, t),
      });
    };
    for (let t = 0; t <= METEOR_TAIL; t += METEOR_STEP) {
      setDot(headX - t * dx, headY - t * dy, t);
    }
    // hard cap meteor glyphs so Map never explodes
    if (cellAcc.size > 80) {
      const keys = [...cellAcc.keys()].slice(80);
      for (const k of keys) cellAcc.delete(k);
    }
    const cw = W / cols;
    const ch = H / rows;
    ctx!.font = `${Math.floor(cell * 0.9)}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    for (const [key, val] of cellAcc) {
      const [sx, sy] = key.split(',').map(Number);
      const fade = Math.pow(1 - val.minT / METEOR_TAIL, 1.3) * envelope;
      const headBlend = Math.max(0, 1 - val.minT / 5);
      const col = tint(
        { r: 10, g: 10, b: 10 },
        tint(BEAM_GLOW, BEAM_CORE, headBlend),
        Math.max(0.1, fade)
      );
      ctx!.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      ctx!.fillText(
        String.fromCharCode(0x2800 + val.dots),
        (sx + 0.5) * cw,
        (sy + 0.5) * ch
      );
    }
  }

  function tick(now: number): void {
    if (!alive) return;
    if (paused) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (now - lastTwinkle > TWINKLE_MS) {
      twinkle();
      lastTwinkle = now;
    }
    if (!meteor && now - lastMeteor > METEOR_INTERVAL) {
      spawnMeteor(now);
      lastMeteor = now;
    }

    ctx!.fillStyle = BG;
    ctx!.fillRect(0, 0, W, H);

    const cw = W / cols;
    const ch = H / rows;
    ctx!.font = `${Math.floor(cell * 0.85)}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';

    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.0015 + s.phase);
      const b = s.b * tw;
      const isHot = b >= HOT_THRESHOLD;
      const peak = isHot ? Math.min(1, (b - HOT_THRESHOLD) / (1 - HOT_THRESHOLD)) : 0;
      let col = tint({ r: 10, g: 10, b: 10 }, GOLD, Math.min(1, b * 1.05));
      if (peak > 0) col = tint(col, WHITE, peak * 0.65);
      const alpha = Math.max(0.15, Math.min(1, b * 1.05));
      ctx!.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
      ctx!.fillText(brailleChar(s.mask), (s.x + 0.5) * cw, (s.y + 0.5) * ch);
    }
    drawMeteor(now);
    raf = requestAnimationFrame(tick);
  }

  function onVis(): void {
    paused = document.hidden;
  }
  function onResize(): void {
    resize();
  }

  resize();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(tick);

  const handle: StarfieldHandle = {
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stars = [];
      meteor = null;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}
