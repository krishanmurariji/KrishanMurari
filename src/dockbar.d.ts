// Ambient JSX typings for the `dockbar` web components — the package ships
// DOM types (HTMLElementTagNameMap) but not JSX ones, so TSX doesn't
// otherwise know these tags exist. Prop names are camelCase (matching the
// actual Lit class properties, e.g. `maxScale`), not the kebab-case HTML
// attribute names shown in the library's own README — React 19 assigns
// props to custom elements as real DOM properties by name when a matching
// property exists on the element, so the JS property name is what matters
// here, not the attribute name Lit maps it to under the hood.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type DockWrapperProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  size?: number;
  padding?: number;
  gap?: number;
  maxScale?: number;
  maxRange?: number;
  direction?: 'horizontal' | 'vertical';
  position?: 'top' | 'right' | 'bottom' | 'left';
  easing?: string;
  sortable?: boolean;
  disabled?: boolean;
  allowDragDelete?: boolean;
  willChange?: boolean;
};

type DockItemProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  width?: number;
  height?: number;
  resizeDuration?: number;
  resizeExitDuration?: number;
  resizeEase?: string;
  easing?: string;
};

type DockSeparatorProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  size?: number;
  thickness?: number;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'dock-wrapper': DockWrapperProps;
      'dock-item': DockItemProps;
      'dock-separator': DockSeparatorProps;
    }
  }
}
