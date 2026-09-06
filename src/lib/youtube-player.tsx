// Wraps the official YouTube IFrame Player API
// (https://developers.google.com/youtube/iframe_api_reference) in one
// app-wide React context — a single hidden player instance, not one per
// consumer, since only one video can meaningfully play at a time and the
// browser should only ever load the IFrame API script once. Search (the
// other half of the Spotify-clone experience, see SpotifyApp.tsx) goes
// through YouTube Data API v3 instead — see searchYouTube() below.
//
// Deliberately the *official* embeddable player, not a stream-URL-scraping
// library (several exist and are common in hobby projects) — those work by
// reverse-engineering YouTube's internal player API to pull raw CDN audio
// URLs, which is against YouTube's Terms of Service and fragile (breaks
// whenever YouTube changes internals). This app is public and carries the
// site owner's name, so it uses the ToS-compliant path even though it means
// a real (hidden) video element instead of a pure audio stream.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getCookie, setCookie } from './storage';

export interface YouTubeTrack {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

// Called directly from the browser (not proxied server-side, unlike this
// project's other API keys) — a YouTube Data API key restricted by HTTP
// referrer is specifically designed for client-side use: the referrer
// check *is* the security boundary Google expects here, standing in for
// the "never client-exposed" rule this project's OAuth/SMTP secrets follow
// instead. A server-side proxy would strip that referrer entirely (Node's
// fetch sends none), which is what an earlier version of this hit —
// Google's API rejected it as `referer <empty>`.
interface YouTubeSearchResponseItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } };
  };
}

export async function searchYouTube(query: string): Promise<YouTubeTrack[]> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;
  if (!apiKey) throw new Error("YouTube search isn't configured yet (VITE_YOUTUBE_API_KEY missing).");

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10', // Music
    maxResults: '20',
    q: query,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `YouTube search failed (${res.status})`);

  const items = (data.items ?? []) as YouTubeSearchResponseItem[];
  return items
    .filter((item): item is YouTubeSearchResponseItem & { id: { videoId: string } } => !!item.id?.videoId)
    .map((item) => ({
      id: item.id.videoId,
      title: item.snippet?.title ?? 'Untitled',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.default?.url ??
        '',
    }));
}

interface PlayerState {
  current: YouTubeTrack | null;
  queue: YouTubeTrack[];
  queueIndex: number;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
}

interface YouTubePlayerContextValue extends PlayerState {
  playTrack: (track: YouTubeTrack, queue?: YouTubeTrack[], index?: number) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  // Lets the menu bar's single global mute toggle (see MenuBar.tsx) reach
  // this player too — that toggle previously only touched the ambient
  // Howler track's volume, so muting from the menu bar left a YouTube track
  // playing right through it, audibly unmuted. Persists across a track load
  // (applied again in onReady below) so muting, then picking a new song,
  // doesn't quietly unmute.
  setMuted: (muted: boolean) => void;
}

const YouTubePlayerContext = createContext<YouTubePlayerContextValue | null>(null);

// The IFrame API has no official TypeScript types shipped — this is just
// the handful of members this file actually calls, not the full surface.
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayerOptions {
  height?: string;
  width?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
  };
}
interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  mute(): void;
  unMute(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

// Remembers whatever track last played, in a cookie (rather than
// localStorage, like everything else this app persists) so a returning
// visitor's widget/dock popup can show it immediately — restored cued-but-
// paused (see the player-creation effect below), not auto-played.
const LAST_PLAYED_COOKIE = 'portfolio_spotify_last_played';

function loadLastPlayed(): YouTubeTrack | null {
  const raw = getCookie(LAST_PLAYED_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.title === 'string') {
      return {
        id: parsed.id,
        title: parsed.title,
        channelTitle: typeof parsed.channelTitle === 'string' ? parsed.channelTitle : '',
        thumbnail: typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '',
      };
    }
  } catch {
    // ignore malformed cookie
  }
  return null;
}

function saveLastPlayed(track: YouTubeTrack) {
  setCookie(LAST_PLAYED_COOKIE, JSON.stringify(track), 180);
}

// Loads https://www.youtube.com/iframe_api exactly once regardless of how
// many times this module gets re-evaluated (Vite HMR, StrictMode double
// -invoke) — a second <script> tag for the same src would just be wasted,
// but a second `onYouTubeIframeAPIReady` assignment would silently drop
// whichever provider instance registered first.
let apiLoadPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return apiLoadPromise;
}

export function YouTubePlayerProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<PlayerState>(() => {
    const last = loadLastPlayed();
    return {
      current: last,
      queue: last ? [last] : [],
      queueIndex: 0,
      playing: false,
      loading: false,
      currentTime: 0,
      duration: 0,
    };
  });
  // Mirrors `state` for the handful of callbacks below that need the
  // latest queue/playing value without taking a dependency on `state`
  // itself (which would mean re-creating them, and the onStateChange
  // handler registered once at player-creation time, every render).
  const stateRef = useRef(state);
  stateRef.current = state;

  const playAt = useCallback((queue: YouTubeTrack[], index: number) => {
    const track = queue[index];
    if (!track || !playerRef.current) return;
    setState((s) => ({ ...s, current: track, queue, queueIndex: index, loading: true, currentTime: 0, duration: 0 }));
    playerRef.current.loadVideoById(track.id);
    saveLastPlayed(track);
  }, []);
  const playAtRef = useRef(playAt);
  playAtRef.current = playAt;

  const skipNext = useCallback(() => {
    const { queue, queueIndex } = stateRef.current;
    if (queue.length === 0) return;
    playAtRef.current(queue, (queueIndex + 1) % queue.length);
  }, []);
  const skipNextRef = useRef(skipNext);
  skipNextRef.current = skipNext;

  const skipPrev = useCallback(() => {
    const { queue, queueIndex } = stateRef.current;
    if (queue.length === 0) return;
    playAtRef.current(queue, (queueIndex - 1 + queue.length) % queue.length);
  }, []);

  // Tracked in a ref (not state) since nothing here needs to re-render on
  // mute — it only exists so `onReady` below can re-apply whatever mute
  // state was requested before the underlying player actually finished
  // initializing.
  const mutedRef = useRef(false);
  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.mute();
    else p.unMute();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: '2',
        width: '2',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            // Restores a returning visitor's last-played track buffered and
            // ready (not auto-playing) — see loadLastPlayed() above — so the
            // very first press of Play actually has something to resume.
            const last = stateRef.current.current;
            if (last) playerRef.current?.cueVideoById(last.id);
            // Re-applies whatever setMuted() was told before the player
            // existed yet (e.g. the menu bar's mute toggle firing on page
            // load, or a visitor who reloads while already muted).
            if (mutedRef.current) playerRef.current?.mute();
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) setState((s) => ({ ...s, playing: true, loading: false }));
            else if (e.data === YT.PlayerState.PAUSED) setState((s) => ({ ...s, playing: false }));
            else if (e.data === YT.PlayerState.BUFFERING) setState((s) => ({ ...s, loading: true }));
            else if (e.data === YT.PlayerState.ENDED) skipNextRef.current();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live progress — the IFrame API has no "timeupdate" event, only the
  // coarse onStateChange above, so polling while playing is the standard
  // way every YouTube-player wrapper gets a moving progress bar.
  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      setState((s) => ({ ...s, currentTime: p.getCurrentTime() || 0, duration: p.getDuration() || s.duration }));
    }, 500);
    return () => window.clearInterval(id);
  }, [state.playing]);

  const playTrack = useCallback(
    (track: YouTubeTrack, queue?: YouTubeTrack[], index?: number) => {
      const q = queue ?? [track];
      const i = index ?? Math.max(0, q.findIndex((t) => t.id === track.id));
      playAt(q, i);
    },
    [playAt]
  );

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (stateRef.current.playing) p.pauseVideo();
    else p.playVideo();
  }, []);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setState((s) => ({ ...s, currentTime: seconds }));
  }, []);

  return (
    <YouTubePlayerContext.Provider value={{ ...state, playTrack, togglePlay, seek, skipNext, skipPrev, setMuted }}>
      {/* Never display:none / zero-size — some browsers pause playback or
          fail to initialize an IFrame Player that isn't actually laid out
          on the page. A real-but-tiny, fully transparent element tucked
          into a corner is the standard "hidden but alive" size other
          YouTube-audio wrapper projects use. */}
      <div ref={containerRef} style={{ position: 'fixed', bottom: 0, right: 0, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }} aria-hidden />
      {children}
    </YouTubePlayerContext.Provider>
  );
}

export function useYouTubePlayer(): YouTubePlayerContextValue {
  const ctx = useContext(YouTubePlayerContext);
  if (!ctx) throw new Error('useYouTubePlayer must be used within YouTubePlayerProvider');
  return ctx;
}
