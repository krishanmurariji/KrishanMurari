// Ported from MagicUI's Ripple (magicui.design/r/ripple.json): concentric
// rings that gently breathe in/out with a staggered per-ring delay, masked
// to fade out toward the bottom edge. Faithful port — only `cn` from this
// project's own relative `lib/utils` changes. The `animate-ripple` utility
// class it depends on isn't a stock Tailwind one; MagicUI's own setup adds
// it via a Tailwind plugin registration, which this project doesn't have, so
// the equivalent `@keyframes ripple` + `--animate-ripple` theme token is
// defined directly in index.css instead, following the same pattern already
// used there for `--animate-pop-in`/`--animate-fade-in`.
import React, { type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { cn } from '../../lib/utils';

interface RippleProps extends ComponentPropsWithoutRef<'div'> {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
}

export const Ripple = React.memo(function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 8,
  className,
  ...props
}: RippleProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,white,transparent)] select-none',
        className,
      )}
      {...props}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.03;
        const animationDelay = `${i * 0.06}s`;

        return (
          <div
            key={i}
            className="animate-ripple absolute rounded-full border shadow-xl"
            style={
              {
                '--i': i,
                width: `${size}px`,
                height: `${size}px`,
                opacity,
                animationDelay,
                borderStyle: 'solid',
                borderWidth: '1px',
                borderColor: 'currentColor',
                backgroundColor: 'currentColor',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) scale(1)',
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
});

Ripple.displayName = 'Ripple';
