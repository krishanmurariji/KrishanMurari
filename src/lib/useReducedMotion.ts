import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getInitial(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

// Shared `prefers-reduced-motion` read — several independent animation
// loops (SmoothScroll's Lenis, Ferrofluid, Scene's ambient camera/cube
// motion) each need this same flag rather than every one of them setting up
// its own `matchMedia` listener.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitial);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
