import React, { useEffect, useRef } from 'react';

/**
 * 追随指针的一捧烛光:缓动跟随,掠过可交互物时微微胀大。
 * 仅指针精确设备启用,尊重 prefers-reduced-motion。
 */
export const CursorGlow: React.FC = () => {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = glowRef.current;
    if (!el) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let scale = 1;
    let targetScale = 1;

    const onMove = (event: MouseEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      if (el.style.opacity !== '1') el.style.opacity = '1';
      const target = event.target as HTMLElement | null;
      targetScale = target && target.closest('button, a, input, textarea, select, [role="button"], .lore-term, .branch-row')
        ? 1.65
        : 1;
    };
    const onLeave = () => { el.style.opacity = '0'; };

    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      scale += (targetScale - scale) * 0.1;
      el.style.transform = `translate3d(${x - 160}px, ${y - 160}px, 0) scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <div ref={glowRef} className="cursor-glow" aria-hidden="true" />;
};

export default CursorGlow;
