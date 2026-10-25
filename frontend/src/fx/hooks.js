import { useEffect, useState } from 'react';
import { canHover, reducedMotion } from './pointer';

/** 3D tilt on a card. Sets --rx/--ry CSS variables. */
export function useTilt(ref, max) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !max || !canHover() || reducedMotion()) return undefined;
    let raf = 0;
    const move = e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref, max]);
}

/** Magnetic pull: element drifts toward the cursor when it gets close. Uses the CSS `translate` property. */
export function useMagnetic(ref, strength = 0.28, radius = 90) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !canHover() || reducedMotion()) return undefined;
    const move = e => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      const reach = radius + Math.max(r.width, r.height) / 2;
      el.style.translate = d < reach ? `${(dx * strength).toFixed(1)}px ${(dy * strength).toFixed(1)}px` : '0px 0px';
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [ref, strength, radius]);
}

/** Looping typewriter: types a phrase, holds, deletes, moves to the next. */
export function useTypewriter(phrases, { speed = 38, hold = 1800, startDelay = 700 } = {}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (reducedMotion()) { setText(phrases[0]); return undefined; }
    let i = 0, n = 0, dir = 1, timer;
    const step = () => {
      const phrase = phrases[i];
      n += dir;
      setText(phrase.slice(0, n));
      if (dir === 1 && n === phrase.length) { dir = -1; timer = setTimeout(step, hold); return; }
      if (dir === -1 && n === 0) { dir = 1; i = (i + 1) % phrases.length; timer = setTimeout(step, 350); return; }
      timer = setTimeout(step, dir === 1 ? speed : speed / 2);
    };
    timer = setTimeout(step, startDelay);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return text;
}