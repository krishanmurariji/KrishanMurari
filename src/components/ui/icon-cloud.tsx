// Adapted from MagicUI's Icon Cloud (magicui.design/r/icon-cloud.json): a
// canvas-rendered sphere of icons that rotates on its own, drags with the
// mouse, and eases any clicked icon to face-front — all hand-rolled 3D
// projection math (Fibonacci sphere distribution, perspective scale/opacity
// per depth), not a WebGL/three.js library. Two deltas from the registry
// version, both dropping unused surface area rather than adding it: only the
// `images: string[]` mode is kept (the sibling `icons: ReactNode[]` mode
// pulled in `react-dom/server`'s `renderToString` purely to rasterize SVG
// elements to an offscreen canvas — dead weight here since every caller in
// this project passes image URLs), and the pause/play control button is a
// plain inline SVG instead of `lucide-react` + the shadcn `Button` primitive,
// neither of which otherwise exists in this codebase. The canvas itself is
// now resized (via ResizeObserver) to match its own rendered box exactly,
// rather than the registry's fixed 400x400 — needed so this fits a small
// window on a phone screen without the backing resolution and the
// mouse-hit-test coordinates (which read raw `canvas.width`/`height`)
// silently falling out of sync with each other.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface Icon {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  id: number;
}

interface IconCloudProps {
  images: string[];
  showControl?: boolean;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const PlayGlyph = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7 5.5V18.5L19 12L7 5.5Z" fill="currentColor" />
  </svg>
);

const PauseGlyph = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);

export default function IconCloud({ images, showControl = true, className }: IconCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState(320);
  const [iconPositions, setIconPositions] = useState<Icon[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [targetRotation, setTargetRotation] = useState<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    distance: number;
    startTime: number;
    duration: number;
  } | null>(null);
  const animationFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0 });
  const iconCanvasesRef = useRef<HTMLCanvasElement[]>([]);
  const imagesLoadedRef = useRef<boolean[]>([]);

  // The canvas's backing resolution must always equal its own rendered CSS
  // size, or the mouse math below (which reads `canvas.width`/`height`
  // directly) drifts out of sync with `getBoundingClientRect()` — sizing via
  // a ResizeObserver on the wrapper (rather than a fixed constant) is what
  // lets this shrink to fit a phone-width window without that happening.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCanvasSize(Math.max(1, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) setIsPaused(true);
    const handleChange = (e: MediaQueryListEvent) => setIsPaused(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    imagesLoadedRef.current = new Array(images.length).fill(false);

    const newIconCanvases = images.map((src, index) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = 40;
      offscreen.height = 40;
      const offCtx = offscreen.getContext('2d');

      if (offCtx) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        img.onload = () => {
          offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
          offCtx.beginPath();
          offCtx.arc(20, 20, 20, 0, Math.PI * 2);
          offCtx.closePath();
          offCtx.clip();
          offCtx.drawImage(img, 0, 0, 40, 40);
          imagesLoadedRef.current[index] = true;
        };
      }
      return offscreen;
    });

    iconCanvasesRef.current = newIconCanvases;
  }, [images]);

  useEffect(() => {
    const newIcons: Icon[] = [];
    const numIcons = images.length || 20;

    const offset = 2 / numIcons;
    const increment = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < numIcons; i++) {
      const y = i * offset - 1 + offset / 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * increment;

      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;

      newIcons.push({ x: x * 100, y: y * 100, z: z * 100, scale: 1, opacity: 1, id: i });
    }
    setIconPositions(newIcons);
  }, [images]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    iconPositions.forEach((icon) => {
      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);
      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);

      const rotatedX = icon.x * cosY - icon.z * sinY;
      const rotatedZ = icon.x * sinY + icon.z * cosY;
      const rotatedY = icon.y * cosX + rotatedZ * sinX;

      const screenX = canvasRef.current!.width / 2 + rotatedX;
      const screenY = canvasRef.current!.height / 2 + rotatedY;

      const scale = (rotatedZ + 200) / 300;
      const radius = 20 * scale;
      const dx = x - screenX;
      const dy = y - screenY;

      if (dx * dx + dy * dy < radius * radius) {
        const targetX = -Math.atan2(icon.y, Math.sqrt(icon.x * icon.x + icon.z * icon.z));
        const targetY = Math.atan2(icon.x, icon.z);

        const currentX = rotationRef.current.x;
        const currentY = rotationRef.current.y;
        const distance = Math.sqrt(Math.pow(targetX - currentX, 2) + Math.pow(targetY - currentY, 2));

        const duration = Math.min(2000, Math.max(800, distance * 1000));

        setTargetRotation({
          x: targetX,
          y: targetY,
          startX: currentX,
          startY: currentY,
          distance,
          startTime: performance.now(),
          duration,
        });
        return;
      }
    });

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      rotationRef.current = {
        x: rotationRef.current.x + deltaY * 0.002,
        y: rotationRef.current.y + deltaX * 0.002,
      };

      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
      const dx = mousePos.x - centerX;
      const dy = mousePos.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = 0.003 + (distance / maxDistance) * 0.01;

      if (targetRotation) {
        const elapsed = performance.now() - targetRotation.startTime;
        const progress = Math.min(1, elapsed / targetRotation.duration);
        const easedProgress = easeOutCubic(progress);

        rotationRef.current = {
          x: targetRotation.startX + (targetRotation.x - targetRotation.startX) * easedProgress,
          y: targetRotation.startY + (targetRotation.y - targetRotation.startY) * easedProgress,
        };

        if (progress >= 1) setTargetRotation(null);
      } else if (!isDragging && !isPaused) {
        rotationRef.current = {
          x: rotationRef.current.x + (dy / canvas.height) * speed,
          y: rotationRef.current.y + (dx / canvas.width) * speed,
        };
      }

      iconPositions.forEach((icon, index) => {
        const cosX = Math.cos(rotationRef.current.x);
        const sinX = Math.sin(rotationRef.current.x);
        const cosY = Math.cos(rotationRef.current.y);
        const sinY = Math.sin(rotationRef.current.y);

        const rotatedX = icon.x * cosY - icon.z * sinY;
        const rotatedZ = icon.x * sinY + icon.z * cosY;
        const rotatedY = icon.y * cosX + rotatedZ * sinX;

        const scale = (rotatedZ + 200) / 300;
        const opacity = Math.max(0.2, Math.min(1, (rotatedZ + 150) / 200));

        ctx.save();
        ctx.translate(canvas.width / 2 + rotatedX, canvas.height / 2 + rotatedY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;

        if (iconCanvasesRef.current[index] && imagesLoadedRef.current[index]) {
          ctx.drawImage(iconCanvasesRef.current[index], -20, -20, 40, 40);
        }

        ctx.restore();
      });

      const hasPendingAssets = !imagesLoadedRef.current.every((loaded) => loaded);
      const shouldContinue = !isPaused || isDragging || targetRotation !== null || hasPendingAssets;
      if (shouldContinue) animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [images, iconPositions, isDragging, isPaused, mousePos, targetRotation, canvasSize]);

  return (
    <div ref={containerRef} className={cn('relative mx-auto aspect-square w-full max-w-[320px]', className)}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="block h-full w-full cursor-grab rounded-lg active:cursor-grabbing"
        aria-label="Interactive 3D icon cloud of skills and tools"
        role="img"
      />
      {showControl && (
        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          aria-label={isPaused ? 'Play animation' : 'Pause animation'}
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/90 text-black/70 shadow-sm transition hover:bg-white"
        >
          {isPaused ? <PlayGlyph className="h-4 w-4" /> : <PauseGlyph className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
