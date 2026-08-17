import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  swaySpeed: number;
  swayAmp: number;
  alpha: number;
  depth: number;
  spark: boolean;
}

/** 预渲染的径向光点贴图,避免逐帧 shadowBlur 的开销 */
function makeSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.32, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/**
 * 氛围画布:夜间余烬上浮,日间尘埃浮动;指针带动轻微视差。
 * 尊重 prefers-reduced-motion 与标签页可见性;跟随明暗主题切换。
 */
export const AmbientCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const emberSprite = makeSprite(255, 176, 84);
    const sparkSprite = makeSprite(255, 222, 150);
    const moteSprite = makeSprite(146, 118, 74);

    let theme: 'day' | 'night' = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    const particles: Particle[] = [];

    const spawn = (initial = false): Particle => ({
      x: Math.random() * width,
      y: initial ? Math.random() * height : height + 12,
      r: 0.6 + Math.random() * 1.9,
      vy: 0.1 + Math.random() * 0.32,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.004 + Math.random() * 0.01,
      swayAmp: 8 + Math.random() * 26,
      alpha: theme === 'night' ? 0.13 + Math.random() * 0.3 : 0.07 + Math.random() * 0.17,
      depth: 0.3 + Math.random() * 0.7,
      spark: Math.random() < 0.16,
    });

    const build = () => {
      particles.length = 0;
      const count = theme === 'night' ? 58 : 34;
      for (let i = 0; i < count; i += 1) particles.push(spawn(true));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const step = () => {
      if (!running) return;
      mx += (tmx - mx) * 0.03;
      my += (tmy - my) * 0.03;
      ctx.clearRect(0, 0, width, height);
      const drift = theme === 'night' ? 1 : 0.42;
      for (const p of particles) {
        p.y -= p.vy * drift;
        p.sway += p.swaySpeed;
        if (p.y < -14) Object.assign(p, spawn());
        const x = p.x + Math.sin(p.sway) * p.swayAmp * 0.22 + mx * 34 * p.depth;
        const y = p.y + my * 22 * p.depth;
        const flicker = 0.72 + 0.28 * Math.sin(p.sway * 3.1);
        ctx.globalAlpha = p.alpha * flicker;
        const sprite = theme === 'night' ? (p.spark ? sparkSprite : emberSprite) : moteSprite;
        const size = p.r * 8 * (p.spark ? 1.5 : 1);
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    };

    const onMouse = (event: MouseEvent) => {
      tmx = event.clientX / window.innerWidth - 0.5;
      tmy = event.clientY / window.innerHeight - 0.5;
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };
    const themeObserver = new MutationObserver(() => {
      const next = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
      if (next !== theme) {
        theme = next;
        build();
      }
    });

    resize();
    build();
    raf = requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('visibilitychange', onVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="ambient-canvas" aria-hidden="true" />
      <div className="candle-veil" aria-hidden="true" />
      <div className="stage-vignette" aria-hidden="true" />
    </>
  );
};

export default AmbientCanvas;
