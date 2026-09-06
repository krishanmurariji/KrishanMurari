import { useEffect, useRef } from 'react';

// Fakes the "glass over the 3D scene" look without relying on CSS
// backdrop-filter, because backdrop-filter reliably blurring WebGL <canvas>
// content is a known, flaky, browser/GPU-dependent limitation (it works fine
// over ordinary DOM content, but a WebGL canvas is frequently promoted to its
// own compositor layer that the backdrop-sampling pass doesn't see — this is
// widely reported, not specific to this setup). Instead: continuously copy
// the screen region behind the panel from the real scene canvas onto a small
// 2D canvas, then apply a normal (non-backdrop) CSS `filter: blur()` to that
// canvas's own pixels — which works everywhere, since it's blurring content
// the canvas actually drew, not sampling through to something behind it.
//
// Shared by MacDock (the bottom dock) and MenuBar (the top strip) — both
// glass panels need the identical blur-through trick, just over a
// differently-shaped container.
export function GlassBackdrop({
  sceneCanvasRef,
  containerRef,
  pad = 28,
}: {
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  pad?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    const draw = () => {
      const src = sceneCanvasRef?.current;
      const dst = canvasRef.current;
      const container = containerRef.current;
      if (!src || !dst || !container || src.width === 0 || src.height === 0) return;

      const rect = container.getBoundingClientRect();
      const scaleX = src.width / window.innerWidth;
      const scaleY = src.height / window.innerHeight;
      const w = rect.width + pad * 2;
      const h = rect.height + pad * 2;

      // Capped lower than the main scene's own DPR — this only needs to look
      // good once blurred, so there's no reason to pay for a full-resolution
      // copy on every tick.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const targetW = Math.max(1, Math.round(w * dpr));
      const targetH = Math.max(1, Math.round(h * dpr));
      if (dst.width !== targetW) dst.width = targetW;
      if (dst.height !== targetH) dst.height = targetH;

      const ctx = dst.getContext('2d');
      if (!ctx) return;
      const sx = Math.max(0, (rect.left - pad) * scaleX);
      const sy = Math.max(0, (rect.top - pad) * scaleY);
      const sw = Math.min(src.width - sx, w * scaleX);
      const sh = Math.min(src.height - sy, h * scaleY);
      ctx.clearRect(0, 0, dst.width, dst.height);
      if (sw > 0 && sh > 0) {
        ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dst.width, dst.height);
      }
    };

    // A timer, not requestAnimationFrame — this is a background ambience
    // effect, not something that needs to track every render frame, and a
    // fixed interval keeps CPU/GPU cost bounded and predictable regardless of
    // the scene's own frame rate.
    const tick = () => {
      if (cancelled) return;
      draw();
      timer = window.setTimeout(tick, 90);
    };
    const handleVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sceneCanvasRef, containerRef, pad]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute pointer-events-none"
      style={{
        left: -pad,
        top: -pad,
        width: `calc(100% + ${pad * 2}px)`,
        height: `calc(100% + ${pad * 2}px)`,
        filter: 'blur(14px)',
      }}
    />
  );
}
