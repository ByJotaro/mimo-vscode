/**
 * MiMo Code CLI starfield 1:1 spirit:
 * density twinkle stars (✦✧✶), warm gold tint, diagonal meteors as braille beams.
 * Background void #0a0a0a.
 */

const STAR_CHARS = ['✦', '✧', '✦', '✧', '✦', '✧', '·'];
const HOT_CHAR = '✶';
const HOT_THRESHOLD = 0.88;
const DENSITY = 0.0042;
const TWINKLE_MS = 200;
const METEOR_INTERVAL = 8000;
const METEOR_DURATION = 3600;
const METEOR_ANGLE = 0.36;
const METEOR_TAIL = 32;
const METEOR_STEP = 0.18;
const BG = '#0a0a0a';
const GOLD = { r: 237, g: 220, b: 170 };
const WHITE = { r: 255, g: 255, b: 255 };
const BEAM_CORE = { r: 255, g: 255, b: 255 };
const BEAM_GLOW = { r: 180, g: 215, b: 255 };

type Star = {
  x: number;
  y: number;
  ch: string;
  b: number; // brightness 0..1
  phase: number;
};

type Meteor = {
  at: number;
  startX: number;
  startY: number;
  speed: number;
};

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

export function startStarfield(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let cell = 14; // mono cell px
  let cols = 0;
  let rows = 0;
  let stars: Star[] = [];
  let meteor: Meteor | null = null;
  let lastTwinkle = 0;
  let lastMeteor = 0;

  function resize(): void {
    W = window.innerWidth || 400;
    H = window.innerHeight || 600;
    canvas!.width = Math.floor(W * dpr);
    canvas!.height = Math.floor(H * dpr);
    canvas!.style.width = W + 'px';
    canvas!.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ~ terminal cell size
    cell = Math.max(11, Math.min(16, Math.floor(W / 48)));
    cols = Math.max(8, Math.floor(W / cell));
    rows = Math.max(8, Math.floor(H / (cell * 1.15)));
    stars = [];
    const n = Math.floor(cols * rows * DENSITY * 12);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * cols,
        y: Math.random() * rows,
        ch: STAR_CHARS[Math.floor(Math.random() * (STAR_CHARS.length - 1))],
        b: 0.15 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function twinkle(): void {
    const count = Math.floor(cols * rows * 0.008);
    for (let i = 0; i < count; i++) {
      if (!stars.length) break;
      const s = stars[Math.floor(Math.random() * stars.length)];
      const r = Math.random();
      s.b =
        r < 0.12
          ? 0.92 + Math.random() * 0.08
          : r < 0.8
            ? 0.7 + Math.random() * 0.22
            : 0.05 + Math.random() * 0.2;
      if (s.b >= HOT_THRESHOLD) s.ch = HOT_CHAR;
      else if (s.ch === HOT_CHAR)
        s.ch = STAR_CHARS[Math.floor(Math.random() * (STAR_CHARS.length - 1))];
    }
  }

  function spawnMeteor(now: number): void {
    const startY = Math.random() * 2;
    const speed = Math.max(
      0.011,
      Math.min(0.038, (rows - startY) / (Math.sin(METEOR_ANGLE) * METEOR_DURATION))
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
    const headSubX = Math.floor(headX * 2);
    const headSubY = Math.floor(headY * 4);
    for (let dsx = -1; dsx <= 1; dsx++) {
      for (let dsy = -1; dsy <= 1; dsy++) {
        if (dsx * dsx + dsy * dsy > 1) continue;
        const subX = headSubX + dsx;
        const subY = headSubY + dsy;
        const cx = subX >> 1;
        const cy = subY >> 2;
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
        const bit = brailleBit(subX & 1, subY & 3);
        const key = `${cx},${cy}`;
        const existing = cellAcc.get(key);
        cellAcc.set(key, {
          dots: (existing?.dots ?? 0) | (1 << bit),
          minT: 0,
        });
      }
    }
    const cw = W / cols;
    const ch = H / rows;
    ctx!.font = `${Math.floor(cell * 0.95)}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';
    for (const [key, val] of cellAcc) {
      const [sx, sy] = key.split(',').map(Number);
      const fade = Math.pow(1 - val.minT / METEOR_TAIL, 1.3) * envelope;
      const headBlend = Math.max(0, 1 - val.minT / 5);
      const col = tint(
        { r: 10, g: 10, b: 10 },
        tint(BEAM_GLOW, BEAM_CORE, headBlend),
        Math.max(0.08, fade)
      );
      const chStr = String.fromCharCode(0x2800 + val.dots);
      ctx!.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      ctx!.fillText(chStr, (sx + 0.5) * cw, (sy + 0.5) * ch);
    }
  }

  function tick(now: number): void {
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
    ctx!.font = `${Math.floor(cell * 0.9)}px "Cascadia Mono", Consolas, monospace`;
    ctx!.textAlign = 'center';
    ctx!.textBaseline = 'middle';

    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.0018 + s.phase);
      let b = s.b * tw;
      const isHot = b >= HOT_THRESHOLD;
      const peak = isHot ? Math.min(1, (b - HOT_THRESHOLD) / (1 - HOT_THRESHOLD)) : 0;
      let col = tint({ r: 10, g: 10, b: 10 }, GOLD, Math.min(1, b * 1.05));
      if (peak > 0) col = tint(col, WHITE, peak * 0.65);
      const alpha = Math.max(0.12, Math.min(1, b * 1.1));
      ctx!.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
      ctx!.fillText(isHot ? HOT_CHAR : s.ch, (s.x + 0.5) * cw, (s.y + 0.5) * ch);
    }

    drawMeteor(now);
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
}
