// The circular-wipe theme transition, factored out of
// components/ui/animated-theme-toggler.tsx so more than one control can
// trigger the identical effect (that component's own button, and now the
// BB8 toggle) instead of each re-implementing the View Transition
// orchestration and the percentage-based clip-path math — a documented
// Chrome bug workaround for fractional display scaling, kept exactly as
// the original had it rather than re-derived per caller.
function getCircleClipPaths(cx: number, cy: number, maxRadius: number, vw: number, vh: number): [string, string] {
  const point = (x: number, y: number) => `${(x / vw) * 100}% ${(y / vh) * 100}%`;
  const toRadius = (r: number) => `${(r / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;
  return [`circle(0% at ${point(cx, cy)})`, `circle(${toRadius(maxRadius)} at ${point(cx, cy)})`];
}

let transitioning = false;

/** Runs the same circular-wipe transition as the Control Center's theme
 * button, anchored at `anchorEl`'s own center. `applyTheme` is the actual
 * state change (e.g. `() => setIsLight(!isLight)`) — it runs inside the
 * View Transition's snapshot callback, same as the original. */
export function runThemeTransition(anchorEl: HTMLElement, duration: number, applyTheme: () => void) {
  if (transitioning || document.documentElement.dataset.themeVt === 'active') {
    applyTheme();
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { top, left, width, height } = anchorEl.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const maxRadius = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));

  if (typeof document.startViewTransition !== 'function') {
    applyTheme();
    return;
  }

  const clipPath = getCircleClipPaths(x, y, maxRadius, vw, vh);
  const root = document.documentElement;
  root.dataset.themeVt = 'active';
  root.style.setProperty('--theme-toggle-vt-duration', `${duration}ms`);
  // Pins the collapsed clip-path via CSS so Firefox doesn't paint the new
  // theme unclipped between the snapshot and the ready.then() JS animation.
  root.style.setProperty('--theme-vt-clip-from', clipPath[0]);

  const cleanup = () => {
    transitioning = false;
    delete root.dataset.themeVt;
    root.style.removeProperty('--theme-toggle-vt-duration');
    root.style.removeProperty('--theme-vt-clip-from');
  };

  transitioning = true;
  const transition = document.startViewTransition(() => {
    // React state updates inside startViewTransition's callback need to be
    // flushed synchronously for the snapshot to capture the new state —
    // the caller passes an `applyTheme` that already does this (see
    // AnimatedThemeToggler's use of flushSync) where it matters (React 18+).
    applyTheme();
  });
  transition.finished.finally(cleanup).catch(() => {});

  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath },
        { duration, easing: 'ease-in-out', fill: 'forwards', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
}
