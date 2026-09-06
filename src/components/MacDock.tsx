import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { GlassBackdrop } from './GlassBackdrop';
import { useYouTubePlayer } from '../lib/youtube-player';

function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="5" y="3" width="5" height="18" rx="1" />
      <rect x="14" y="3" width="5" height="18" rx="1" />
    </svg>
  );
}
// Registers the `dock-wrapper`/`dock-item`/`dock-separator` custom elements.
// Their hover-magnify engine replaces the hand-rolled mouseX/spring math
// this dock used to run for both the regular icons *and* the tray tiles: a
// single centralized, purpose-built animation loop driving every item's
// real width/height in lockstep, instead of N independent Framer Motion
// springs each separately reacting to a shared mouseX — which is what kept
// producing cross-item staleness/overlap bugs. The regular icons and the
// tray tiles each get their own separate `<dock-wrapper>` (see below) so
// hovering near the divider between them can never cascade magnify across
// zones — but both now share the identical engine and feel, rather than the
// tray running a separate, deliberately-neutered system of its own.
//
// Guarded (not a plain `import 'dockbar'`) because the package calls
// `customElements.define(...)` at module-evaluation time — a plain static
// import re-runs that on every Vite dev-mode HMR reload of this file, and a
// tag name can only ever be defined once per page, so the second attempt
// throws and aborts the reload. Checking first, and only importing when the
// tag isn't registered yet, makes this safe across repeated hot reloads;
// production has only one load anyway so this never matters there. Any
// `<dock-wrapper>`/`<dock-item>` already in the DOM before the dynamic
// import resolves is auto-upgraded by the browser the moment it does.
if (typeof window !== 'undefined' && !customElements.get('dock-wrapper')) {
  void import('dockbar');
}

export interface DockApp {
  id: string;
  label: string;
  // Each icon is a self-contained app-tile SVG (own background + glyph baked
  // in, like a real macOS dock icon is one flat image) — not a glyph meant to
  // be tinted via `style.color` and dropped onto a generic wrapper.
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  kind: 'placeholder';
  url?: string;
  handle?: string;
}

export interface DockRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const BASE_SIZE = 48;
const MAX_SIZE = 80;
const INFLUENCE = 140;

function DockIcon({
  app,
  isLight,
  onClick,
  disabled,
  iconOverride,
  hoverExpand,
}: {
  app: DockApp;
  isLight?: boolean;
  onClick: (rect: DockRect) => void;
  disabled?: boolean;
  // Replaces the default per-app icon (currently just Spotify's tile
  // switching to the current track's thumbnail while something's playing)
  // without touching the tile's actual size/position — that's still owned
  // entirely by dock-item's own magnify engine.
  iconOverride?: ReactNode;
  // Hover content that expands upward above the tile instead of the plain
  // text tooltip there (currently just Spotify's inline Pause button while
  // a track is playing). Its show/hide is debounced rather than the plain
  // tooltip's immediate onMouseEnter/Leave — unlike a tooltip, this needs to
  // stay hoverable/clickable for its own button, and the tile and this
  // content are visually adjacent but separate elements, so without a short
  // grace period, moving the cursor from one to the other would cross a
  // real (if tiny) gap and close it before the pointer ever arrives.
  hoverExpand?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const handleEnter = () => {
    window.clearTimeout(hideTimer.current);
    setHovered(true);
  };
  const handleLeave = () => {
    if (!hoverExpand) {
      setHovered(false);
      return;
    }
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHovered(false), 150);
  };

  return (
    <dock-item>
      {/* Default slot — dock-item scales this via its own internal engine
          (real width/height on the outer <li>, matching genuine macOS dock
          reflow, coordinated centrally rather than via N separate springs).
          `::slotted(*)` in the library's own CSS already forces this to
          100%/100% of the current (possibly magnified) box. */}
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={() => {
          if (disabled) return;
          const rect = ref.current?.getBoundingClientRect();
          if (rect) onClick({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        aria-label={app.label}
        className="relative w-full h-full block rounded-2xl cursor-pointer disabled:cursor-default overflow-hidden"
        style={{ userSelect: 'none', boxShadow: '0 6px 14px rgba(0,0,0,0.28)' }}
      >
        {/* pointer-events-none on the SVG too — some browsers treat inline SVG
            content as independently draggable even inside a non-draggable
            button, which shows a native "ghost" thumbnail of the icon
            following the cursor if a click accidentally turns into a drag
            while testing hover. Routing all pointer interaction through the
            button (which has draggable=false) avoids that entirely. */}
        {iconOverride ?? <app.icon className="w-full h-full pointer-events-none block" />}
      </button>

      {/* Named "indicator" slot — a sibling of the scaled content in
          dock-item's own shadow template, so the tooltip/hover-expand stays
          a constant size instead of magnifying along with the icon. */}
      <div slot="indicator" className="relative w-full h-full pointer-events-none">
        {hoverExpand ? (
          <AnimatePresence>
            {hovered && (
              <motion.div
                // A "twisterInDown" feel to match the dock icon's own CSS
                // twister animation — rotating and dropping into place from
                // above rather than the plain fade+scale every other dock
                // hover-reveal uses.
                initial={{ opacity: 0, y: -24, rotate: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, y: -24, rotate: -50, scale: 0.9 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                className="pointer-events-auto absolute bottom-full left-1/2 mb-2 -translate-x-1/2"
              >
                {hoverExpand}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap"
              style={{
                background: isLight ? 'rgba(50,50,52,0.92)' : 'rgba(245,245,245,0.92)',
                color: isLight ? '#fff' : '#111',
              }}
            >
              {app.label}
            </motion.div>
          )
        )}
      </div>
    </dock-item>
  );
}

// A reserved layout slot for one minimized app's tray tile — a bare
// dock-item with no content, existing purely so the tray's own dock-wrapper
// (below) includes it in the same real, race-free magnify/layout engine the
// regular icons use, rather than reinventing per-tile spring physics that
// have no way to know about their siblings. MacDock only owns this
// placeholder (for spacing + measuring where "into the dock" is); the actual
// visible preview is rendered by that app's own AppWindow instance,
// fixed-positioned to mirror this slot's measured rect (position *and*
// size — the size is no longer always 48px now that the library itself
// magnifies this placeholder on hover). Keeping each slot keyed by appId
// (rather than a single boolean) is what makes multiple minimized previews
// coexist instead of one clobbering another.
function TraySlot({ itemRef }: { itemRef: (el: HTMLElement | null) => void }) {
  return <dock-item ref={itemRef} />;
}

export default function MacDock({
  apps,
  onSelect,
  isLight,
  isLoading,
  minimizedAppIds,
  onTrayRectChange,
  disabled,
  sceneCanvasRef,
}: {
  apps: DockApp[];
  onSelect: (id: string, rect: DockRect) => void;
  isLight?: boolean;
  isLoading?: boolean;
  minimizedAppIds: string[];
  onTrayRectChange: (id: string, rect: DockRect | null) => void;
  disabled?: boolean;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRefs = useRef<Record<string, HTMLElement | null>>({});
  // Drives the Spotify dock icon's hover popup below — reads the same
  // app-wide YouTube playback state SpotifyApp.tsx's now-playing bar does
  // (see src/lib/youtube-player.tsx), so both stay in lockstep as one
  // player rather than two independent ones.
  const ytPlayer = useYouTubePlayer();

  // Re-measures every current tray slot whenever the dock container's own
  // size changes — not just when a slot is added or removed (a ResizeObserver
  // on the container, rather than each slot re-measuring independently on
  // mount, is what actually catches the continuous reflow a regular icon's
  // own hover-magnification causes; see TraySlot's comment for why that
  // reflow matters here even though no tray slot itself resized).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureAll = () => {
      for (const id of minimizedAppIds) {
        const el = trayRefs.current[id];
        const r = el?.getBoundingClientRect();
        // Skip reporting an obviously-unstyled reading (0×0 — a brand new
        // dock-item before its custom-element upgrade/first render) instead
        // of forwarding it as this app's trayRect. Reporting it was harmless
        // for the *tile's own rendered position*, which just re-renders again
        // once the settle timer below reports the real size — but AppWindow's
        // genie also reads trayRect once, at the exact moment it starts
        // animating a fresh minimize, to pick its target point. On the very
        // first minimize of a session (the tray didn't exist until this
        // render), that one-shot read was grabbing this exact bad value
        // before it ever got corrected, sending the genie to whatever
        // meaningless point a 0×0 rect resolves to instead of the dock.
        // Withholding the update until there's a real, non-zero box means
        // trayRect only ever transitions from null straight to a correct
        // value — never through a bad intermediate one.
        if (r && r.width > 0 && r.height > 0) {
          onTrayRectChange(id, { left: r.left, top: r.top, width: r.width, height: r.height });
        }
      }
    };

    measureAll();
    // A newly-added tray slot is a brand new <dock-item> — its custom-element
    // upgrade and first Lit render happen on a microtask, not synchronously
    // with insertion, so the *first* measureAll() above reliably catches it
    // still unstyled (0×0) rather than at its real size. That transition
    // apparently doesn't reliably trip the ResizeObserver below either
    // (verified: the DOM settles into its real 48×48 size, but no further
    // callback fires without an unrelated resize nudging it) — so this
    // one-shot follow-up re-measure shortly after mount is what actually
    // corrects the tile once the new item has finished rendering, rather
    // than leaving it stuck at its initial zero-sized reading.
    const settleTimer = window.setTimeout(measureAll, 50);
    const ro = new ResizeObserver(measureAll);
    ro.observe(container);
    window.addEventListener('resize', measureAll);
    return () => {
      window.clearTimeout(settleTimer);
      ro.disconnect();
      window.removeEventListener('resize', measureAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimizedAppIds.join(','), onTrayRectChange]);

  // While actually playing, the Spotify tile itself becomes the current
  // track's thumbnail (with the same decorative bass-pulse rings the widget
  // uses) instead of the static logo, and hovering expands a Pause button
  // upward above it rather than a floating card — paused or nothing loaded
  // just falls back to the plain "Spotify" tooltip every other icon has
  // (see the `hoverExpand={... : undefined}` below). Both the thumbnail and
  // the logo it swaps back to on pause are given their own `key` so React
  // treats every playing↔paused flip as a fresh element — that's what
  // actually replays the twister CSS animation each time, since a CSS
  // animation only (re)plays on an element's own mount, not on a prop
  // change to an element already sitting there.
  // Active covers buffering too, not just actually playing — a track can
  // be `current` and `loading` before its first real PLAYING event ever
  // fires (right after picking it, or right after a skip), and that gap is
  // exactly when a dock icon that only reacted to `playing` would sit there
  // still showing the plain logo with no feedback at all.
  const spotifyActive = !!ytPlayer.current && (ytPlayer.playing || ytPlayer.loading);
  const SpotifyLogo = apps.find((a) => a.id === 'spotify')?.icon;

  const spotifyIconOverride = spotifyActive ? (
    <div key="active" className="animate-twister-in-up relative h-full w-full overflow-hidden rounded-2xl">
      <img src={ytPlayer.current!.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover pointer-events-none" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {ytPlayer.loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <>
            <span className="bass-pulse-ring" style={{ width: 26, height: 26, animationDuration: '1.6s', animationDelay: '0s' }} />
            <span className="bass-pulse-ring" style={{ width: 26, height: 26, animationDuration: '2.1s', animationDelay: '0.5s' }} />
            <span className="bass-pulse-ring" style={{ width: 26, height: 26, animationDuration: '1.85s', animationDelay: '1s' }} />
          </>
        )}
      </div>
    </div>
  ) : SpotifyLogo ? (
    <div key="paused" className="animate-twister-in-down h-full w-full">
      <SpotifyLogo className="w-full h-full pointer-events-none block" />
    </div>
  ) : undefined;

  const spotifyHoverExpand = spotifyActive ? (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-2 shadow-lg"
      style={{ background: 'rgba(20,20,24,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
    >
      <button
        type="button"
        aria-label={ytPlayer.loading ? 'Loading' : 'Pause'}
        onClick={ytPlayer.togglePlay}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/15"
      >
        {ytPlayer.loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <PauseIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  ) : undefined;

  return (
    <motion.div
      ref={containerRef}
      // Opacity only — no `y`. Framer Motion renders any animated `y` as an
      // inline `transform`, and per spec a transform value other than `none`
      // (even a settled, visually-inert `translateY(0px)`) permanently makes
      // this element a CSS stacking context / "backdrop root." That would
      // wall off the glass panel inside it from ever sampling anything
      // outside this element — including the WebGL canvas behind it — which
      // is exactly why the dock wasn't showing the scene through the blur.
      initial={{ opacity: 0 }}
      animate={{ opacity: !isLoading ? 1 : 0 }}
      transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-end gap-4 px-4 py-2.5"
    >
      {/* Glass panel — a separate, absolutely-positioned layer tracking the
          row's own size (icons magnify via real width/height, so the row
          genuinely widens on hover — this panel just rides along via inset-0
          rather than needing to be sized manually). No explicit z-index here
          on purpose — it's first in DOM order, and negative z-index is known
          to interact unreliably with backdrop-filter's compositing in some
          browser engines; the icons (rendered after, with their own explicit
          positive z-index) still correctly paint above it without needing
          this layer pushed negative. */}
      <div
        className="absolute inset-0 rounded-[24px] border overflow-hidden"
        style={{
          borderColor: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.14)',
          borderTopColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)',
          boxShadow: isLight
            ? '0 18px 44px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -8px 20px -12px rgba(255,255,255,0.5)'
            : '0 18px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -8px 20px -12px rgba(255,255,255,0.06)',
        }}
      >
        {/* The actual blur-through-the-scene effect — see GlassBackdrop above. */}
        <GlassBackdrop sceneCanvasRef={sceneCanvasRef} containerRef={containerRef} />

        {/* Frosted tint over the blurred snapshot. backdrop-filter here only
            needs to `saturate` (no blur — GlassBackdrop already blurred the
            canvas it's sampling), and unlike blurring the WebGL scene
            directly, saturating what's now ordinary 2D canvas content behind
            it is exactly the kind of thing backdrop-filter reliably handles. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'linear-gradient(165deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.1) 55%, rgba(255,255,255,0.16) 100%)'
              : 'linear-gradient(165deg, rgba(90,90,96,0.24) 0%, rgba(18,18,20,0.16) 55%, rgba(50,50,55,0.2) 100%)',
            backdropFilter: 'saturate(160%)',
            WebkitBackdropFilter: 'saturate(160%)',
          }}
        />

        {/* Specular sheen — a soft diagonal highlight sweeping the glass, like light
            catching curved liquid-glass rather than a flat frosted panel. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'radial-gradient(120% 60% at 25% -10%, rgba(255,255,255,0.85), transparent 60%)'
              : 'radial-gradient(120% 60% at 25% -10%, rgba(255,255,255,0.22), transparent 60%)',
            mixBlendMode: isLight ? 'overlay' : 'screen',
          }}
        />
      </div>

      <dock-wrapper
        size={BASE_SIZE}
        padding={0}
        gap={16}
        maxScale={MAX_SIZE / BASE_SIZE}
        maxRange={INFLUENCE}
        direction="horizontal"
        position="bottom"
        sortable={false}
        disabled={disabled}
      >
        {apps.map((app) => (
          <DockIcon
            key={app.id}
            app={app}
            isLight={isLight}
            disabled={disabled}
            onClick={(rect) => onSelect(app.id, rect)}
            iconOverride={app.id === 'spotify' ? spotifyIconOverride : undefined}
            hoverExpand={app.id === 'spotify' ? spotifyHoverExpand : undefined}
          />
        ))}
      </dock-wrapper>

      {minimizedAppIds.length > 0 && (
        <>
          {/* Extra mx-2 on top of the row's own gap — a separate dock-wrapper
              (below) rather than one shared with the regular icons, so
              hovering near this boundary can never cascade magnify across
              into the other zone; this just gives that boundary a bit more
              breathing room visually too. */}
          <div
            className="w-px h-10 self-center rounded-full shrink-0 mx-2"
            style={{ background: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)' }}
          />
          <dock-wrapper
            size={BASE_SIZE}
            padding={0}
            gap={16}
            maxScale={MAX_SIZE / BASE_SIZE}
            maxRange={INFLUENCE}
            direction="horizontal"
            position="bottom"
            sortable={false}
            disabled={disabled}
          >
            {minimizedAppIds.map((id) => (
              <TraySlot key={id} itemRef={(el) => { trayRefs.current[id] = el; }} />
            ))}
          </dock-wrapper>
        </>
      )}
    </motion.div>
  );
}
