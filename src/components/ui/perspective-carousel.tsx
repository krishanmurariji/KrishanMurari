// Ported from VengeanceUI's Perspective Carousel
// (github.com/Ashutoshx7/VengeanceUI, r/perspective-carousel.json) — same
// 3D cover-flow anatomy (a row of images in perspective, the active one
// scaled up and facing forward, neighbors rotated away on rotateY), minus
// the Next.js "use client" pragma (meaningless outside Next) and with the
// controls bar's shadcn `dark:` variants dropped — this project doesn't
// toggle a dark-mode class the way those assumed; every consumer here
// drives light/dark through its own explicit prop instead (see every other
// ported ui/ component). `cn` now comes from this project's own
// src/lib/utils.ts via a relative import, not the "@/" alias (unused
// anywhere else in this codebase).
//
// One real addition beyond the port: `onSlideActivate`. The original only
// exposes `onActiveIndexChange`, fired identically whether a visitor clicked
// a slide's own image, an arrow, or a dot — SpotifyApp (the first consumer)
// needs to tell "bring this into focus" apart from "play this", and the
// natural reading of tapping an actual track's artwork is "play it", not
// just "center it". Clicking the image now reports both; the arrows/dots
// still only reposition.
import * as React from 'react';
import { motion, type Transition } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PerspectiveCarouselItem {
  src: string;
  title: string;
  alt?: string;
}

export interface PerspectiveCarouselProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: PerspectiveCarouselItem[];
  activeIndex?: number;
  defaultActiveIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  /** Fired only when a slide's own artwork is clicked (not arrows/dots) —
   * see this file's own header comment. */
  onSlideActivate?: (index: number) => void;
  loop?: boolean;
  slideWidth?: number;
  rotationStep?: number;
  inactiveScale?: number;
  transition?: Transition;
  showControls?: boolean;
  showDots?: boolean;
  viewportClassName?: string;
  slideClassName?: string;
  imageClassName?: string;
  labelClassName?: string;
  controlsClassName?: string;
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  bounce: 0.14,
  duration: 0.9,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function PerspectiveCarousel({
  items,
  activeIndex,
  defaultActiveIndex = 0,
  onActiveIndexChange,
  onSlideActivate,
  loop = false,
  slideWidth = 200,
  rotationStep = 60,
  inactiveScale = 0.85,
  transition = DEFAULT_TRANSITION,
  showControls = true,
  showDots = true,
  viewportClassName,
  slideClassName,
  imageClassName,
  labelClassName,
  controlsClassName,
  className,
  onKeyDown,
  tabIndex,
  ...props
}: PerspectiveCarouselProps) {
  const maxIndex = Math.max(0, items.length - 1);
  const [uncontrolledIndex, setUncontrolledIndex] = React.useState(() =>
    clamp(defaultActiveIndex, 0, maxIndex)
  );
  const currentIndex = clamp(activeIndex ?? uncontrolledIndex, 0, maxIndex);
  const safeSlideWidth = Math.max(96, slideWidth);
  const safeInactiveScale = clamp(inactiveScale, 0.5, 1);

  const selectSlide = React.useCallback(
    (nextIndex: number) => {
      if (!items.length) {
        return;
      }

      const resolvedIndex = loop
        ? (nextIndex + items.length) % items.length
        : clamp(nextIndex, 0, maxIndex);

      if (activeIndex === undefined) {
        setUncontrolledIndex(resolvedIndex);
      }

      onActiveIndexChange?.(resolvedIndex);
    },
    [activeIndex, items.length, loop, maxIndex, onActiveIndexChange]
  );

  if (!items.length) {
    return null;
  }

  const isPreviousDisabled = !loop && currentIndex === 0;
  const isNextDisabled = !loop && currentIndex === maxIndex;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectSlide(currentIndex - 1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectSlide(currentIndex + 1);
    }
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Perspective image carousel"
      tabIndex={tabIndex ?? 0}
      onKeyDown={handleKeyDown}
      className={cn('relative isolate h-full w-full overflow-hidden', className)}
      {...props}
    >
      <div
        className={cn('absolute inset-0 overflow-hidden', viewportClassName)}
        style={{ perspective: '1200px' }}
      >
        <motion.div
          className="absolute left-1/2 top-1/2 flex w-fit -translate-y-1/2 items-center"
          animate={{ x: -(currentIndex * safeSlideWidth + safeSlideWidth / 2) }}
          transition={transition}
        >
          {items.map((item, index) => {
            const isActive = currentIndex === index;

            return (
              <div
                key={`${item.src}-${index}`}
                className="shrink-0"
                style={{ width: safeSlideWidth, perspective: '1200px' }}
              >
                <motion.div
                  className={cn(
                    'flex w-full flex-col items-center gap-3 will-change-transform',
                    slideClassName
                  )}
                  animate={{
                    rotateY: (currentIndex - index) * rotationStep,
                    scale: isActive ? 1 : safeInactiveScale,
                  }}
                  transition={transition}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <button
                    type="button"
                    aria-label={`Show ${item.title}`}
                    aria-current={isActive ? 'true' : undefined}
                    className="aspect-[3/4] w-full cursor-pointer"
                    onClick={() => {
                      selectSlide(index);
                      onSlideActivate?.(index);
                    }}
                  >
                    <img
                      src={item.src}
                      alt={item.alt ?? item.title}
                      draggable={false}
                      className={cn(
                        'h-full w-full select-none rounded-lg object-cover shadow-xl',
                        imageClassName
                      )}
                    />
                  </button>

                  <motion.p
                    className={cn('whitespace-nowrap text-sm', labelClassName)}
                    animate={{
                      filter: isActive ? 'blur(0px)' : 'blur(2px)',
                      opacity: isActive ? 1 : 0,
                    }}
                    transition={transition}
                  >
                    {item.title}
                  </motion.p>
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      </div>

      {showControls && (
        <div
          className={cn(
            'absolute inset-x-4 bottom-5 z-10 mx-auto flex w-fit items-center justify-center gap-3 rounded-full border border-neutral-300/80 bg-neutral-200/70 px-2 text-neutral-700 shadow-sm backdrop-blur-sm',
            controlsClassName
          )}
        >
          <button
            type="button"
            aria-label="Show previous slide"
            disabled={isPreviousDisabled}
            className="inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => selectSlide(currentIndex - 1)}
          >
            <ChevronLeft className="size-5" />
          </button>

          {showDots && (
            <div className="flex items-center justify-center gap-2">
              {items.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  type="button"
                  aria-label={`Show slide ${index + 1}: ${item.title}`}
                  aria-current={currentIndex === index ? 'true' : undefined}
                  className={cn(
                    'h-2 rounded-full bg-current transition-[width,opacity] duration-300',
                    currentIndex === index ? 'w-7 opacity-100' : 'w-2 opacity-30'
                  )}
                  onClick={() => selectSlide(index)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            aria-label="Show next slide"
            disabled={isNextDisabled}
            className="inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => selectSlide(currentIndex + 1)}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default PerspectiveCarousel;
