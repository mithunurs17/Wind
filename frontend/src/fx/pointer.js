// Shared pointer state. One window listener feeds the cursor, the wind field,
// the 3D turbine and the tilt cards, so the whole UI reacts to the same input.
export const pointer = {
    x: 0, y: 0,          // viewport position (px)
    nx: 0, ny: 0,        // normalised -1..1
    vx: 0, vy: 0,        // velocity (px / frame), decays when idle
    speed: 0,
    wind: 0,             // smoothed, signed horizontal "wind" derived from mouse movement
    active: false,
  };
  
  let started = false;
  
  export function startPointer() {
    if (started || typeof window === 'undefined') return;
    started = true;
    pointer.x = window.innerWidth / 2;
    pointer.y = window.innerHeight / 2;
    let lx = pointer.x, ly = pointer.y, lt = performance.now();
  
    const onMove = e => {
      const now = performance.now();
      const dt = Math.max(6, now - lt);
      const ivx = ((e.clientX - lx) / dt) * 16;
      const ivy = ((e.clientY - ly) / dt) * 16;
      pointer.vx += (ivx - pointer.vx) * 0.5;
      pointer.vy += (ivy - pointer.vy) * 0.5;
      lx = e.clientX; ly = e.clientY; lt = now;
      pointer.x = lx; pointer.y = ly;
      pointer.nx = (lx / window.innerWidth) * 2 - 1;
      pointer.ny = (ly / window.innerHeight) * 2 - 1;
      pointer.active = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', () => { pointer.active = false; });
  
    const tick = () => {
      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
      pointer.speed = Math.hypot(pointer.vx, pointer.vy);
      const target = Math.max(-18, Math.min(18, pointer.vx * 0.5));
      pointer.wind += (target - pointer.wind) * 0.06;
      requestAnimationFrame(tick);
    };
    tick();
  }
  
  export const canHover = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  export const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;