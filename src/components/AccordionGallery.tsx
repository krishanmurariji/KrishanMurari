// A horizontal hover-accordion gallery: segments sit narrow side by side,
// and the one under the pointer expands to reveal its preview + label,
// GSAP-driven (flex-grow tween, not a CSS transition) so the easing matches
// the rest of this project's GSAP-based motion (RubiksCube, the glass
// reveals). Built from scratch for this site rather than pulled from a
// library — there's no publicly fetchable source for the exact component
// referenced, just a prop shape to build against.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';

export interface AccordionGalleryItem {
  id: string;
  preview: ReactNode;
  label: string;
  selected?: boolean;
}

export default function AccordionGallery({
  items,
  onToggle,
  defaultIndex = 0,
  expandRatio = 0.42,
  height = 200,
  gap = 8,
  radius = 16,
  duration = 0.5,
  ease = 'power3.out',
  accentColor = '#ffffff',
  grayscale = true,
  showLabels = true,
  tilt = 6,
  parallax = 10,
  stagger = 0.06,
}: {
  items: AccordionGalleryItem[];
  onToggle: (id: string) => void;
  defaultIndex?: number;
  expandRatio?: number;
  height?: number;
  gap?: number;
  radius?: number;
  duration?: number;
  ease?: string;
  accentColor?: string;
  grayscale?: boolean;
  showLabels?: boolean;
  tilt?: number;
  parallax?: number;
  stagger?: number;
}) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previewRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  // Staggered entrance, once, on mount.
  useEffect(() => {
    gsap.fromTo(
      segmentRefs.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.4, stagger, ease: 'power2.out' }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-tween every segment's share of the row whenever the active one
  // changes — flex-grow (not width) so the row always fills its container
  // regardless of item count.
  useEffect(() => {
    const restShare = (1 - expandRatio) / Math.max(items.length - 1, 1);
    segmentRefs.current.forEach((el, i) => {
      if (!el) return;
      gsap.to(el, { flexGrow: (i === activeIndex ? expandRatio : restShare) * 100, duration, ease });
    });
  }, [activeIndex, expandRatio, duration, ease, items.length]);

  const handleMove = (i: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (i !== activeIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(segmentRefs.current[i], {
      rotateY: px * tilt,
      rotateX: -py * tilt,
      transformPerspective: 700,
      duration: 0.3,
      ease: 'power2.out',
    });
    const preview = previewRefs.current[i];
    if (preview) gsap.to(preview, { x: -px * parallax, y: -py * parallax, duration: 0.4, ease: 'power2.out' });
  };

  const resetTilt = (i: number) => () => {
    gsap.to(segmentRefs.current[i], { rotateY: 0, rotateX: 0, duration: 0.4, ease: 'power2.out' });
    const preview = previewRefs.current[i];
    if (preview) gsap.to(preview, { x: 0, y: 0, duration: 0.4, ease: 'power2.out' });
  };

  return (
    <div
      className="flex w-full"
      style={{ height, gap }}
      onMouseLeave={() => setActiveIndex(defaultIndex)}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          ref={(el) => { segmentRefs.current[i] = el; }}
          role="button"
          tabIndex={0}
          aria-pressed={item.selected}
          aria-label={item.label}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseMove={handleMove(i)}
          onMouseLeave={resetTilt(i)}
          onClick={() => onToggle(item.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(item.id); } }}
          className="relative overflow-hidden cursor-pointer shrink-0 outline-none"
          style={{ borderRadius: radius, flexBasis: 0, flexGrow: 1, minWidth: 0, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}
        >
          <div
            ref={(el) => { previewRefs.current[i] = el; }}
            className="absolute inset-0 flex items-center justify-center bg-white"
            style={{
              filter: grayscale && i !== activeIndex ? 'grayscale(1) brightness(0.75)' : 'none',
              transition: 'filter 0.3s ease',
            }}
          >
            {item.preview}
          </div>

          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

          {showLabels && (
            <div className="absolute bottom-2 left-0 right-0 text-center text-white text-[11px] font-semibold truncate px-1 pointer-events-none">
              {item.label}
            </div>
          )}

          {item.selected && (
            <div
              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center pointer-events-none"
              style={{ background: accentColor }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
