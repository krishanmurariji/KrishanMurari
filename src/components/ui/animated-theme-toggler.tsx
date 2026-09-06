// Adapted from MagicUI's Animated Theme Toggler
// (magicui.design/r/animated-theme-toggler.json) — trimmed to the one shape
// variant this site actually uses (a circular wipe from the button itself)
// and switched to controlled `theme`/`onThemeChange` props, since this app
// already drives light/dark via its own `isLight` React state rather than a
// `dark` class + next-themes. The genuinely hard-won part of the original —
// the percentage-based clip-path math (a documented Chrome bug workaround
// for fractional display scaling) and the View Transition orchestration —
// now lives in lib/theme-transition.ts, shared with the lock screen's BB8
// toggle so both controls play the identical wipe rather than each having
// their own copy. Rendering stays the original's own plain Sun/Moon icon
// button, not a custom switch — the icon shown is the theme a click would
// switch *to*, same as the source component.
import { useCallback, useEffect, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';
import { runThemeTransition } from '../../lib/theme-transition';

interface AnimatedThemeTogglerProps {
  className?: string;
  iconSize?: number;
  duration?: number;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function AnimatedThemeToggler({ className, iconSize = 20, duration = 500, theme, onThemeChange }: AnimatedThemeTogglerProps) {
  const isDark = theme === 'dark';
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      const root = document.documentElement;
      if (root.dataset.themeVt !== 'active') return;
      delete root.dataset.themeVt;
      root.style.removeProperty('--theme-toggle-vt-duration');
      root.style.removeProperty('--theme-vt-clip-from');
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    runThemeTransition(button, duration, () => {
      flushSync(() => onThemeChange(isDark ? 'light' : 'dark'));
    });
  }, [duration, isDark, onThemeChange]);

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={className}
    >
      {isDark ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
