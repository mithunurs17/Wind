import React, { useEffect, useRef } from 'react';
import { pointer, startPointer, reducedMotion } from './pointer';

const COLORS = ['190,215,255', '127,240,204', '255,255,255'];

/**
 * Full-bleed canvas of 3D wind streaks (perspective projected).
 * - Horizontal mouse movement "scrubs" the wind: faster, or even reversing it.
 * - The cursor pushes streaks aside; the camera parallaxes with the pointer.
 */
export default function WindField() {
  const ref = useRef(null);

  useEffect(() => {
    startPointer();
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const F = 420, DEPTH = 900;
    let w = 0, h = 0, dpr = 1, parts = [], raf = 0, visible = true, last = performance.now(), t = 0;
    let camx = 0, camy = 0;

    const rand = (a, b) => a + Math.random() * (b - a);
    const spawn = p => {
      p.x = rand(-1, 1) * w * 1.7;
      p.y = rand(-1, 1) * h * 1.4;
      p.z = rand(0, DEPTH);
      p.ox = 0; p.oy = 0; p.ph = rand(0, 6.28); p.c = (Math.random() * 3) | 0; p.sp = rand(0.7, 1.4);
      return p;
    };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(90, Math.min(320, Math.floor((w * h) / 5200)));
      parts = Array.from({ length: count }, () => spawn({}));
    };

    const frame = now => {
      const dt = Math.min(3, (now - last) / 16.67); last = now; t += dt / 60;
      const rect = cv.getBoundingClientRect();
      const mx = pointer.x - rect.left, my = pointer.y - rect.top;
      const inside = pointer.active && mx > -80 && mx < w + 80 && my > -80 && my < h + 80;

      camx += ((-pointer.nx * 90) - camx) * 0.05;
      camy += ((-pointer.ny * 55) - camy) * 0.05;

      ctx.clearRect(0, 0, w, h);

      const flow = 2.2 + pointer.wind * 1.1;  // signed: mouse movement can reverse the wind
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      const alphas = [0, 0, 0];

      for (const p of parts) {
        p.x += flow * p.sp * dt;
        p.y += Math.sin(p.x * 0.004 + t * 0.7 + p.ph) * 0.4 * dt;
        p.x += p.ox * dt; p.y += p.oy * dt;
        p.ox *= 0.93; p.oy *= 0.93;

        const lim = w * 1.7;
        if (p.x > lim) p.x = -lim; else if (p.x < -lim) p.x = lim;
        if (p.y > h * 1.4) p.y = -h * 1.4; else if (p.y < -h * 1.4) p.y = h * 1.4;

        const s = F / (F + p.z);
        const sx = w / 2 + (p.x + camx / s * 0.6) * s;
        const sy = h / 2 + (p.y + camy / s * 0.6) * s;
        if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;

        if (inside) {                      // cursor pushes streaks away
          const dx = sx - mx, dy = sy - my, d = Math.hypot(dx, dy);
          if (d < 150 && d > 0.1) {
            const f = (1 - d / 150) * 1.6;
            p.ox += (dx / d) * f / s * 0.35;
            p.oy += (dy / d) * f / s * 0.35;
          }
        }

        const len = Math.max(6, Math.abs(flow) * 7 + 10) * s;
        const dir = flow >= 0 ? -1 : 1;
        paths[p.c].moveTo(sx + dir * len, sy - Math.sin(p.x * 0.004 + t * 0.7 + p.ph) * 0.4 * len * 0.2);
        paths[p.c].lineTo(sx, sy);
        alphas[p.c] += 0.15 + s * 0.6;
      }

      ctx.lineCap = 'round';
      for (let c = 0; c < 3; c++) {
        ctx.strokeStyle = `rgba(${COLORS[c]},${Math.min(0.75, 0.22 + (alphas[c] / Math.max(1, parts.length / 3)) * 0.5)})`;
        ctx.lineWidth = 1.3;
        ctx.stroke(paths[c]);
      }
      if (visible && !document.hidden && !reducedMotion()) raf = requestAnimationFrame(frame);
    };

    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0 });
    io.observe(cv);
    const vis = () => { if (!document.hidden && visible) start(); };
    document.addEventListener('visibilitychange', vis);
    start();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  return <canvas ref={ref} className="wind-canvas" aria-hidden="true" />;
}