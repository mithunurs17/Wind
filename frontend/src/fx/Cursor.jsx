import React, { useEffect, useRef, useState } from 'react';
import { pointer, startPointer, canHover } from './pointer';

/**
 * Light emission that follows the normal system cursor: a soft glow that trails slightly,
 * brightens with speed, swells over links/buttons and sends a ripple on click.
 */
export default function Cursor() {
  const [enabled] = useState(() => canHover());
  const glow = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    startPointer();
    let gx = pointer.x, gy = pointer.y, raf;

    const loop = () => {
      gx += (pointer.x - gx) * 0.2;
      gy += (pointer.y - gy) * 0.2;
      const el = glow.current;
      if (el) {
        el.style.transform = `translate3d(${gx}px,${gy}px,0)`;
        el.style.setProperty('--boost', Math.min(1, pointer.speed / 25).toFixed(3));
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const over = e => {
      const t = e.target;
      const link = t.closest?.('a,button,[role="switch"],label');
      glow.current?.classList.toggle('is-link', !!link);
    };
    const down = e => {
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      r.addEventListener('animationend', () => r.remove());
      document.body.appendChild(r);
    };
    const leave = () => glow.current?.classList.add('is-hidden');
    const enter = () => glow.current?.classList.remove('is-hidden');

    document.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', down);
    document.addEventListener('mouseleave', leave);
    document.addEventListener('mouseenter', enter);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', down);
      document.removeEventListener('mouseleave', leave);
      document.removeEventListener('mouseenter', enter);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div className="cursor-glow" ref={glow} aria-hidden="true"><i /></div>;
}