// Content for the dock's "Spotify" window (see APP_BODIES in
// AppWindow.tsx) — search YouTube (via searchYouTube(), a direct
// client-side call to YouTube Data API v3 — needs an API key, see
// .env.example) and play results through the official YouTube IFrame
// Player (see src/lib/youtube-player.tsx). Styled to read as a genuine
// Spotify clone: light chrome (Spotify's own light-mode palette, per
// request — was near-black), the real soundwave logomark, a splash screen
// on open, and both the "Recently played" row and search results browsed
// through a grid of hoverable track cards (no slider/carousel navigation —
// deliberately dropped in favor of a plain scrollable grid). That player is
// a single app-wide instance (mounted once in App.tsx), so play/pause/skip
// here stays in lockstep with the dock icon's own hover popup
// (MacDock.tsx) — same track, same transport, two views of the same state
// rather than two independent players.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useYouTubePlayer, searchYouTube, type YouTubeTrack } from '../../lib/youtube-player';
import { loadJSON, saveJSON, loadBool, saveBool } from '../../lib/storage';
import spotifyLoadingAnimation from '../../assets/spotify-loading.svg';

const MAX_RECENT_TRACKS = 8;
// The supplied animation doesn't reach its full-size green circle until
// ~1.7s in (it spends the first ~1.5s as a tiny 8%-scale dot while its
// scribble intro plays out) and finishes drawing the outline around 2.7s —
// cutting the splash off earlier would dismiss it mid-dot, before it ever
// reads as the Spotify logo.
const SPLASH_MS = 3000;

function isTrackArray(value: unknown): value is YouTubeTrack[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v && typeof v === 'object' &&
        typeof (v as YouTubeTrack).id === 'string' &&
        typeof (v as YouTubeTrack).title === 'string' &&
        typeof (v as YouTubeTrack).thumbnail === 'string'
    )
  );
}

// Real Spotify green — this app already used '#1ED760' (Spotify's brighter
// on-dark accent) before the redesign; kept as-is rather than swapped for
// the '#1DB954' brand green since it's the one Spotify itself uses on dark
// UI chrome (buttons, the now-playing bar), which is exactly this context.
const ACCENT = '#1ED760';
// Follows the site's global theme — Spotify's own light-mode palette (white
// window, light-gray cards) when the site is light, its classic near-black
// palette when the site is dark, rather than a palette fixed to one or the
// other.
function paletteFor(isLight: boolean) {
  return isLight
    ? { bg: '#ffffff', cardBg: '#f0f0f0', text: '#000000' }
    : { bg: '#0a0a0a', cardBg: '#181818', text: '#ffffff' };
}

// Spotify's actual soundwave-arc logomark path (also used by the dock's own
// SpotifyIcon in MacIcons.tsx) — reused here for the splash screen rather
// than duplicated as a differently-drawn glyph, and as a placeholder for
// the window's real brand logo until one is supplied.
function SoundwaveGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.181-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.72-.66 13.439 1.62.361.181.54.78.301 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
function PauseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="5" y="3" width="5" height="18" rx="1" />
      <rect x="14" y="3" width="5" height="18" rx="1" />
    </svg>
  );
}
function PrevIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="19 20 9 12 19 4 19 20" />
      <rect x="5" y="4" width="2" height="16" />
    </svg>
  );
}
function NextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="5 4 15 12 5 20 5 4" />
      <rect x="17" y="4" width="2" height="16" />
    </svg>
  );
}
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function MuteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" fill="currentColor" stroke="none" />
      <line x1="16.5" y1="9" x2="21" y2="14" />
      <line x1="21" y1="9" x2="16.5" y2="14" />
    </svg>
  );
}
function VolumeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" fill="currentColor" stroke="none" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}
function SignInGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  );
}
// Shown in the mini-player's corner when nothing has ever been played this
// session — a music note with a line through it, distinct enough from the
// real play/pause glyphs that it reads as "empty" rather than "muted."
function NoTrackIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9 18V6l10-2v11" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="15" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

// The splash screen shown for a beat every time the window opens, before
// the home section appears — matching the real Spotify app's own boot
// animation: a green circle drawing itself in from a scribble. The SVG
// (src/assets/spotify-loading.svg) is the actual asset the user supplied —
// it's self-animating (SMIL <animate>/<animateTransform>, runs on its own
// once mounted, no JS driving it) and loops every 5s; that's fine here
// since it's only ever on screen for SPLASH_MS before this wrapper fades
// it out.
function SpotifySplash({ bg }: { bg: string }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: bg }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <motion.img
        src={spotifyLoadingAnimation}
        alt=""
        className="h-28 w-28"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}

// One "medium size rounded card" for the track grid below — thumbnail,
// title, channel — with the same rotating accent-color border glow as the
// mini-player's hovered state (see MiniPlayer further down), so hovering
// any track reads as "something is alive here" instead of a slider's
// prev/next/dot navigation. Clicking anywhere on the card plays it.
function TrackCard({
  track,
  active,
  playing,
  isLight,
  cardBg,
  onActivate,
}: {
  track: YouTubeTrack;
  active: boolean;
  playing: boolean;
  isLight: boolean;
  cardBg: string;
  onActivate: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && (
        <motion.div
          className="pointer-events-none absolute -inset-[2px] rounded-2xl"
          style={{ background: `conic-gradient(${ACCENT}, transparent 35%, transparent 65%, ${ACCENT})` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <button
        type="button"
        onClick={onActivate}
        className="relative flex w-full flex-col gap-2 rounded-2xl p-2 text-left transition hover:scale-[1.02]"
        style={{ background: cardBg }}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-xl">
          <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
          {active && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <EqualizerBars playing={playing} color="#fff" />
            </div>
          )}
        </div>
        <div className="min-w-0 px-0.5 pb-0.5">
          <div className={`truncate text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>{track.title}</div>
          <div className={`truncate text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>{track.channelTitle}</div>
        </div>
      </button>
    </div>
  );
}

// Both "Recently played" and search results browse through this same
// scrollable grid — replaces the old 3D perspective carousel's prev/next
// arrows and dot navigation outright, per request, rather than relocating
// that slider control elsewhere. Column count is driven by @container
// queries against the window's own rendered width (its nearest ancestor
// with @container — the body wrapper below — not the browser viewport),
// same pattern as ProjectsApp/BentoProfile: the window can be anywhere
// from its default ~760px to a fullscreen 100vw, and viewport breakpoints
// alone can't tell those apart. More columns at a wider width keeps each
// card roughly the same size instead of stretching 2-3 cards across a
// fullscreen window. data-lenis-prevent opts this panel out of the site's
// single global Lenis scroll instance (see index.css's [data-lenis-prevent]
// rule) so the mouse wheel scrolls this grid instead of being captured for
// page-level scrolling — every other app window's own scroll area does the
// same (ChatAssistant, ProjectsApp, TerminalWindow, etc.); this one was
// just missed when the grid replaced the carousel. no-scrollbar matches
// those same panels' hidden-track look; scrolling is still available via
// wheel/trackpad (now that data-lenis-prevent lets it reach this element)
// even with no visible track to drag.
function TrackGrid({
  tracks,
  currentId,
  playing,
  isLight,
  cardBg,
  onActivate,
}: {
  tracks: YouTubeTrack[];
  currentId?: string;
  playing: boolean;
  isLight: boolean;
  cardBg: string;
  onActivate: (track: YouTubeTrack, index: number) => void;
}) {
  return (
    <div
      data-lenis-prevent
      className="no-scrollbar grid h-full grid-cols-2 content-start gap-4 overflow-y-auto pb-1 pr-1 @[500px]:grid-cols-3 @[800px]:grid-cols-4 @[1100px]:grid-cols-5 @[1400px]:grid-cols-6 @[1700px]:grid-cols-7"
    >
      {tracks.map((track, index) => (
        <TrackCard
          key={track.id}
          track={track}
          active={track.id === currentId}
          playing={playing}
          isLight={isLight}
          cardBg={cardBg}
          onActivate={() => onActivate(track, index)}
        />
      ))}
    </div>
  );
}

// A purely local "account" — no backend, no real auth, just a name typed in
// once and remembered on this device (the same loadJSON/saveJSON
// localStorage pattern already used for recentTracks above), so signing in
// has something genuine to unlock: the muted preference persists across
// reopens once signed in, where previously (and still, for an anonymous
// visitor) it always reset to unmuted.
interface SpotifyUser {
  name: string;
}
function isSpotifyUserOrNull(value: unknown): value is SpotifyUser | null {
  return value === null || (!!value && typeof value === 'object' && typeof (value as SpotifyUser).name === 'string');
}

// The small collapsed mini-player's "now playing" tell — three bars dancing
// while playing, settled flat while paused — standing in for the numeric
// progress/scrub slider the redesign explicitly dropped: enough to read as
// "something is happening" without reintroducing a control surface.
function EqualizerBars({ playing, color }: { playing: boolean; color: string }) {
  return (
    <div className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-full"
          style={{ background: color }}
          animate={playing ? { scaleY: [0.3, 1, 0.45, 0.85, 0.3] } : { scaleY: 0.3 }}
          transition={playing ? { duration: 0.9 + i * 0.15, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}

// Top-right sign-in control: an account glyph that becomes an initial-letter
// avatar once signed in. Hover shows the explanatory tooltip; a click opens
// the actual sign-in form (or the signed-in summary/sign-out), and the two
// never show at once — the tooltip is suppressed while the popover is open.
function SignInControl({
  isLight,
  user,
  onSignIn,
  onSignOut,
}: {
  isLight: boolean;
  user: SpotifyUser | null;
  onSignIn: (name: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleSignIn = (e: FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    onSignIn(name);
    setNameInput('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="group/signin relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={user ? `Signed in as ${user.name}` : 'Sign in'}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition hover:scale-105 ${
          user ? 'text-white' : isLight ? 'bg-black/5 text-black/55' : 'bg-white/10 text-white/55'
        }`}
        style={user ? { background: ACCENT } : undefined}
      >
        {user ? user.name.trim().charAt(0).toUpperCase() : <SignInGlyph className="h-4 w-4" />}
      </button>

      {/* Tooltip — professional phrasing of "sign up to save your settings,
          preferences and songs played." Hidden while the popover is open so
          the two never overlap. */}
      {!open && (
        <div
          className={`pointer-events-none absolute right-0 top-full z-20 mt-2 w-max max-w-[190px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug opacity-0 shadow-lg transition-opacity duration-150 group-hover/signin:opacity-100 ${
            isLight ? 'bg-black text-white' : 'bg-white text-black'
          }`}
        >
          {user ? `Signed in as ${user.name}` : 'Sign in to save your preferences and listening history on this device'}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute right-0 top-full z-20 mt-2 w-60 rounded-xl p-3 shadow-xl ${
              isLight ? 'bg-white ring-1 ring-black/10' : 'bg-[#181818] ring-1 ring-white/10'
            }`}
          >
            {user ? (
              <div className="flex flex-col gap-2">
                <div className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>Signed in as {user.name}</div>
                <div className={`text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>Your preferences and listening history are saved on this device.</div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`mt-1 rounded-full py-1.5 text-xs font-semibold transition ${
                    isLight ? 'bg-black/5 text-black hover:bg-black/10' : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignIn} className="flex flex-col gap-2">
                <div className={`text-xs ${isLight ? 'text-black/60' : 'text-white/60'}`}>Sign in to save your preferences and listening history on this device.</div>
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your name"
                  className={`rounded-full px-3 py-1.5 text-sm outline-none ${
                    isLight ? 'bg-black/5 text-black placeholder:text-black/40' : 'bg-white/10 text-white placeholder:text-white/40'
                  }`}
                />
                <button type="submit" className="rounded-full py-1.5 text-xs font-semibold text-black transition hover:brightness-95" style={{ background: ACCENT }}>
                  Sign in
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Replaces the old full-width now-playing bar: a small floating widget
// pinned to the body's bottom-right corner instead of a bar that claims a
// whole row across the window. Collapsed by default — just the thumbnail,
// the equalizer tell, and a centered play/pause — and expands into a
// medium rounded card on hover with the full track details and transport,
// a rotating accent-color ring glowing around it only while hovered. No
// progress/seek slider in either state, per the redesign dropping it
// outright rather than relocating it.
function MiniPlayer({
  player,
  isLight,
  textClass,
  muted,
  onToggleMute,
}: {
  player: ReturnType<typeof useYouTubePlayer>;
  isLight: boolean;
  textClass: string;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const track = player.current;
  const cardBg = isLight ? 'rgba(255,255,255,0.97)' : 'rgba(24,24,24,0.97)';
  const iconMuted = isLight ? 'text-black/70 hover:text-black' : 'text-white/70 hover:text-white';

  if (!track) {
    return (
      <div
        className={`absolute bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full ${
          isLight ? 'bg-black/5 text-black/30' : 'bg-white/10 text-white/30'
        }`}
        title="Nothing played yet"
      >
        <NoTrackIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-20" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* The running-border glow — a separate, slightly larger sibling layer
          behind the card rather than a parent wrapper, so rotating it
          doesn't also spin the card's own text/thumbnail. Only mounted
          while hovered; framer-motion's own exit (no AnimatePresence here —
          it just unmounts) is fine since it has no exit animation to lose. */}
      {hovered && (
        <motion.div
          className="pointer-events-none absolute -inset-[3px] rounded-[20px]"
          style={{ background: `conic-gradient(${ACCENT}, transparent 35%, transparent 65%, ${ACCENT})` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
      )}

      <motion.div
        className="relative overflow-hidden"
        animate={{ width: hovered ? 272 : 124, borderRadius: hovered ? 20 : 999 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        style={{ background: cardBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      >
        {!hovered ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <img src={track.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            <EqualizerBars playing={player.playing} color={ACCENT} />
            <button
              type="button"
              aria-label={player.playing ? 'Pause' : 'Play'}
              onClick={player.togglePlay}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:scale-105 ${
                isLight ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              {player.loading ? (
                <span className={`h-3 w-3 animate-spin rounded-full border-2 ${isLight ? 'border-white/30 border-t-white' : 'border-black/30 border-t-black'}`} />
              ) : player.playing ? (
                <PauseIcon className="h-3.5 w-3.5" />
              ) : (
                <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={track.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0">
                <div className={`truncate text-sm font-medium ${textClass}`}>{track.title}</div>
                <div className={`truncate text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>{track.channelTitle}</div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-5">
              <button type="button" aria-label="Previous" onClick={player.skipPrev} className={`transition ${iconMuted}`}>
                <PrevIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={player.playing ? 'Pause' : 'Play'}
                onClick={player.togglePlay}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-105 ${
                  isLight ? 'bg-black text-white' : 'bg-white text-black'
                }`}
              >
                {player.loading ? (
                  <span className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${isLight ? 'border-white/30 border-t-white' : 'border-black/30 border-t-black'}`} />
                ) : player.playing ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="ml-0.5 h-4 w-4" />
                )}
              </button>
              <button type="button" aria-label="Next" onClick={player.skipNext} className={`transition ${iconMuted}`}>
                <NextIcon className="h-4 w-4" />
              </button>
              <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute} className={`transition ${iconMuted}`}>
                {muted ? <MuteIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function SpotifyApp({ isLight = true }: { isLight?: boolean }) {
  const { bg: BG, cardBg: CARD_BG } = paletteFor(isLight);
  const containerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  // The local "account" (see SignInControl's own comment) and the one
  // preference it actually unlocks: muted stays persisted across reopens
  // only once signed in — an anonymous visitor's mute still resets each
  // time, same as before this redesign.
  const [user, setUser] = useState<SpotifyUser | null>(() => loadJSON('spotifyUser', null, isSpotifyUserOrNull));
  const [muted, setMuted] = useState(() => (user ? loadBool('spotifyMuted', false) : false));
  // What the "home" (idle, no active search) section shows — the actual
  // tracks a visitor has played, thumbnail and all, not the raw text they
  // once searched for (which had no artwork of its own to show, and no
  // stable mapping to any one track anyway — the same query can turn up
  // different results on different searches).
  const [recentTracks, setRecentTracks] = useState<YouTubeTrack[]>(() => loadJSON('spotifyRecentTracks', [], isTrackArray));

  // Splash plays once per window open (fresh mount), not once per app
  // lifetime — matching "every time it opens" rather than "the first time."
  useEffect(() => {
    const id = window.setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Applies a signed-in visitor's restored mute preference to the real
  // player once on mount — the useState initializer above only set the
  // local display value, not the player itself (which otherwise starts
  // unmuted regardless of what was loaded).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (muted) player.setMuted(true);
  }, []);

  const signIn = (name: string) => {
    const next: SpotifyUser = { name };
    setUser(next);
    saveJSON('spotifyUser', next);
  };

  const signOut = () => {
    setUser(null);
    saveJSON('spotifyUser', null);
  };

  const rememberTrack = (track: YouTubeTrack) => {
    setRecentTracks((prev) => {
      const next = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT_TRACKS);
      saveJSON('spotifyRecentTracks', next);
      return next;
    });
  };

  const runSearch = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    setStatus('searching');
    setError(null);
    try {
      const tracks = await searchYouTube(q);
      setResults(tracks);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const playTrack = useCallback(
    (track: YouTubeTrack, queue: YouTubeTrack[], index: number) => {
      player.playTrack(track, queue, index);
      rememberTrack(track);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player]
  );

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      player.setMuted(next);
      if (user) saveBool('spotifyMuted', next);
      return next;
    });
  };

  const textClass = isLight ? 'text-black' : 'text-white';

  return (
    <div ref={containerRef} className={`relative flex h-full w-full flex-col overflow-hidden ${textClass}`} style={{ background: BG }}>
      <AnimatePresence>{showSplash && <SpotifySplash bg={BG} />}</AnimatePresence>

      {/* Header — logo left, search centered and flexible (grows/shrinks
          with the window rather than a fixed width), sign-in control right.
          No background animation behind any of this anymore — the redesign
          dropped the old Hyperspeed highway entirely, so the window is just
          its flat light/dark palette now. */}
      <div className="relative z-20 flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
        <SoundwaveGlyph className="h-6 w-6 shrink-0" style={{ color: ACCENT }} />
        <form onSubmit={handleSearch} className="relative mx-auto w-full max-w-md flex-1">
          <SearchIcon className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isLight ? 'text-black/60' : 'text-white/60'}`} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to play?"
            className={`w-full rounded-full py-2.5 pl-10 pr-4 text-sm outline-none ${textClass} ${isLight ? 'placeholder:text-black/50' : 'placeholder:text-white/50'}`}
            style={{ background: CARD_BG }}
          />
        </form>
        <SignInControl isLight={isLight} user={user} onSignIn={signIn} onSignOut={signOut} />
      </div>

      {/* Body — recently-played and search results both browse through the
          same scrollable grid of hoverable track cards (TrackGrid above) —
          no slider/carousel navigation. */}
      <div className="@container relative z-10 flex min-h-0 flex-1 flex-col">
        {status === 'searching' && (
          <div className={`flex h-full items-center justify-center gap-2 text-sm ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            <span className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${isLight ? 'border-black/25 border-t-black/70' : 'border-white/25 border-t-white/70'}`} aria-hidden />
            Searching&hellip;
          </div>
        )}
        {status === 'error' && <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{error}</div>}
        {status === 'idle' && results.length === 0 && (
          recentTracks.length > 0 ? (
            <div className="flex h-full min-h-0 flex-1 flex-col gap-3 px-5 pb-4 pt-1">
              <div className={`text-lg font-bold ${textClass}`}>Recently played</div>
              <div className="relative min-h-0 flex-1">
                <TrackGrid
                  tracks={recentTracks}
                  currentId={player.current?.id}
                  playing={player.playing}
                  onActivate={(track, index) => playTrack(track, recentTracks, index)}
                  isLight={isLight}
                  cardBg={CARD_BG}
                />
              </div>
            </div>
          ) : (
            <div className={`flex h-full items-center justify-center px-6 text-center text-sm ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              Search for a song to get started.
            </div>
          )
        )}
        {results.length > 0 && (
          <div className="relative min-h-0 flex-1 px-5 pb-4 pt-1">
            <TrackGrid
              tracks={results}
              currentId={player.current?.id}
              playing={player.playing}
              onActivate={(track, index) => playTrack(track, results, index)}
              isLight={isLight}
              cardBg={CARD_BG}
            />
          </div>
        )}
      </div>

      {/* Floating mini-player, bottom-right of the body rather than a bar
          spanning the window — see MiniPlayer's own comment for its
          collapsed/expanded/empty states. */}
      <MiniPlayer player={player} isLight={isLight} textClass={textClass} muted={muted} onToggleMute={toggleMute} />
    </div>
  );
}
