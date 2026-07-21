/** Lightweight braille/dot starfield on #0a0a0a void */

export function startStarfield(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  type Star = { x: number; y: number; r: number; a: number; s: number };
  let stars: Star[] = [];
  let W = 0;
  let H = 0;

  function resize(): void {
    W = window.innerWidth || 400;
    H = window.innerHeight || 600;
    canvas!.width = Math.floor(W * dpr);
    canvas!.height = Math.floor(H * dpr);
    canvas!.style.width = W + 'px';
    canvas!.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(180, Math.floor((W * H) / 12000));
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.6 + 0.15,
        s: Math.random() * 0.15 + 0.02,
      });
    }
  }

  function tick(t: number): void {
    ctx!.fillStyle = '#0a0a0a';
    ctx!.fillRect(0, 0, W, H);
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * st.s * 40 + st.x);
      ctx!.beginPath();
      ctx!.fillStyle = `rgba(238,238,238,${st.a * tw})`;
      ctx!.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx!.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
}
