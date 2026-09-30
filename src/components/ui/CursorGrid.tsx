// An interactive background grid that glows near the cursor — a plain
// Canvas2D draw loop (no library), listening for mouse movement on its
// parent element (the canvas itself stays pointer-events: none so it never
// intercepts clicks meant for real UI sitting on top of it). Cells within
// `radius` of the cursor light up with a distance-based falloff; moving the
// mouse away holds the glow for `holdTime` before fading it out over
// `fadeDuration`, and an optional `clickPulse` sends an expanding ring out
// from each click.
import { useEffect, useRef } from 'react';

interface CursorGridProps {
  cellSize?: number;
  color?: string;
  radius?: number;
  falloff?: 'smooth' | 'linear';
  holdTime?: number;
  fadeDuration?: number;
  lineWidth?: number;
  maxOpacity?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  cellRadius?: number;
  clickPulse?: boolean;
  pulseSpeed?: number;
  className?: string;
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function CursorGrid({
  cellSize = 60,
  color = '#ffffff',
  radius = 140,
  falloff = 'smooth',
  holdTime = 400,
  fadeDuration = 800,
  lineWidth = 1,
  maxOpacity = 1,
  fillOpacity = 0,
  gridOpacity = 0,
  cellRadius = 0,
  clickPulse = false,
  pulseSpeed = 600,
  className,
}: CursorGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false, lastMove: 0 });
  const pulsesRef = useRef<{ x: number; y: number; start: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return;

    let raf = 0;
    // offsetWidth/offsetHeight (the parent's own layout box), not
    // getBoundingClientRect() (its rendered, post-transform box) — a
    // caller whose parent is still mid `transform: scale(...)` (this
    // component's one caller, ChatAssistant's panel, animates in via a
    // genie scale) would otherwise have its very first measurement read a
    // transiently shrunk size. Since a CSS transform never changes the
    // parent's actual layout box, ResizeObserver — which watches box size,
    // not visual/transformed size — never fires again to correct it, so
    // that wrong first read stuck the canvas at a tiny size in the
    // top-left corner for good.
    const resize = () => {
      const width = parent.offsetWidth;
      const height = parent.offsetHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true, lastMove: performance.now() };
    };
    const handleLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.lastMove = performance.now();
    };
    const handleClick = (e: MouseEvent) => {
      if (!clickPulse) return;
      const rect = canvas.getBoundingClientRect();
      pulsesRef.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, start: performance.now() });
    };
    parent.addEventListener('mousemove', handleMove);
    parent.addEventListener('mouseleave', handleLeave);
    if (clickPulse) parent.addEventListener('click', handleClick);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cols = Math.ceil(w / cellSize) + 1;
      const rows = Math.ceil(h / cellSize) + 1;

      if (gridOpacity > 0) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = gridOpacity;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        for (let c = 0; c <= cols; c++) { ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, h); }
        for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * cellSize); ctx.lineTo(w, r * cellSize); }
        ctx.stroke();
      }

      const now = performance.now();
      const m = mouseRef.current;
      const elapsed = now - m.lastMove;
      let holdFactor = 1;
      if (!m.active) {
        if (elapsed > holdTime + fadeDuration) holdFactor = 0;
        else if (elapsed > holdTime) holdFactor = 1 - (elapsed - holdTime) / fadeDuration;
      }

      if (holdFactor > 0) {
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const cx = c * cellSize + cellSize / 2;
            const cy = r * cellSize + cellSize / 2;
            const dist = Math.hypot(cx - m.x, cy - m.y);
            if (dist > radius) continue;
            const t = 1 - dist / radius;
            const eased = falloff === 'smooth' ? t * t * (3 - 2 * t) : t;
            const opacity = eased * maxOpacity * holdFactor;
            if (opacity <= 0.01) continue;
            const x = c * cellSize;
            const y = r * cellSize;
            if (fillOpacity > 0) {
              ctx.globalAlpha = opacity * fillOpacity;
              ctx.fillStyle = color;
              if (cellRadius > 0) { roundedRectPath(ctx, x, y, cellSize, cellSize, cellRadius); ctx.fill(); }
              else ctx.fillRect(x, y, cellSize, cellSize);
            }
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            if (cellRadius > 0) { roundedRectPath(ctx, x, y, cellSize, cellSize, cellRadius); ctx.stroke(); }
            else ctx.strokeRect(x, y, cellSize, cellSize);
          }
        }
      }

      if (clickPulse && pulsesRef.current.length) {
        pulsesRef.current = pulsesRef.current.filter((p) => now - p.start < pulseSpeed);
        for (const p of pulsesRef.current) {
          const t = (now - p.start) / pulseSpeed;
          const r = t * radius * 1.6;
          ctx.globalAlpha = (1 - t) * maxOpacity;
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth * 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      parent.removeEventListener('mousemove', handleMove);
      parent.removeEventListener('mouseleave', handleLeave);
      parent.removeEventListener('click', handleClick);
    };
  }, [cellSize, color, radius, falloff, holdTime, fadeDuration, lineWidth, maxOpacity, fillOpacity, gridOpacity, cellRadius, clickPulse, pulseSpeed]);

  return <canvas ref={canvasRef} className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
