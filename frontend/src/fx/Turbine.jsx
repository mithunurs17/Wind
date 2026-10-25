import React, { useEffect, useRef } from 'react';
import { pointer, startPointer, reducedMotion } from './pointer';

/**
 * A layered CSS-3D wind turbine. The whole stage tilts toward the cursor (real perspective
 * depth between tower, nacelle and rotor) and the rotor speed follows mouse "wind".
 */
export default function Turbine() {
  const stage = useRef(null);
  const rotor = useRef(null);
  const hud = useRef(null);

  useEffect(() => {
    startPointer();
    let raf, angle = 0, omega = 0.9, ry = 0, rx = 0, last = performance.now(), hudT = 0;
    const reduce = reducedMotion();

    const loop = now => {
      const dt = Math.min(3, (now - last) / 16.67); last = now;
      const target = reduce ? 0.2 : 0.9 + pointer.wind * 0.6;           // deg / frame, signed
      omega += (target - omega) * 0.04 * dt;
      angle = (angle + omega * dt) % 360;

      const idle = Math.sin(now / 2600);
      const tRy = pointer.nx * 26 + idle * 4;
      const tRx = -pointer.ny * 14 + 5;
      ry += (tRy - ry) * 0.07; rx += (tRx - rx) * 0.07;

      if (stage.current) stage.current.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      if (rotor.current) {
        rotor.current.style.transform = `translateZ(52px) rotate(${angle.toFixed(2)}deg)`;
        rotor.current.style.setProperty('--disc', Math.min(0.5, Math.abs(omega) / 22).toFixed(3));
      }
      hudT += dt;
      if (hudT > 8 && hud.current) {
        hudT = 0;
        const rpm = Math.abs(omega) * 10;           // deg/frame * 60 fps / 6 = rpm
        hud.current.textContent = `ROTOR ${rpm.toFixed(1).padStart(4, '0')} RPM  ·  WIND ${pointer.wind >= 0 ? '+' : '−'}${Math.abs(pointer.wind * 0.8).toFixed(1)} M/S`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const blade = 'M -5 -9 C -10 -42 -6 -82 0 -97 C 6 -82 9 -42 5 -9 Z';
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="stage3d" ref={stage}>
        <div className="ring r1"><i /></div>
        <div className="ring r2"><i /></div>
        <div className="t-glow" />
        <div className="t-ground" />
        <svg className="t-tower" viewBox="0 0 60 212">
          <defs>
            <linearGradient id="tw" x1="0" x2="1">
              <stop offset="0" stopColor="#6f89bd" /><stop offset=".45" stopColor="#e6efff" /><stop offset="1" stopColor="#5a73a6" />
            </linearGradient>
          </defs>
          <path d="M26 0 h8 l10 212 H16 Z" fill="url(#tw)" />
        </svg>
        <div className="t-nacelle" />
        <svg className="t-rotor" ref={rotor} viewBox="-100 -100 200 200">
          <defs>
            <linearGradient id="bl" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#f2f7ff" /><stop offset="1" stopColor="#9fc0ff" />
            </linearGradient>
            <radialGradient id="hubg"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#8fb2f5" /></radialGradient>
          </defs>
          <circle r="98" fill="rgba(160,200,255,1)" style={{ opacity: 'var(--disc,0)' }} />
          {[0, 120, 240].map(a => <path key={a} d={blade} fill="url(#bl)" transform={`rotate(${a})`} />)}
          <circle r="9" fill="url(#hubg)" />
          <circle r="3.5" fill="#1d3a78" />
        </svg>
      </div>
      <div className="hud" ref={hud}>ROTOR 00.9 RPM  ·  WIND +0.0 M/S</div>
    </div>
  );
}