// Content for the dock's "Spotify" window (see APP_BODIES in
// AppWindow.tsx) — search YouTube (via searchYouTube(), a direct
// client-side call to YouTube Data API v3 — needs an API key, see
// .env.example) and play results through the official YouTube IFrame
// Player (see src/lib/youtube-player.tsx). Styled to read as a genuine
// Spotify clone: near-black chrome, the real soundwave logomark, a splash
// screen on open, card-hover play buttons, and a vertical results list
// rather than the earlier glass-window look, so it reads as "Spotify" at a
// glance rather than "another glass panel." That player is a single
// app-wide instance (mounted once in App.tsx), so play/pause/skip here
// stays in lockstep with the dock icon's own hover popup (MacDock.tsx) —
// same track, same transport, two views of the same state rather than two
// independent players.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useYouTubePlayer, searchYouTube, type YouTubeTrack } from '../../lib/youtube-player';
import { loadJSON, saveJSON } from '../../lib/storage';
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
const BG = '#0a0a0a';
const CARD_BG = '#181818';
const CARD_HOVER = '#282828';

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
function HeartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
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
function SpotifySplash() {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: BG }}
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// A recently-played card, styled after Spotify's own home-grid tiles: flat
// dark card, square artwork, and a green circular play button that only
// appears (raised, faded in) on hover — rather than always-visible chrome.
function RecentCard({
  track,
  isCurrent,
  onSelect,
}: {
  track: YouTubeTrack;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex flex-col gap-3 rounded-md p-3 text-left transition-colors"
      style={{ background: CARD_BG }}
      onMouseEnter={(e) => (e.currentTarget.style.background = CARD_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.background = CARD_BG)}
    >
      <div className="relative overflow-hidden rounded shadow-lg" style={{ aspectRatio: '1 / 1' }}>
        <img src={track.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        <div
          className="absolute bottom-1.5 right-1.5 flex h-10 w-10 translate-y-1.5 items-center justify-center rounded-full opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
          style={{ background: ACCENT }}
        >
          <PlayIcon className="ml-0.5 h-4 w-4 text-black" />
        </div>
        {isCurrent && (
          <div className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: ACCENT }} />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{track.title}</div>
        <div className="truncate text-xs text-white/60">{track.channelTitle}</div>
      </div>
    </button>
  );
}

// Search results as a plain vertical row list — Spotify's actual "Songs"
// results layout — rather than the earlier horizontal coverflow carousel;
// closer to the real app's interface, and results here have no fixed count
// worth spending screen space animating between.
function ResultsList({
  tracks,
  currentId,
  playing,
  onSelect,
}: {
  tracks: YouTubeTrack[];
  currentId?: string;
  playing: boolean;
  onSelect: (track: YouTubeTrack, index: number) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 pb-4 pt-1" data-lenis-prevent>
      {tracks.map((track, i) => {
        const isCurrent = track.id === currentId;
        return (
          <button
            key={track.id}
            type="button"
            onClick={() => onSelect(track, i)}
            className="group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
              <img src={track.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
              {isCurrent && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  {playing ? (
                    <span className="flex items-end gap-0.5 h-3">
                      <span className="w-[3px] animate-[eq_0.7s_ease-in-out_infinite] rounded-sm" style={{ background: ACCENT, height: '60%' }} />
                      <span className="w-[3px] animate-[eq_0.9s_ease-in-out_infinite] rounded-sm" style={{ background: ACCENT, height: '100%' }} />
                      <span className="w-[3px] animate-[eq_0.5s_ease-in-out_infinite] rounded-sm" style={{ background: ACCENT, height: '40%' }} />
                    </span>
                  ) : (
                    <PlayIcon className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" style={{ color: isCurrent ? ACCENT : '#fff' }}>
                {track.title}
              </div>
              <div className="truncate text-xs text-white/50">{track.channelTitle}</div>
            </div>
            <PlayIcon className="h-3.5 w-3.5 shrink-0 text-white/0 transition-colors group-hover:text-white/70" />
          </button>
        );
      })}
    </div>
  );
}

export default function SpotifyApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [muted, setMuted] = useState(false);
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
      player.setMuted(!prev);
      return !prev;
    });
  };

  const progress = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden text-white" style={{ background: BG }}>
      <style>{'@keyframes eq { 0%, 100% { height: 30%; } 50% { height: 100%; } }'}</style>

      <AnimatePresence>{showSplash && <SpotifySplash />}</AnimatePresence>

      {/* Header — a top scroll-free bar with the search pill, styled after
          Spotify's own light search field (the one high-contrast element
          against all the near-black chrome around it) rather than the
          previous small centered glass pill. */}
      <div className="relative z-10 flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
        <SoundwaveGlyph className="h-6 w-6 shrink-0" style={{ color: ACCENT }} />
        <form onSubmit={handleSearch} className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to play?"
            className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm text-black outline-none placeholder:text-black/50"
          />
        </form>
      </div>

      {/* Body — recently-played grid on the home state, a vertical results
          list once a search has run. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {status === 'searching' && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/60">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white/70" aria-hidden />
            Searching&hellip;
          </div>
        )}
        {status === 'error' && <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{error}</div>}
        {status === 'idle' && results.length === 0 && (
          recentTracks.length > 0 ? (
            <div className="flex h-full flex-col gap-3 overflow-y-auto px-5 pb-4 pt-1" data-lenis-prevent>
              <div className="text-lg font-bold text-white">Recently played</div>
              <div className="grid grid-cols-3 gap-3">
                {recentTracks.map((track, index) => (
                  <RecentCard
                    key={track.id}
                    track={track}
                    isCurrent={track.id === player.current?.id}
                    onSelect={() => playTrack(track, recentTracks, index)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/50">Search for a song to get started.</div>
          )
        )}
        {results.length > 0 && (
          <ResultsList
            tracks={results}
            currentId={player.current?.id}
            playing={player.playing}
            onSelect={(track, index) => playTrack(track, results, index)}
          />
        )}
      </div>

      {/* Now-playing bar — Spotify's real 3-column layout: track info on
          the left, transport + progress centered, mute on the right (no
          numeric volume level to show — the player only exposes a mute
          toggle). Central play/pause is a white filled circle with a black
          glyph, matching Spotify's own transport button, distinct from the
          green play buttons used on cards. */}
      {player.current && (
        <div className="relative z-10 grid shrink-0 grid-cols-3 items-center gap-3 border-t border-white/10 px-4 py-3" style={{ background: '#0a0a0a' }}>
          <div className="flex min-w-0 items-center gap-3">
            <img src={player.current.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{player.current.title}</div>
              <div className="truncate text-xs text-white/50">{player.current.channelTitle}</div>
            </div>
            <HeartIcon className="ml-1 hidden h-4 w-4 shrink-0 text-white/50 transition hover:text-white sm:block" />
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Previous" onClick={player.skipPrev} className="text-white/70 transition hover:text-white">
                <PrevIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={player.playing ? 'Pause' : 'Play'}
                onClick={player.togglePlay}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
              >
                {player.loading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                ) : player.playing ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="ml-0.5 h-4 w-4" />
                )}
              </button>
              <button type="button" aria-label="Next" onClick={player.skipNext} className="text-white/70 transition hover:text-white">
                <NextIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex w-full max-w-xs items-center gap-2">
              <span className="w-8 text-right text-[10px] tabular-nums text-white/40">{formatTime(player.currentTime)}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Number.isFinite(progress) ? progress : 0}
                onChange={(e) => {
                  if (player.duration > 0) player.seek((Number(e.target.value) / 100) * player.duration);
                }}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                style={{ background: `linear-gradient(to right, ${ACCENT} ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }}
              />
              <span className="w-8 text-[10px] tabular-nums text-white/40">{formatTime(player.duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="text-white/70 transition hover:text-white">
              {muted ? <MuteIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
