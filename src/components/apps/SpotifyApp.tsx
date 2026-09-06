// Content for the dock's "Spotify" window (see APP_BODIES in
// AppWindow.tsx) — search YouTube (via searchYouTube(), a direct
// client-side call to YouTube Data API v3 — needs an API key, see
// .env.example) and play results through the official YouTube IFrame
// Player (see src/lib/youtube-player.tsx), styled to read as a Spotify
// clone. That player is a single app-wide instance (mounted once in
// App.tsx), so play/pause/skip here stays in lockstep with the dock icon's
// own hover popup (MacDock.tsx) — same track, same transport, two views of
// the same state rather than two independent players.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useYouTubePlayer, searchYouTube, type YouTubeTrack } from '../../lib/youtube-player';
import { loadStringArray, saveStringArray } from '../../lib/storage';
import { GlassBackdrop } from '../GlassBackdrop';

const MAX_RECENT_SEARCHES = 5;

const ACCENT = '#1ED760';

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

// Own id, not ControlCenterPanel's "cc-glass-distortion" — both can be
// mounted at once (Control Center opened while this window is also open),
// and SVG filter ids have to stay unique across the whole document.
function SpotifyGlassFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="spotify-glass-distortion" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.006" numOctaves={2} seed={92} result="noise" />
          <feGaussianBlur in="noise" stdDeviation="0.025" result="blur" />
          <feDisplacementMap in="SourceGraphic" in2="blur" scale={95} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Plain horizontal "coverflow" carousel — a normal scroll-snap row where the
// item nearest the center is scaled up and neighbors shrink down, instead of
// CircularGallery's 3D-bent WebGL gallery (which baked each title into a
// canvas texture and, once the item count grew, packed those labels close
// enough to overlap into illegible text). Driven by vertical scroll/wheel
// input (scroll down/up moves the strip right/left) since that's the more
// natural gesture on a trackpad/mouse wheel than horizontal-only scrolling.
function TrackCarousel({
  tracks,
  currentId,
  onSelect,
}: {
  tracks: YouTubeTrack[];
  currentId?: string;
  onSelect: (track: YouTubeTrack, index: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [centerIndex, setCenterIndex] = useState(0);

  const updateScales = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const centerX = scrollerRect.left + scrollerRect.width / 2;
    const maxDist = scrollerRect.width / 2 || 1;
    let closestIndex = 0;
    let closestDist = Infinity;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.left + rect.width / 2 - centerX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
      const t = Math.min(1, dist / maxDist);
      el.style.transform = `scale(${1 - t * 0.45})`;
      el.style.opacity = `${1 - t * 0.55}`;
      el.style.zIndex = `${Math.round((1 - t) * 100)}`;
    });
    setCenterIndex(closestIndex);
  }, []);

  useEffect(() => {
    updateScales();
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateScales);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    // Redirect vertical wheel/trackpad input into horizontal movement — a
    // plain onWheel prop can't do this because React attaches wheel
    // listeners as passive by default, which silently ignores
    // preventDefault(); attaching manually with passive:false is what
    // actually lets us take over the vertical gesture.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(raf);
    };
  }, [updateScales, tracks.length]);

  const centerTrack = tracks[centerIndex];

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollerRef}
        data-lenis-prevent
        className="no-scrollbar flex flex-1 items-center gap-6 overflow-x-auto px-[36%]"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {tracks.map((track, i) => (
          <button
            key={track.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onSelect(track, i)}
            className="relative shrink-0 overflow-hidden rounded-2xl shadow-2xl transition-shadow"
            style={{ width: 150, height: 150, scrollSnapAlign: 'center' }}
          >
            <img src={track.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
            {track.id === currentId && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span className="h-3 w-3 rounded-full" style={{ background: ACCENT }} />
              </div>
            )}
          </button>
        ))}
      </div>
      {centerTrack && (
        <div className="px-6 pb-1 pt-2 text-center">
          <div className="truncate text-sm font-semibold text-white">{centerTrack.title}</div>
          <div className="truncate text-xs text-white/50">{centerTrack.channelTitle}</div>
        </div>
      )}
    </div>
  );
}

export default function SpotifyApp({ sceneCanvasRef }: { interactive?: boolean; sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadStringArray('spotifySearches', []));

  const runSearch = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    setStatus('searching');
    setError(null);
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      saveStringArray('spotifySearches', next);
      return next;
    });
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

  const progress = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden text-white">
      <SpotifyGlassFilterDefs />

      {/* Base: blurred snapshot of the scene behind the window — same trick
          ControlCenterPanel/MacDock/MenuBar all share (see GlassBackdrop's
          own comment for why this is a manual canvas copy rather than
          backdrop-filter directly on the WebGL canvas). */}
      <div className="absolute inset-0 overflow-hidden">
        <GlassBackdrop sceneCanvasRef={sceneCanvasRef} containerRef={containerRef} pad={20} />
      </div>

      {/* Liquid-glass refraction — grabs that blurred snapshot as its own
          backdrop and warps it through the SVG displacement filter above,
          the same "Liquid Glass" technique ControlCenterPanel uses. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backdropFilter: 'blur(3px) url(#spotify-glass-distortion)',
          WebkitBackdropFilter: 'blur(3px)',
          isolation: 'isolate',
          overflow: 'hidden',
        }}
      />

      {/* Frosted tint over the refracted backdrop. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(165deg, rgba(70,70,76,0.46) 0%, rgba(15,15,17,0.38) 100%)',
          backdropFilter: 'saturate(160%)',
          WebkitBackdropFilter: 'saturate(160%)',
        }}
      />

      {/* Shine — the thin inner highlight real glass edges catch. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 1.5px 1.5px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 1px 1px rgba(255,255,255,0.08)',
        }}
      />

      {/* Search — a floating pill centered at the top, not stretched across
          the header, so it reads as a Spotlight-style search rather than a
          normal form field. */}
      <div className="relative z-10 flex shrink-0 justify-center px-6 pt-5 pb-3">
        <form onSubmit={handleSearch} className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to play?"
            className="w-full rounded-full py-2.5 pl-9 pr-4 text-center text-sm text-white outline-none placeholder:text-white/50"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
          />
        </form>
      </div>

      {/* Results — a normal horizontal carousel (driven by vertical
          scroll/wheel input): the thumbnail nearest the center reads big,
          neighbors shrink down, no 3D bend and no baked-in canvas text to
          overlap and go illegible. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {status === 'searching' && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/60">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white/70" aria-hidden />
            Searching&hellip;
          </div>
        )}
        {status === 'error' && <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{error}</div>}
        {status === 'idle' && results.length === 0 && (
          recentSearches.length > 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Recent searches</div>
              <div className="flex flex-wrap justify-center gap-2">
                {recentSearches.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => runSearch(q)}
                    className="rounded-full px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/20"
                    style={{ background: 'rgba(255,255,255,0.12)' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/50">Search for a song to get started.</div>
          )
        )}
        {results.length > 0 && (
          <TrackCarousel
            tracks={results}
            currentId={player.current?.id}
            onSelect={(track, index) => player.playTrack(track, results, index)}
          />
        )}
      </div>

      {/* Now-playing bar */}
      {player.current && (
        <div
          className="relative z-10 shrink-0 border-t border-white/15 px-4 py-3"
          style={{ background: 'rgba(10,10,12,0.4)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)' }}
        >
          <div className="flex items-center gap-3">
            <img src={player.current.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{player.current.title}</div>
              <div className="truncate text-xs text-white/50">{player.current.channelTitle}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" aria-label="Previous" onClick={player.skipPrev} className="text-white/70 transition hover:text-white">
                <PrevIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={player.playing ? 'Pause' : 'Play'}
                onClick={player.togglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full text-black transition hover:scale-105"
                style={{ background: ACCENT }}
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
          </div>

          <div className="mt-2 flex items-center gap-2">
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
      )}
    </div>
  );
}
