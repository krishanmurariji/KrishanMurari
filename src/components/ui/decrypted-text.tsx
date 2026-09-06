// Adapted from a pasted DecryptedText usage (a reactbits.dev-style
// component): characters scramble through a random pool and progressively
// lock in to the real text, either all at once or left-to-right/right-to-
// left/from-center ("sequential" + "revealDirection"). Plain React state +
// setInterval, no animation library — same reasoning as shiny-text.tsx next
// to it, the `motion` package the original snippet asked to install isn't
// needed for a per-character scramble like this. `animateOn="view"` uses a
// plain IntersectionObserver to start once the text scrolls into view,
// matching the pasted "animates when in view" example — the mode this
// project's actual use (a paragraph inside an already-open panel) needs.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: 'view' | 'hover' | 'mount';
  sequential?: boolean;
  revealDirection?: 'start' | 'end' | 'center';
  useOriginalCharsOnly?: boolean;
}

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export default function DecryptedText({
  text,
  speed = 40,
  maxIterations = 24,
  characters = DEFAULT_CHARSET,
  className,
  parentClassName,
  encryptedClassName,
  animateOn = 'view',
  sequential = true,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
}: DecryptedTextProps) {
  const [started, setStarted] = useState(animateOn === 'mount');
  const [chars, setChars] = useState<string[]>(() => text.split(''));
  const [revealedCount, setRevealedCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (animateOn !== 'view') return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animateOn]);

  useEffect(() => {
    if (!started) return;
    const length = text.length;
    const pool = useOriginalCharsOnly
      ? Array.from(new Set(text.replace(/\s/g, '').split(''))).join('') || characters
      : characters;

    let iteration = 0;
    const id = window.setInterval(() => {
      iteration++;
      const count = Math.min(length, Math.ceil((iteration / maxIterations) * length));
      setRevealedCount(count);
      setChars(
        text.split('').map((ch, i) => {
          if (ch === ' ') return ch;
          const locked = sequential
            ? revealDirection === 'end'
              ? i >= length - count
              : revealDirection === 'center'
                ? Math.abs(i - length / 2) < count / 2
                : i < count
            : iteration >= maxIterations;
          return locked ? ch : pool[Math.floor(Math.random() * pool.length)];
        }),
      );
      if (iteration >= maxIterations) {
        window.clearInterval(id);
        setChars(text.split(''));
        setRevealedCount(length);
      }
    }, speed);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, text]);

  const isLocked = (i: number, length: number) =>
    sequential
      ? revealDirection === 'end'
        ? i >= length - revealedCount
        : revealDirection === 'center'
          ? Math.abs(i - length / 2) < revealedCount / 2
          : i < revealedCount
      : revealedCount >= length;

  return (
    <span
      ref={ref}
      className={parentClassName}
      onMouseEnter={animateOn === 'hover' ? () => setStarted(true) : undefined}
    >
      {chars.map((ch, i) => (
        <span key={i} className={cn(ch === ' ' || isLocked(i, text.length) ? className : encryptedClassName)}>
          {ch}
        </span>
      ))}
    </span>
  );
}
