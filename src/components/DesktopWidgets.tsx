// A macOS-style "Today View" widget stack, anchored to three independent
// screen corners: an analog clock + calendar side by side with a weather
// card below them at top-left, the vinyl-record Music player at top-right,
// and a photo card (cycling between four avatars) at bottom-right — the same
// general "Today View" language Apple's own widget gallery uses, just spread
// across corners instead of one single stack. All decorative/static demo
// data (the weather numbers mirror Apple's own marketing screenshots) —
// there's no live weather/calendar API wired up.
//
// Edit mode (toggled from the menu bar's Settings button) mirrors real
// macOS/iOS widget editing: the rest of the desktop dims/freezes (handled in
// App.tsx, not here) while these stay full-color and each gets a small "✕"
// to remove it. Re-adding a removed widget happens from the Settings
// dropdown in the menu bar, not here — see MenuBar.tsx.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useYouTubePlayer } from '../lib/youtube-player';
import { GlassBackdrop } from './GlassBackdrop';
import { NAME, BIO, EMAIL, MailGlyph } from './apps/profile/shared';

// Below this, each corner group shrinks in place via a plain transform
// instead of resizing individually — see the render below for how
// MOBILE_BREAKPOINT and the resulting scale get used.
const MOBILE_BREAKPOINT = 768;
const MOBILE_SCALE = 0.68;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return isMobile;
}

// The stack and Photo groups are laid out side by side on mobile — that
// only actually fits down to a certain viewport width (both are the same
// STACK_SIZE-wide square, scaled by MOBILE_SCALE); below it, the two
// `left-4`/`right-4`-anchored corners overlap each other instead of sitting
// beside each other. This tracks the live viewport width so the render
// below can fall back to stacking them vertically instead, rather than a
// single fixed scale that only works down to one particular phone width.
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

export const WIDGET_IDS = ['clock', 'calendar', 'weather', 'music', 'photo'] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: 'Clock',
  calendar: 'Calendar',
  weather: 'Weather',
  music: 'Music',
  photo: 'Photos',
};

// The Music widget needs the *real* shared playback state (the Howl
// instance lives in App.tsx so it survives Control Center opening/closing)
// rather than its own independent player — otherwise the desktop widget and
// the Control Center "Now Playing" card would show two different playback
// states for the same audio.
export interface MusicPlaybackProps {
  playing: boolean;
  onTogglePlay: () => void;
  onSkip: () => void;
  trackTitle: string;
  trackArtist: string;
}

// Live previews for the Settings gallery (see MenuBar.tsx/AccordionGallery)
// — the real widgets themselves, just scaled down, rather than a static
// screenshot standing in for them. Exported as lazy getters (not plain
// JSX) so each preview is a fresh element instance per render — the
// gallery mounts these inside its own hover-driven layout. Music is the one
// exception that needs external props (the shared playback state above),
// hence the optional second argument every entry ignores except that one.
export const WIDGET_PREVIEWS: Record<WidgetId, (music?: MusicPlaybackProps) => ReactNode> = {
  clock: () => <div style={{ transform: 'scale(0.72)' }}><GlassCell width={SQUARE} height={SQUARE}><AnalogClock /></GlassCell></div>,
  calendar: () => <div style={{ transform: 'scale(0.72)' }}><GlassCell width={SQUARE} height={SQUARE}><CalendarCard /></GlassCell></div>,
  weather: () => <div style={{ transform: 'scale(0.72)' }}><GlassCell width={SQUARE} height={SQUARE}><WeatherCard /></GlassCell></div>,
  music: (music) => (
    <div style={{ transform: 'scale(0.72)' }}>
      {music && (
        <GlassCell width={SQUARE} height={SQUARE}>
          <MusicPlayerCard {...music} />
        </GlassCell>
      )}
    </div>
  ),
  photo: () => <div style={{ transform: 'scale(0.72)' }}><PhotoCard /></div>,
};

// One shared cell size — Calendar/Weather/Clock/Music now all sit in a
// single 2x2 stack (matching Apple's own Today View gallery layout) instead
// of each claiming its own screen corner at its own size.
const SQUARE = 150;
const GAP = 8;
const STACK_SIZE = SQUARE * 2 + GAP; // the whole 2x2 grid's total footprint
// Photo sits directly below the 2x2 stack now, sized to match its total
// footprint exactly (same width *and* height) rather than being its own
// screen-anchored corner.
const PHOTO_WIDTH = STACK_SIZE;
const PHOTO_HEIGHT = STACK_SIZE;

const WIDGET_SHADOW = '0 10px 30px rgba(0,0,0,0.18)';

// The exact frosted-glass material ControlCenterPanel.tsx uses in dark mode
// — a blurred copy of the live scene (GlassBackdrop), a refraction pass
// through the same SVG distortion filter, then this translucent tint +
// inner shine. Kept as plain constants rather than threading `isLight`
// through every widget: the reference design this matches is a fixed dark
// "Today View" style, not a theme-adaptive one.
const GLASS_TINT = 'linear-gradient(165deg, rgba(70,70,76,0.32) 0%, rgba(15,15,17,0.24) 100%)';
const GLASS_SHINE =
  'inset 1.5px 1.5px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 1px 1px rgba(255,255,255,0.08)';

// One cell's full glass chrome, sized via `style` — each cell gets its own
// GlassBackdrop rather than one shared instance behind the whole stack: a
// single shared backdrop spanning the group's whole bounding box was
// visible as a plain sharp-cornered rectangle in the gaps *between* cells
// (nothing there to clip or tint it), instead of those gaps staying
// transparent the way separate floating widgets should read. Four small
// backdrop copies costs a little more than one, but it's cheap at this
// size and it's the only way each cell's own rounded clip actually contains
// its own piece of the blur instead of one panel bleeding through the gaps.
function GlassCell({
  width,
  height,
  radius = 26,
  sceneCanvasRef,
  children,
}: {
  width: number;
  height: number;
  radius?: number;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="relative shrink-0 overflow-hidden"
      style={{ width, height, borderRadius: radius, boxShadow: WIDGET_SHADOW }}
    >
      <GlassBackdrop sceneCanvasRef={sceneCanvasRef} containerRef={containerRef} pad={12} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backdropFilter: 'blur(3px) url(#lg-dist)', WebkitBackdropFilter: 'blur(3px)', isolation: 'isolate' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: GLASS_TINT, backdropFilter: 'saturate(160%)', WebkitBackdropFilter: 'saturate(160%)' }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: GLASS_SHINE, borderRadius: radius }} />
      <div className="relative z-[1] h-full w-full">{children}</div>
    </div>
  );
}

// The plain analog clock face Apple itself uses (Notification Center's
// "Clock" widget / Control Center's world clock) — a circular face, 12
// simple hour ticks (no numbers, no minute sub-ticks), thin black-or-white
// hands, and a thin red second hand with the small counterweight tail real
// analog clocks have. `isLight` flips the face between white (light theme)
// and black (dark theme), per the app's own `isLight` state (see App.tsx) —
// threaded down through DesktopWidgets rather than reading a CSS class,
// since this app drives light/dark from that one React boolean everywhere
// else too.
function AnalogClock({ isLight = true }: { isLight?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const H = now.getHours() % 12;
  const M = now.getMinutes();
  const S = now.getSeconds();
  const hourDeg = H * 30 + M * 0.5;
  const minDeg = M * 6 + S * 0.1;
  const secDeg = S * 6;

  const faceColor = isLight ? '#ffffff' : '#000000';
  const tickColor = isLight ? '#1c1c1e' : '#f2f2f2';
  const handColor = isLight ? '#1c1c1e' : '#ffffff';
  const secColor = '#ff3b30';

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg viewBox="0 0 150 150" width="86%" height="86%">
        <circle cx="75" cy="75" r="73" fill={faceColor} />

        {Array.from({ length: 12 }, (_, i) => i).map((i) => {
          const deg = i * 30;
          const rad = (deg * Math.PI) / 180;
          const x1 = 75 + 65 * Math.sin(rad);
          const y1 = 75 - 65 * Math.cos(rad);
          const x2 = 75 + 55 * Math.sin(rad);
          const y2 = 75 - 55 * Math.cos(rad);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tickColor} strokeWidth={5} strokeLinecap="round" />;
        })}

        <line x1="75" y1="75" x2="75" y2="44" stroke={handColor} strokeWidth="6" strokeLinecap="round" transform={`rotate(${hourDeg} 75 75)`} />
        <line x1="75" y1="75" x2="75" y2="26" stroke={handColor} strokeWidth="5" strokeLinecap="round" transform={`rotate(${minDeg} 75 75)`} />

        <g transform={`rotate(${secDeg} 75 75)`}>
          <line x1="75" y1="90" x2="75" y2="20" stroke={secColor} strokeWidth="2" strokeLinecap="round" />
          <circle cx="75" cy="90" r="4" fill={secColor} />
        </g>
        <circle cx="75" cy="75" r="4.5" fill={secColor} />
      </svg>
    </div>
  );
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Decorative — same "no live calendar API wired up" demo-data convention
// the weather widget already uses; there's nothing real to count.
const DEMO_EVENT_COUNT = 7;

// "Up next" agenda style (today's date + a week strip), not the old
// month-grid — matches the reference Today View layout, and reads better at
// this widget's actual size than a full 7-column month grid did.
function CalendarCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Only needs to notice an actual day change, but checking once a minute
    // is cheap and means it never shows yesterday's date past midnight.
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dayName = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  const dateNum = now.getDate();
  const todayIndex = now.getDay();

  return (
    <div className="flex h-full w-full flex-col justify-between p-3.5 text-white">
      <div className="flex items-start gap-2.5">
        <div className="text-[34px] font-bold leading-none">{dateNum}</div>
        <div className="pt-0.5 leading-tight">
          <div className="text-[13px] font-semibold">{dayName}</div>
          <div className="text-[11px] text-white/60">{monthName}</div>
          <div className="mt-1 text-[10px] text-white/45">{DEMO_EVENT_COUNT} Events</div>
        </div>
      </div>
      <div className="flex justify-between">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[8px] text-white/45">{d}</span>
            {i === todayIndex ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-semibold text-black">
                {dateNum}
              </span>
            ) : (
              <span className="h-1 w-1 rounded-full bg-white/30" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Sun-through-haze glyph — a plain sun with a couple of horizontal lines
// layered across it, matching the small icon iOS's own Weather widget shows
// for a "haze"-style condition (sun still visible, but veiled).
const HazeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="12" cy="10" r="6" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 1v2M12 21v2M2.5 10h2M19.5 10h2M5 3.5l1.4 1.4M17.6 4.9L19 3.5" />
    </g>
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity={0.9}>
      <path d="M4 16h16M6 19.5h12M8.5 23h7" />
    </g>
  </svg>
);

// A simpler, iOS-widget-style layout — just city, current temp, and the
// condition + high/low grouped under a small icon, no hourly forecast row —
// matching the reference the user supplied instead of the previous
// forecast-strip design.
function WeatherCard() {
  return (
    <div className="flex h-full w-full flex-col justify-between p-4 text-white">
      <div>
        <div className="text-[13px] font-medium">Yosemite, CA</div>
        <div className="text-[38px] font-light leading-none">72&deg;</div>
      </div>
      <div>
        <HazeIcon className="h-5 w-5" style={{ color: '#ffcc4d' }} />
        <div className="mt-1.5 text-[11px] leading-tight">Sunny with early fog</div>
        <div className="text-[11px] leading-tight text-white/70">H:77&deg; L:58&deg;</div>
      </div>
    </div>
  );
}

// The vinyl-record artwork used both at the small "peeking above the card"
// size and the larger size inside the expanded card — one component
// parameterized by pixel size instead of duplicating the same ~15 lines of
// SVG twice.
function VinylDisc({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className="duration-500 border-4 rounded-full shadow-md border-zinc-400 border-spacing-5">
      <svg>
        <rect width={128} height={128} fill="black" />
        <circle cx={20} cy={20} r={2} fill="white" />
        <circle cx={40} cy={30} r={2} fill="white" />
        <circle cx={60} cy={10} r={2} fill="white" />
        <circle cx={80} cy={40} r={2} fill="white" />
        <circle cx={100} cy={20} r={2} fill="white" />
        <circle cx={120} cy={50} r={2} fill="white" />
        <circle cx={90} cy={30} r={10} fill="white" fillOpacity="0.5" />
        <circle cx={90} cy={30} r={8} fill="white" />
        <path d="M0 128 Q32 64 64 128 T128 128" fill="purple" stroke="black" strokeWidth={1} />
        <path d="M0 128 Q32 48 64 128 T128 128" fill="mediumpurple" stroke="black" strokeWidth={1} />
        <path d="M0 128 Q32 32 64 128 T128 128" fill="rebeccapurple" stroke="black" strokeWidth={1} />
        <path d="M0 128 Q16 64 32 128 T64 128" fill="purple" stroke="black" strokeWidth={1} />
        <path d="M64 128 Q80 64 96 128 T128 128" fill="mediumpurple" stroke="black" strokeWidth={1} />
      </svg>
    </svg>
  );
}

// Renders the feTurbulence/feDisplacementMap filter the "liquid glass"
// popup's CSS references via `filter: url(#lg-dist)` (see index.css) — a
// hidden, zero-size SVG rather than inline on the popup itself, since
// MusicPlayerCard mounts twice at once while editing widgets (the real
// corner widget plus its live preview in the Settings gallery, see
// WIDGET_PREVIEWS above) and an SVG `id` must stay unique in the document.
// Lives at the DesktopWidgets module level (rendered once, unconditionally,
// by the default export below) so both instances can reference the same
// filter regardless of which one(s) are currently mounted.
function GlassDistortionFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="lg-dist" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves={2} seed={92} result="noise" />
        <feGaussianBlur in="noise" stdDeviation={2} result="blurred" />
        <feDisplacementMap in="SourceGraphic" in2="blurred" scale={70} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}


// The "liquid glass" card itself (see index.css's .glass-* rules + the SVG
// distortion filter above) — exported so MacDock.tsx can reuse it at a
// smaller size for the dock's Spotify hover popup instead of duplicating
// this markup. `compact` shrinks the thumb/controls/padding for that popup;
// the desktop widget below always renders full-size. Backed by the same
// real Howler.js playback the rest of the app shares (see
// App.tsx/MenuBar.tsx) — the forward-skip button is the one purely
// decorative part (no real playlist exists to back it), matching what the
// old design also left non-functional.
export function GlassMusicCard({
  playing,
  onTogglePlay,
  onSkip,
  trackTitle,
  trackArtist,
  compact,
  narrow,
  thumbnail,
  skipLabel = 'Restart',
  loading,
}: MusicPlaybackProps & {
  compact?: boolean;
  narrow?: boolean;
  thumbnail?: string | null;
  skipLabel?: string;
  // A YouTube track buffering after load/skip (the ambient Howler track
  // never has this state — ambient audio is a local file, effectively
  // instant) — shown as a spinner in place of the Play/Pause glyph so a
  // slow network doesn't read as an unresponsive button.
  loading?: boolean;
}) {
  const thumbSize = compact ? 40 : 56;
  const controlSize = compact ? 'h-7 w-7' : 'h-8 w-8';
  const playSize = compact ? 'h-8 w-8' : 'h-9 w-9';
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  // The button icon should point the way it actually skips — a queue's
  // "Next" (YouTube tracks) is forward, while the ambient track's own
  // "Restart" (the default skipLabel) is backward — rather than always
  // showing a back-chevron regardless of which direction it really does.
  const SkipIcon = skipLabel === 'Next' ? SkipForwardIcon : SkipBackIcon;

  // Fills whatever it's given (the shared GlassCell wrapper the desktop
  // widget stack sizes/tints — see DesktopWidgets' render below) rather than
  // sizing/tinting itself, unlike the compact/large variants below which are
  // still MacDock's own standalone popup. A blurred, scaled-up copy of the
  // same artwork bleeds to every edge (à la Spotify/Apple Music's ambient
  // "now playing" backdrop), framing the sharp original inset within it,
  // with a single Play/Pause button centered inside the bass-pulse rings —
  // no separate skip control here.
  if (narrow) {
    // Its own explicit border-radius, not just a reliance on the parent
    // GlassCell's own overflow-hidden clip — combining a rounded clip with
    // a sibling backdrop-filter layer (GlassCell's saturate tint, plus the
    // shared stack-level refraction filter) is a known Chromium quirk that
    // leaves the corners un-clipped otherwise; see ControlCenterPanel's
    // ThickSlider for the same fix on the same class of bug.
    return (
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: 26 }}>
        {/* Blurred bleed — same image, scaled up so the blur's own soft
            edges never show a gap at the card's border. */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: 'blur(24px) saturate(1.3) brightness(0.65)', transform: 'scale(1.35)' }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: '#1a1a1a' }} />
        )}

        {/* The sharp original, inset so the blurred bleed reads as a
            frame around it. */}
        <div className="absolute inset-2.5 overflow-hidden rounded-lg shadow-lg">
          {thumbnail ? (
            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
              <div className={playing ? 'animate-[spin_3s_linear_infinite]' : ''}>
                <VinylDisc size={40} />
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-1.5 pb-1">
            <h3 className="truncate text-[9.5px] font-semibold text-white" style={{ textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>
              {trackTitle}
            </h3>
            <span className="truncate text-[8px] text-white/70" style={{ textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>
              {trackArtist}
            </span>
          </div>
        </div>

        {/* Bass-pulse rings — a decorative "it's alive" cue while
            playing, not a real audio-frequency visualizer: the YouTube
            iframe is cross-origin, so its actual audio data isn't
            readable from here. Three rings on staggered, uneven
            durations/delays read as an irregular pulse instead of a
            mechanical, perfectly-synced sonar ping. */}
        {playing && !loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="bass-pulse-ring" style={{ width: 40, height: 40, animationDuration: '1.6s', animationDelay: '0s' }} />
            <span className="bass-pulse-ring" style={{ width: 40, height: 40, animationDuration: '2.1s', animationDelay: '0.5s' }} />
            <span className="bass-pulse-ring" style={{ width: 40, height: 40, animationDuration: '1.85s', animationDelay: '1s' }} />
          </div>
        )}

        {/* The one control for this card — Play/Pause, centered inside
            the pulse. A buffering YouTube track (see `loading` above)
            swaps the glyph for a spinner rather than leaving the button
            looking inert while it catches up. */}
        <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              aria-label={loading ? 'Loading' : playing ? 'Pause' : 'Play'}
              onClick={onTogglePlay}
              disabled={loading}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 disabled:cursor-wait"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : playing ? (
                <PauseGlyph className="h-5 w-5" />
              ) : (
                <PlayGlyph className="ml-0.5 h-5 w-5" />
              )}
            </button>
          </div>
      </div>
    );
  }

  return (
    <div className={cn('glass-container', compact ? 'glass-container--compact' : 'glass-container--large')}>
      <div className="glass-filter" />
      <div className="glass-overlay" />
      <div className="glass-specular" />
      <div className="glass-content glass-content--inline">
        <div className="player">
          <div className="player__thumb">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt=""
                className="rounded-md object-cover"
                style={{ width: thumbSize, height: thumbSize }}
              />
            ) : (
              <div className={playing ? 'animate-[spin_3s_linear_infinite]' : ''}>
                <VinylDisc size={thumbSize} />
              </div>
            )}
            <div className="player__legend">
              <h3 className="player__legend__title">{trackTitle}</h3>
              <span className="player__legend__sub-title">{trackArtist}</span>
            </div>
          </div>

          <div className="player__controls">
            <button
              type="button"
              aria-label={skipLabel}
              onClick={onSkip}
              className={cn('flex items-center justify-center rounded-full text-white transition hover:bg-white/15', controlSize)}
            >
              <SkipIcon className={iconSize} />
            </button>
            <button
              type="button"
              aria-label={loading ? 'Loading' : playing ? 'Pause' : 'Play'}
              onClick={onTogglePlay}
              disabled={loading}
              className={cn('flex items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:cursor-wait', playSize)}
            >
              {loading ? (
                <span className={cn('animate-spin rounded-full border-2 border-white/30 border-t-white', iconSize)} />
              ) : playing ? (
                <PauseGlyph className={iconSize} />
              ) : (
                <PlayGlyph className={iconSize} />
              )}
            </button>
            {!compact && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-white opacity-30">
                <SkipForwardIcon className={iconSize} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// The desktop widget itself is just the glass card, always shown — no
// icon/hover gate here (that's the dock's Spotify tile instead, see
// MacDock.tsx, which shows this same thumbnail+transport treatment directly
// on the dock icon while a track is playing). Prefers the shared YouTube
// player's state (real thumbnail + title/artist) over the local Howler
// ambient track whenever a YouTube track is actually active, so playing a
// song from the Spotify app reflects here too instead of the widget being
// stuck showing the ambient track regardless of what's really playing — the
// same state MacDock's Spotify tile already reads.
function MusicPlayerCard(props: MusicPlaybackProps) {
  const yt = useYouTubePlayer();
  if (yt.current) {
    return (
      <GlassMusicCard
        narrow
        playing={yt.playing}
        onTogglePlay={yt.togglePlay}
        onSkip={yt.skipNext}
        trackTitle={yt.current.title}
        trackArtist={yt.current.channelTitle}
        thumbnail={yt.current.thumbnail}
        skipLabel="Next"
        loading={yt.loading}
      />
    );
  }
  return <GlassMusicCard narrow {...props} />;
}

const SkipBackIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1={5} y1={19} x2={5} y2={5} />
  </svg>
);
const SkipForwardIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1={19} y1={5} x2={19} y2={19} />
  </svg>
);
const PlayGlyph = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const PauseGlyph = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x={6} y={4} width={4} height={16} />
    <rect x={14} y={4} width={4} height={16} />
  </svg>
);

// unavatar.io fetches whatever the CURRENT profile picture is at request
// time (not a fixed image) FOR PROVIDERS IT ACTUALLY SUPPORTS — but its own
// CDN allows a client-side cache of up to 28 days
// (`Cache-Control: max-age=2419200`), long enough that a visitor's browser
// could easily keep showing a months-stale photo well after the real one
// changed, with no way to tell it's stale. A query param that changes once
// a day forces a real re-fetch daily while still caching normally within
// that day, rather than re-fetching on every render.
const dailyCacheBust = () => new Date().toISOString().slice(0, 10);

// Cycles between these photos, each with its own distinct caption (a mix of
// the job titles and the more personal "Poet"/"Teacher" sides, rather than
// two captions repeated across four photos) — LinkedIn (Krishanmurariji) and
// Instagram (Krishanmurariji) were tried via the unavatar.io proxy but both
// fail — LinkedIn silently serves its generic fallback image (byte-identical
// to what a nonexistent username returns, confirmed by hash) and Instagram
// returns a 403 — so per "skip failed attempts" they're left out entirely
// rather than showing a placeholder. `unavatar.io/discord/{id}` was tried
// too (same idea as the X one below) but it isn't actually a supported
// provider there — confirmed it 200s with unavatar's own generic logo
// (image/svg+xml) instead of a real photo, rather than erroring the way
// LinkedIn/Instagram do, which made the failure easy to miss. Discord
// itself has no public, unauthenticated "current avatar for this user ID"
// endpoint (would need a bot token), so this one stays a direct CDN link
// with the avatar hash baked in — real, but frozen to whatever it was when
// last updated; it has to be swapped by hand (grab a fresh link via right-
// click the avatar in Discord → Copy Avatar Link) whenever the picture
// actually changes on Discord, unlike the X one below.
const PHOTOS = [
  { url: 'https://avatars.githubusercontent.com/Krishan-Vineforce?size=400', caption: 'Full Stack Developer' },
  { url: 'https://avatars.githubusercontent.com/Krishanmurariji?size=400', caption: 'Software Engineer' },
  { url: `https://unavatar.io/x/KrishanMuraari?u=${dailyCacheBust()}`, caption: 'Poet' },
  // This one's actual pixels are a circular photo inscribed in a square
  // canvas, with the four corners *outside* that circle baked in as solid
  // opaque white — not transparency, so no background-color behind it can
  // ever show through on its own. `circleMask` clips the <img> itself to
  // that same circle (matching the photo's own circle almost exactly),
  // which crops the white corners away entirely and lets the card's own
  // black background fill the ring around it instead.
  {
    url: 'https://cdn.discordapp.com/avatars/1094153271540715623/7d756890dfe90086d25b050b1466ba97.webp?size=256',
    caption: 'Teacher',
    circleMask: true,
  },
];
const PHOTO_INTERVAL_MS = 5000;

// A hover-reveal "contact card" — the square photo tile morphs into a small
// circular avatar pinned top-left while a tinted panel slides up from
// underneath to reveal name, role, real social links, and a mailto contact
// button. Adapted from a plain CSS/styled-components pen the user supplied;
// ported to this codebase's own conventions (styled-components isn't a
// dependency here) and re-wired to the site's real NAME (from the Profile
// window's shared.tsx) and this widget's own real rotating-photo carousel
// (not a single static image), plus a real GitHub/Instagram/Twitter/
// LinkedIn row (see PHOTO_SOCIAL_LINKS below) instead of the pen's
// placeholder "My Name"/lorem-ipsum text and its YouTube icon.
//
// The pen's own pink/coral palette didn't match this app's identity, so the
// card's base reuses the exact same metallic gradient the 3D Rubik's cube
// itself measures out to (the same three stops the logo/favicon recolor
// earlier this session sampled directly off the live cube via
// gl.readPixels() — highlight/mid/shadow), rather than a plain white/black
// or an unrelated flat tint. The reveal panel underneath it, though, flips
// white/dark with the app's own `isLight` theme (same as the Clock widget)
// rather than staying the cube's dark shadow tone regardless of theme.
//
// Driven by a plain `hovered` state (mouseenter/leave) rather than Tailwind's
// `group-hover:` variant — that CSS-only approach kept computing to the
// resting size even while `:hover` matched, confirmed live via devtools
// (the generated `@media (hover:hover) { &:is(:where(.group):hover *) }`
// selector matched the element but never won the cascade), so this sidesteps
// whatever that mismatch was rather than fighting it further.
const CUBE_HIGHLIGHT = '#c9c8ba';
const CUBE_MID = '#9f9e92';
const CUBE_SHADOW = '#423f3a';

// lucide-react's own github/instagram/twitter/linkedin outlines, inlined
// rather than pulled in as a dependency (this codebase doesn't have
// lucide-react installed) — matching the exact reference markup the user
// supplied, minus its YouTube entry per their own "do not use youtube".
function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
function TwitterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  );
}
function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

// This widget's own copy of the social row, not shared.tsx's SOCIAL_LINKS —
// the URLs the user gave for this row (LinkedIn/Instagram in particular)
// differ from the ones Profile's own footer already uses, so this stays
// scoped here rather than overwriting that shared, site-wide list.
const PHOTO_SOCIAL_LINKS = [
  { label: 'GitHub', href: 'https://github.com/krishanmurariji', Icon: GitHubIcon, brand: '#333333' },
  { label: 'Instagram', href: 'https://www.instagram.com/krishanmurariji/', Icon: InstagramIcon, brand: '#e4405f' },
  { label: 'Twitter', href: 'https://twitter.com/KrishanMuraari', Icon: TwitterIcon, brand: '#1da1f2' },
  { label: 'LinkedIn', href: 'https://linkedin.com/in/krishan-murari/', Icon: LinkedInIcon, brand: '#0077b5' },
];

// A small circular icon button whose brand color fills up from the bottom
// on hover (the reference design's own signature move), driven by React
// state rather than Tailwind's `group-hover:` — the same CSS-only variant
// that quietly never applied earlier in this exact widget (see PhotoCard's
// own comment above), so this reuses the workaround that's actually proven
// to work in this environment instead of risking the same silent no-op.
function SocialIconButton({
  href,
  label,
  Icon,
  brand,
  isLight,
}: {
  href: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  brand: string;
  isLight: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-shadow"
      style={{
        background: isLight ? '#ffffff' : 'rgba(255,255,255,0.08)',
        borderColor: isLight ? '#e5e5ea' : 'rgba(255,255,255,0.15)',
        boxShadow: hovered ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      <span
        className="absolute bottom-0 left-0 w-full transition-all duration-300"
        style={{ height: hovered ? '100%' : '0%', background: brand }}
      />
      <Icon
        className="relative z-10 h-3.5 w-3.5 transition-colors duration-300"
        style={{ color: hovered ? '#ffffff' : isLight ? '#3a3a3c' : 'rgba(255,255,255,0.75)' }}
      />
    </a>
  );
}

function PhotoCard({ isLight = true }: { isLight?: boolean }) {
  // Photos that have actually failed to load at runtime (vs. the
  // known-bad ones above, which were never added) get dropped from the
  // rotation instead of leaving a broken-image icon on screen.
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const livePhotos = PHOTOS.filter((p) => !failedUrls.includes(p.url));
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % Math.max(livePhotos.length, 1)), PHOTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [livePhotos.length]);

  if (livePhotos.length === 0) return null;
  const photo = livePhotos[index % livePhotos.length];

  const panelBg = isLight ? '#ffffff' : CUBE_SHADOW;
  const nameColor = isLight ? '#1c1c1e' : '#ffffff';
  // The card's own background is only really exposed where it meets the
  // reveal panel (mid-hover-transition, between the shrinking photo and the
  // expanding panel) — ending the gradient at the *panel's* own color
  // instead of always the cube's dark shadow tone means that seam actually
  // blends into the panel underneath it in both themes, instead of a dark
  // metallic gradient always butting up against a white panel in light mode.
  const cardGradient = `linear-gradient(165deg, ${CUBE_HIGHLIGHT} 0%, ${CUBE_MID} 55%, ${panelBg} 100%)`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative shrink-0 rounded-[32px] p-[3px] shadow-[0_20px_40px_rgba(0,0,0,0.35)] transition-all duration-500 ease-in-out',
        hovered && 'rounded-tl-[55px]'
      )}
      style={{ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, background: cardGradient }}
    >
      <a
        href={`mailto:${EMAIL}`}
        aria-label="Email"
        className="absolute right-8 top-6 z-10 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:transition-colors [&>svg]:hover:!stroke-white"
        style={{ color: CUBE_SHADOW }}
      >
        <MailGlyph style={{ stroke: CUBE_SHADOW }} />
      </a>

      {/* The rotating photo — a plain square tile normally, morphing into a
          small bordered circle pinned top-left once the card is hovered. */}
      <div
        className="absolute overflow-hidden transition-all duration-500 ease-in-out"
        style={
          hovered
            ? {
                zIndex: 3,
                left: 10,
                top: 10,
                width: 100,
                height: 100,
                borderRadius: '9999px',
                border: `4px solid ${CUBE_HIGHLIGHT}`,
                boxShadow: '0 5px 12px rgba(0,0,0,0.35)',
                transitionDelay: '100ms',
              }
            : { zIndex: 1, left: 3, top: 3, width: PHOTO_WIDTH - 6, height: PHOTO_HEIGHT - 6, borderRadius: 29 }
        }
      >
        <AnimatePresence>
          <motion.img
            key={photo.url}
            src={photo.url}
            alt={photo.caption}
            onError={() => setFailedUrls((prev) => (prev.includes(photo.url) ? prev : [...prev, photo.url]))}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 h-full w-full object-cover"
            style={photo.circleMask ? { clipPath: 'circle(50%)' } : undefined}
          />
        </AnimatePresence>
      </div>

      {/* The reveal panel — pinned to the bottom sliver normally, expanding
          up over most of the card on hover. Uses the cube's own shadow tone
          rather than an unrelated dark tint, so it reads as the darker end
          of the same gradient continuing rather than a different material. */}
      <div
        className="absolute inset-x-[3px] bottom-[3px] z-[2] overflow-hidden shadow-[inset_0_4px_10px_rgba(0,0,0,0.25)] transition-all duration-500 ease-[cubic-bezier(0.645,0.045,0.355,1)]"
        style={
          hovered
            ? { background: panelBg, top: '20%', borderRadius: '80px 29px 29px 29px', transitionDelay: '200ms' }
            : { background: panelBg, top: '80%', borderRadius: 29 }
        }
      >
        {/* top-16 (not the smaller top-5 this started at) — the panel's
            top edge sits at 20% of the card when hovered, and the avatar
            circle (top:10, 100px tall) already reaches down to ~110px from
            the *card's* top, which is well past that 20% line; anything
            closer than this to the panel's own top still lands underneath
            the avatar (higher z-index) and gets visually clipped by it. */}
        <div className="absolute inset-x-6 top-16">
          <span className="block text-lg font-bold" style={{ color: nameColor }}>
            {NAME}
          </span>
          <p className={cn('mt-1.5 text-[11px] leading-snug', isLight ? 'text-black/55' : 'text-white/60')}>{BIO}</p>
        </div>
        <div className="absolute inset-x-6 bottom-4 flex items-center justify-between">
          <div className="flex gap-2">
            {PHOTO_SOCIAL_LINKS.map(({ label, href, Icon, brand }) => (
              <SocialIconButton key={label} label={label} href={href} Icon={Icon} brand={brand} isLight={isLight} />
            ))}
          </div>
          <a
            href={`mailto:${EMAIL}`}
            className={cn(
              'rounded-full px-2.5 py-1.5 text-[0.65rem] font-medium transition-colors',
              isLight
                ? 'bg-black/10 text-black hover:bg-black hover:!text-white'
                : 'bg-white/15 text-white hover:bg-white hover:!text-[#423f3a]'
            )}
          >
            Contact Me
          </a>
        </div>
      </div>
    </div>
  );
}

// Small red "✕" badge overlaid on a widget's corner, matching the real
// macOS/iOS jiggle-mode remove control. Only rendered (and only clickable)
// while edit mode is active. The widget's own content stays interactive at
// all times, though — pointer-events was previously toggled off outside
// edit mode, which quietly broke real mouse interaction with anything
// clickable inside a widget (the Music player's hover-to-expand card,
// its play/pause button) even though programmatic `.click()` calls during
// testing masked it, since those bypass pointer-events hit-testing entirely.
//
// `drag` (only wired up for Clock/Calendar, the one pair sharing a slot
// shape) makes the widget a native HTML5 drag source/target — dropping one
// onto the other swaps which one sits in which slot. Native drag-and-drop
// rather than a pointer-tracking implementation because a straight swap
// between two fixed, known-size slots doesn't need free-form positioning
// math, just "which of the two did this land on."
//
// The double-click guard stops a double-click anywhere on a widget from
// bubbling up to the menu bar's "double-click empty space to exit edit
// mode" listener — otherwise trying to interact with a widget twice in a
// row would boot you out of edit mode.
function EditableWidget({
  editMode,
  onRemove,
  drag,
  children,
}: {
  editMode: boolean;
  onRemove: () => void;
  drag?: { id: string; onDropOther: (draggedId: string) => void };
  children: ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className="relative"
      style={{ pointerEvents: 'auto', opacity: dragOver ? 0.55 : 1, transition: 'opacity 0.15s' }}
      draggable={editMode && !!drag}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={(e) => { if (drag) e.dataTransfer.setData('text/plain', drag.id); }}
      onDragOver={(e) => { if (drag) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!drag) return;
        e.preventDefault();
        setDragOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== drag.id) drag.onDropOther(draggedId);
      }}
    >
      {children}
      {editMode && (
        <button
          type="button"
          aria-label="Remove widget"
          onClick={onRemove}
          className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform"
          style={{ background: '#3a3a3c' }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function DesktopWidgets({
  isLoading,
  editMode,
  visibleWidgets,
  onRemoveWidget,
  music,
  sceneCanvasRef,
  isLight,
}: {
  isLoading?: boolean;
  editMode: boolean;
  visibleWidgets: WidgetId[];
  onRemoveWidget: (id: WidgetId) => void;
  music: MusicPlaybackProps;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  isLight?: boolean;
}) {
  const has = (id: WidgetId) => visibleWidgets.includes(id);
  const stackRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const viewportWidth = useViewportWidth();

  const hasStack = has('clock') || has('calendar') || has('weather') || has('music');

  // Calendar/Weather/Clock/Music now sit fixed in a single 2x2 "Today View"
  // stack (matching Apple's own widget gallery) instead of each claiming its
  // own screen corner. Each cell gets its own GlassCell (own GlassBackdrop +
  // refraction + tint + shine — see that component's own comment for why
  // this isn't one shared backdrop behind the whole stack); this outer div
  // is just the grid layout, no chrome of its own.
  const stack = hasStack && (
    <div ref={stackRef} className="grid" style={{ width: STACK_SIZE, height: STACK_SIZE, gridTemplateColumns: '1fr 1fr', gap: GAP }}>
        {has('calendar') && (
          <EditableWidget editMode={editMode} onRemove={() => onRemoveWidget('calendar')}>
            <GlassCell width={SQUARE} height={SQUARE} sceneCanvasRef={sceneCanvasRef}>
              <CalendarCard />
            </GlassCell>
          </EditableWidget>
        )}
        {has('weather') && (
          <EditableWidget editMode={editMode} onRemove={() => onRemoveWidget('weather')}>
            <GlassCell width={SQUARE} height={SQUARE} sceneCanvasRef={sceneCanvasRef}>
              <WeatherCard />
            </GlassCell>
          </EditableWidget>
        )}
        {has('clock') && (
          <EditableWidget editMode={editMode} onRemove={() => onRemoveWidget('clock')}>
            <GlassCell width={SQUARE} height={SQUARE} sceneCanvasRef={sceneCanvasRef}>
              <AnalogClock isLight={isLight} />
            </GlassCell>
          </EditableWidget>
        )}
        {has('music') && (
          <EditableWidget editMode={editMode} onRemove={() => onRemoveWidget('music')}>
            <GlassCell width={SQUARE} height={SQUARE} sceneCanvasRef={sceneCanvasRef}>
              <MusicPlayerCard {...music} />
            </GlassCell>
          </EditableWidget>
        )}
    </div>
  );

  const photoGroup = has('photo') && (
    <EditableWidget editMode={editMode} onRemove={() => onRemoveWidget('photo')}>
      <PhotoCard isLight={isLight} />
    </EditableWidget>
  );

  const entrance = {
    initial: { opacity: 0 },
    animate: { opacity: !isLoading ? 1 : 0 },
    transition: { duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  };

  // Two screen-anchored corners: the 2x2 stack top-left, Photo top-right at
  // the same size — same on mobile, just shrunk via a plain transform
  // instead of resizing individually. That side-by-side layout only
  // actually fits down to a certain width, though (both groups are the same
  // STACK_SIZE-wide square) — below it, stack the two groups vertically
  // instead of letting their `left-4`/`right-4` corners overlap each other,
  // using whatever scale actually fits this viewport's width rather than
  // the fixed MOBILE_SCALE (which was tuned for the side-by-side case).
  if (isMobile) {
    const edgeMargin = 16;
    const midGap = 12;
    const sideBySideMinWidth = STACK_SIZE * MOBILE_SCALE * 2 + edgeMargin * 2 + midGap;
    const stackVertically = viewportWidth < sideBySideMinWidth;
    const mobileScale = stackVertically
      ? Math.min(MOBILE_SCALE, Math.max(0.45, (viewportWidth - edgeMargin * 2) / STACK_SIZE))
      : MOBILE_SCALE;

    return (
      <>
        {/* See the comment on the non-mobile return below — same reasoning,
            duplicated here since this is a separate early return, not a
            shared code path. */}
        <GlassDistortionFilter />
        {stack && (
          <motion.div
            {...entrance}
            className="fixed left-4 z-30"
            style={{ top: 48, pointerEvents: 'none', transform: `scale(${mobileScale})`, transformOrigin: 'top left' }}
          >
            {stack}
          </motion.div>
        )}
        {photoGroup && (
          <motion.div
            {...entrance}
            className={cn('fixed z-30', stackVertically ? 'left-4' : 'right-4')}
            style={{
              top: stackVertically ? 48 + STACK_SIZE * mobileScale + midGap : 48,
              pointerEvents: 'none',
              transform: `scale(${mobileScale})`,
              transformOrigin: stackVertically ? 'top left' : 'top right',
            }}
          >
            {photoGroup}
          </motion.div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Unconditional (not inside the `stack &&` branch below) since
          MusicPlayerCard also renders from the Settings gallery's live
          preview (WIDGET_PREVIEWS.music, in MenuBar.tsx) even while the
          Music widget itself is hidden from the desktop — that preview
          needs this same filter available regardless of visibleWidgets. */}
      <GlassDistortionFilter />
      {stack && (
        <motion.div {...entrance} className="fixed top-12 left-4 z-30" style={{ pointerEvents: 'none' }}>
          {stack}
        </motion.div>
      )}
      {photoGroup && (
        <motion.div {...entrance} className="fixed top-12 right-4 z-30" style={{ pointerEvents: 'none' }}>
          {photoGroup}
        </motion.div>
      )}
    </>
  );
}
