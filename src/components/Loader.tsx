import { useEffect, useRef, useState } from 'react';
import { AnimatedCircularProgressBar } from './ui/animated-circular-progress-bar';

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Purely an HTML progress overlay now — the assembling cube itself lives in the main
// Scene canvas (see RubiksCube.tsx), driven by the same progressRef. That means the
// cube visible under this overlay is the exact same object the home section hands off
// to: no second canvas, no crossfade, no possible mismatch in color/geometry/camera.
export default function Loader({
  progressRef,
  onComplete,
}: {
  progressRef: React.MutableRefObject<{ value: number }>;
  onComplete: () => void;
}) {
  const [percent, setPercent] = useState(0);

  // App.tsx passes a fresh `onComplete` arrow function on every render (hovering a
  // social icon, opening the resume panel, anything). Capture it in a ref so the
  // effect below can run exactly once — otherwise every unrelated re-render would
  // restart this whole animation from 0%, and it would never actually finish.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let raf: number;
    let startTimestamp: number | null = null;
    let done = false;
    const duration = 6400; // 6.4s assembly — within the requested 5–7s window
    const holdAfter = 500; // brief pause once fully assembled before handing off

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(safetyTimer);
      progressRef.current.value = 1;
      setPercent(100);
      onCompleteRef.current();
    };

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(t);

      progressRef.current.value = eased;
      setPercent(Math.round(eased * 100));

      if (elapsed < duration) {
        raf = requestAnimationFrame(step);
      } else {
        setTimeout(finish, holdAfter);
      }
    };

    // requestAnimationFrame is paused by the browser whenever the page isn't
    // actively compositing (backgrounded tab, aggressive power-saving) — since
    // every progress update above lives inside that rAF loop, a stall there
    // would otherwise leave the loader frozen forever with onComplete never
    // called. This timer guarantees a way out regardless.
    const safetyTimer = window.setTimeout(finish, duration + holdAfter + 2000);

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safetyTimer);
    };
  }, [progressRef]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden pointer-events-none">
      {/* Progress gauge — bottom center */}
      <div className="absolute bottom-16 md:bottom-20 flex flex-col items-center gap-3">
        <span className="text-[10px] md:text-xs font-medium tracking-[0.3em] uppercase text-black/50">
          Assembling
        </span>
        <AnimatedCircularProgressBar
          value={percent}
          className="size-20 md:size-24 text-base md:text-lg text-black/80"
          gaugePrimaryColor="#111111"
          gaugeSecondaryColor="rgba(0,0,0,0.1)"
        />
      </div>
    </div>
  );
}
