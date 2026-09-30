// A character-by-character typing effect, timed with gsap rather than a
// plain setInterval — each character is one step in a gsap-scheduled
// sequence (gsap.delayedCall chaining itself), and the blinking cursor is
// a simple opacity yoyo tween. Supports cycling through multiple strings
// (type → pause → delete → next) when `loop` is on; with a single string
// and `loop={false}` it just types once and stops, cursor still blinking.
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface TextTypeProps {
  text: string | string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  showCursor?: boolean;
  cursorCharacter?: string;
  cursorBlinkDuration?: number;
  loop?: boolean;
  variableSpeedEnabled?: boolean;
  variableSpeedMin?: number;
  variableSpeedMax?: number;
  className?: string;
  cursorClassName?: string;
  /** Fires once, the first time a string finishes typing out. */
  onComplete?: () => void;
}

export default function TextType({
  text,
  typingSpeed = 75,
  deletingSpeed = 50,
  pauseDuration = 1500,
  showCursor = true,
  cursorCharacter = '_',
  cursorBlinkDuration = 0.5,
  loop = true,
  variableSpeedEnabled = false,
  variableSpeedMin = 60,
  variableSpeedMax = 120,
  className,
  cursorClassName,
  onComplete,
}: TextTypeProps) {
  const [displayed, setDisplayed] = useState('');
  const cursorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const texts = Array.isArray(text) ? text : [text];
    let cancelled = false;
    let textIndex = 0;
    let fired = false;

    const typeOne = () => {
      if (cancelled) return;
      const full = texts[textIndex];
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i += 1;
        setDisplayed(full.slice(0, i));
        if (i < full.length) {
          const speed = variableSpeedEnabled ? gsap.utils.random(variableSpeedMin, variableSpeedMax) : typingSpeed;
          gsap.delayedCall(speed / 1000, step);
        } else {
          if (!fired) { fired = true; onComplete?.(); }
          if (loop || textIndex < texts.length - 1) {
            gsap.delayedCall(pauseDuration / 1000, deleteOne);
          }
        }
      };
      step();
    };

    const deleteOne = () => {
      if (cancelled) return;
      const full = texts[textIndex];
      let i = full.length;
      const step = () => {
        if (cancelled) return;
        i -= 1;
        setDisplayed(full.slice(0, i));
        if (i > 0) {
          gsap.delayedCall(deletingSpeed / 1000, step);
        } else {
          textIndex = (textIndex + 1) % texts.length;
          gsap.delayedCall(0.1, typeOne);
        }
      };
      step();
    };

    typeOne();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(text) ? text.join('\u0000') : text]);

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return;
    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut',
    });
    return () => { tween.kill(); };
  }, [showCursor, cursorBlinkDuration]);

  return (
    <span className={className}>
      {displayed}
      {showCursor && <span ref={cursorRef} className={cursorClassName}>{cursorCharacter}</span>}
    </span>
  );
}
