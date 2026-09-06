// Adapted from MagicUI's Text 3D Flip (magicui.design/r/text-3d-flip.json):
// each character sits in its own little 3D box with two faces (front/back),
// and flipping the box 90° swaps which face is showing — a real per-letter
// 3D rotation, not a CSS text-shadow trick. Two changes from the registry
// version: `framer-motion` import (this project's convention — same
// library as `motion/react`, just the compat package name everything else
// here uses), `cn` from the project's own relative `lib/utils`, and one
// real addition — `autoFlipOnChange`. The original only flips on hover;
// this also flips automatically whenever the text itself changes, which is
// what a caption that rotates on its own timer (see PhotoCard in
// DesktopWidgets.tsx) actually needs.
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ElementType,
} from 'react';
import {
  useAnimate,
  type AnimationOptions,
  type ValueAnimationTransition,
} from 'framer-motion';
import { cn } from '../../lib/utils';

const HAS_SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl;

const splitIntoCharacters = (text: string): string[] => {
  if (HAS_SEGMENTER) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
};

const extractTextFromChildren = (children: React.ReactNode): string => {
  if (children == null) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);

  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }

  if (React.isValidElement(children)) {
    const props = children.props as Record<string, unknown>;
    const childText = props.children as React.ReactNode;
    if (childText != null) {
      return extractTextFromChildren(childText);
    }
  }

  return '';
};

const ROTATION_MAP = {
  top: 'rotateX(90deg)',
  right: 'rotateY(90deg)',
  bottom: 'rotateX(-90deg)',
  left: 'rotateY(-90deg)',
} as const;

const DEFAULT_TRANSITION: ValueAnimationTransition = {
  type: 'spring',
  damping: 30,
  stiffness: 300,
};

interface Text3DFlipProps {
  children: React.ReactNode;
  as?: ElementType;
  className?: string;
  textClassName?: string;
  flipTextClassName?: string;
  staggerDuration?: number;
  staggerFrom?: 'first' | 'last' | 'center' | number | 'random';
  transition?: ValueAnimationTransition | AnimationOptions;
  rotateDirection?: 'top' | 'right' | 'bottom' | 'left';
  /** Flip automatically whenever the text changes, not just on hover — on
   * by default, since that's the whole reason this fork exists. */
  autoFlipOnChange?: boolean;
}

const Text3DFlip = ({
  children,
  as: ElementTag = 'p',
  className,
  textClassName,
  flipTextClassName,
  staggerDuration = 0.05,
  staggerFrom = 'first',
  transition = DEFAULT_TRANSITION,
  rotateDirection = 'right',
  autoFlipOnChange = true,
  ...props
}: Text3DFlipProps) => {
  const isAnimatingRef = useRef(false);
  const isMountedRef = useRef(false);
  const [scope, animate] = useAnimate();

  const rotationTransform = ROTATION_MAP[rotateDirection];

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isAnimatingRef.current = false;
    };
  }, []);

  const text = useMemo(() => {
    try {
      return extractTextFromChildren(children);
    } catch {
      return '';
    }
  }, [children]);

  const characters = useMemo(() => {
    const words = text.split(' ');
    return words.map((word, i) => ({
      characters: splitIntoCharacters(word),
      needsSpace: i !== words.length - 1,
    }));
  }, [text]);

  const charOffsets = useMemo(() => {
    const offsets = [0];
    for (const word of characters) {
      offsets.push(offsets.at(-1)! + word.characters.length);
    }
    return offsets;
  }, [characters]);

  const getStaggerDelay = useCallback(
    (index: number, totalChars: number) => {
      if (staggerFrom === 'first') return index * staggerDuration;
      if (staggerFrom === 'last') return (totalChars - 1 - index) * staggerDuration;
      if (staggerFrom === 'center') {
        const center = Math.floor(totalChars / 2);
        return Math.abs(center - index) * staggerDuration;
      }
      if (staggerFrom === 'random') {
        const randomIndex = Math.floor(Math.random() * totalChars);
        return Math.abs(randomIndex - index) * staggerDuration;
      }
      return Math.abs(staggerFrom - index) * staggerDuration;
    },
    [staggerFrom, staggerDuration]
  );

  const runFlip = useCallback(async () => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    try {
      const totalChars = characters.reduce((sum, word) => sum + word.characters.length, 0);
      const delays = Array.from({ length: totalChars }, (_, i) => getStaggerDelay(i, totalChars));

      await animate(
        '.text-3d-flip-char',
        { transform: rotationTransform },
        { ...transition, delay: (i: number) => delays[i] }
      );

      if (!isMountedRef.current) return;

      await animate('.text-3d-flip-char', { transform: 'rotateX(0deg) rotateY(0deg)' }, { duration: 0 });
    } finally {
      if (isMountedRef.current) {
        isAnimatingRef.current = false;
      }
    }
  }, [characters, transition, getStaggerDelay, rotationTransform, animate]);

  // Skips the very first render — only flips when the text actually
  // *changes* to something new, not on initial mount.
  const hasMountedTextRef = useRef(false);
  useEffect(() => {
    if (!hasMountedTextRef.current) {
      hasMountedTextRef.current = true;
      return;
    }
    if (!autoFlipOnChange) return;
    void runFlip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // `ElementType` genuinely can't be typed polymorphically through JSX
  // without TypeScript collapsing prop types to `never` — a known limitation
  // of this "as"-prop pattern, not specific to what's rendered here.
  const Tag = ElementTag as unknown as React.FC<Record<string, unknown>>;

  return (
    <Tag className={cn('relative flex flex-wrap', className)} onMouseEnter={runFlip} ref={scope} {...props}>
      <span className="sr-only">{text}</span>

      {characters.map((wordObj, wordIndex) => (
        <span key={wordIndex} className="inline-flex">
          {wordObj.characters.map((char, charIndex) => (
            <CharBox
              key={charOffsets[wordIndex] + charIndex}
              char={char}
              textClassName={textClassName}
              flipTextClassName={flipTextClassName}
              rotateDirection={rotateDirection}
            />
          ))}
          {wordObj.needsSpace && <span className="whitespace-pre"> </span>}
        </span>
      ))}
    </Tag>
  );
};

interface CharBoxProps {
  char: string;
  textClassName?: string;
  flipTextClassName?: string;
  rotateDirection: 'top' | 'right' | 'bottom' | 'left';
}

const SECOND_FACE_TRANSFORMS = {
  top: 'rotateX(-90deg) translateZ(0.5lh)',
  right: 'rotateY(90deg) translateX(50%) rotateY(-90deg) translateX(-50%) rotateY(-90deg) translateX(50%)',
  bottom: 'rotateX(90deg) translateZ(0.5lh)',
  left: 'rotateY(90deg) translateX(50%) rotateY(-90deg) translateX(50%) rotateY(-90deg) translateX(50%)',
} as const;

const FRONT_FACE_TRANSFORMS = {
  top: 'translateZ(0.5lh)',
  bottom: 'translateZ(0.5lh)',
  left: 'rotateY(90deg) translateX(50%) rotateY(-90deg)',
  right: 'rotateY(-90deg) translateX(50%) rotateY(90deg)',
} as const;

const CONTAINER_TRANSFORMS = {
  top: 'translateZ(-0.5lh)',
  bottom: 'translateZ(-0.5lh)',
  left: 'rotateY(90deg) translateX(50%) rotateY(-90deg)',
  right: 'rotateY(90deg) translateX(50%) rotateY(-90deg)',
} as const;

const CharBox = memo(({ char, textClassName, flipTextClassName, rotateDirection }: CharBoxProps) => (
  <span className="text-3d-flip-char inline transform-3d" style={{ transform: CONTAINER_TRANSFORMS[rotateDirection] }}>
    <span
      className={cn('relative h-[1lh] backface-hidden', textClassName)}
      style={{ transform: FRONT_FACE_TRANSFORMS[rotateDirection] }}
    >
      {char}
    </span>
    <span
      className={cn('absolute top-0 left-0 h-[1lh] backface-hidden', flipTextClassName)}
      style={{ transform: SECOND_FACE_TRANSFORMS[rotateDirection] }}
    >
      {char}
    </span>
  </span>
));

CharBox.displayName = 'CharBox';
Text3DFlip.displayName = 'Text3DFlip';

export default Text3DFlip;
