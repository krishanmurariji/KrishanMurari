// Ported from MagicUI's Interactive Hover Button
// (magicui.design/r/interactive-hover-button.json) — same anatomy (a dot
// that grows from nothing to fill the pill on hover while the label swaps
// for a second copy + arrow that slides in from the right), rebuilt
// without shadcn's `bg-background`/`bg-primary` CSS-variable theme tokens
// (this project doesn't have that theme system) in favor of explicit color
// props, so it can adapt to this site's own isLight/isDark state instead.
// Starts at scale-0 (invisible), not MagicUI's own default of a small
// always-visible dot — that default only reads cleanly against MagicUI's
// own fixed-width, short-label button; against a longer label like
// "Continue without signing in" here, a visible resting dot lands on top
// of a letter instead of beside it.
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InteractiveHoverButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  /** Pill background + border. */
  bg?: string;
  border?: string;
  /** Resting label color, shown before the dot expands. */
  textColor?: string;
  /** Dot color, and the fill color it expands into. */
  dotColor?: string;
  /** Label/arrow color once the dot has expanded to fill the pill — needs
   * contrast against `dotColor`, not against `bg`. */
  hoverTextColor?: string;
}

export const InteractiveHoverButton = forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(
  (
    { text = 'Button', className, bg = 'transparent', border = 'currentColor', textColor = 'currentColor', dotColor = 'currentColor', hoverTextColor = '#fff', style, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn('group relative cursor-pointer overflow-hidden rounded-full px-5 py-2.5 text-center text-[13px] font-medium', className)}
        style={{ background: bg, boxShadow: `inset 0 0 0 1px ${border}`, color: textColor, ...style }}
        {...props}
      >
        <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">{text}</span>
        <div
          className="absolute inset-0 z-10 flex translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
          style={{ color: hoverTextColor }}
        >
          <span>{text}</span>
          <ArrowRight size={15} />
        </div>
        <div
          className="absolute left-[18%] top-1/2 h-2 w-2 -translate-y-1/2 scale-0 rounded-full transition-all duration-300 group-hover:left-0 group-hover:top-0 group-hover:h-full group-hover:w-full group-hover:translate-y-0 group-hover:scale-100"
          style={{ background: dotColor }}
        />
      </button>
    );
  },
);
InteractiveHoverButton.displayName = 'InteractiveHoverButton';
