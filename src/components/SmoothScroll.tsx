import { ReactNode, useEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Lenis's whole job is to replace native scrolling with an eased,
    // RAF-driven imitation of it — exactly the kind of motion
    // `prefers-reduced-motion` exists to opt visitors out of, and it's also
    // a RAF loop that would otherwise run for the entire session regardless
    // of whether anything else on the page is animating. Skipping it here
    // just leaves the browser's own native (instant) scrolling in place.
    if (reducedMotion) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, [reducedMotion]);

  return <>{children}</>;
}
