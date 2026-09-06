// Adapted from a pasted ShinyText usage (a reactbits.dev-style component): a
// text-clip gradient sweeping across the text on a loop, giving it a subtle
// metallic shimmer. Pure CSS (background-position animating across a
// text-clipped gradient) — no animation library needed at all, so this
// doesn't pull in the `motion` package the original snippet asked to
// install; framer-motion (already used throughout this project) covers
// everything else and this effect needs neither. The keyframe itself lives
// in index.css (`--animate-shiny-sweep`), following the same
// `@theme`-token pattern already used there for the other custom animations.
import { useId } from 'react';
import { cn } from '../../lib/utils';

interface ShinyTextProps {
  text: string;
  speed?: number;
  delay?: number;
  color?: string;
  shineColor?: string;
  spread?: number;
  direction?: 'left' | 'right';
  yoyo?: boolean;
  pauseOnHover?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function ShinyText({
  text,
  speed = 2,
  delay = 0,
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  direction = 'left',
  yoyo = false,
  pauseOnHover = false,
  disabled = false,
  className,
}: ShinyTextProps) {
  const id = useId();
  const angle = direction === 'left' ? '100deg' : '-100deg';

  return (
    <span
      id={id}
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: `linear-gradient(${angle}, ${color} 40%, ${shineColor} 50%, ${color} 60%)`,
        backgroundSize: `${spread}% 100%`,
        WebkitBackgroundClip: 'text',
        animation: disabled ? 'none' : `shiny-sweep ${speed}s linear ${delay}s infinite ${yoyo ? 'alternate' : 'normal'}`,
      }}
    >
      {text}
      {pauseOnHover && (
        <style>{`#${id}:hover { animation-play-state: paused; }`}</style>
      )}
    </span>
  );
}
