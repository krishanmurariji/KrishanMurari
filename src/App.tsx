import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Howl } from 'howler';
import SmoothScroll from './components/SmoothScroll';
import Loader from './components/Loader';
import LockScreen from './components/LockScreen';
import NotificationBanner, { type NotificationData } from './components/NotificationBanner';
import MacDock, { type DockApp, type DockRect } from './components/MacDock';
import AppWindow, { useSharedSnapshots } from './components/AppWindow';
import Scene from './components/Scene';
import MenuBar from './components/MenuBar';
import DesktopWidgets from './components/DesktopWidgets';
// import { SmoothCursor } from './components/ui/smooth-cursor'; // disabled per request — keeping the component around in case it's wanted back later
import { FinderIcon, MacMailIcon, CertificateIcon, ExperienceIcon, SpotifyIcon } from './components/MacIcons';
import SignOutConfirm from './components/SignOutConfirm';
import { loadBool, saveBool, loadStringArray, saveStringArray, loadNumber, saveNumber, saveAuthUser, clearAuthUser, loadAuthUser, type AuthUser, PROVIDER_LABELS } from './lib/storage';
import { WIDGET_IDS, type WidgetId } from './components/DesktopWidgets';
import { YouTubePlayerProvider } from './lib/youtube-player';

const TRACK_SRC = '/audio/lofi-instrumental.mp3';
const TRACK_TITLE = 'Lofi Instrumental';
const TRACK_ARTIST = 'Sub_Clair';

interface Session {
  originRect: DockRect;
  minimized: boolean;
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  // The lock screen shown once the loading cube finishes assembling —
  // separate from isLoading, since dismissing it (login or skip) is what
  // triggers the cube's own solve-and-open reveal (see Scene's `locked`
  // prop), not the loader finishing on its own.
  const [isLocked, setIsLocked] = useState(true);
  // Once the cube has played its solve-and-open reveal the first time, a
  // later re-lock (the menu bar's Lock button, or the terminal's `lock`
  // command) should still show the lock screen overlay again, but must NOT
  // re-drive the cube back into its "assembling" render path — that path
  // snaps every cubie straight to its assembled position the instant
  // `locked` goes true again (it has no awareness that some of them are
  // mid-flight from the explode), which reads as a jarring instant snap
  // rather than a lock. Scene's `locked` prop is gated by this too, so it
  // only ever affects the cube on that very first unlock.
  const [hasUnlockedOnce, setHasUnlockedOnce] = useState(false);
  const sceneLocked = isLocked && !hasUnlockedOnce;
  const [notification, setNotification] = useState<NotificationData | null>(null);
  // The saved sign-in (if any, from whichever OAuth provider) — lifted here
  // (rather than read fresh from storage wherever it's needed, the way the
  // terminal's own commands do) so the menu bar's avatar/Sign out/Sign in
  // button updates the instant a sign-in or sign-out happens, not on
  // whatever unrelated re-render happens to come next.
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser());
  // Confirmation for the terminal's `signout` command — see TerminalWindow's
  // `signout` entry, which just opens this instead of acting immediately.
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const confirmSignOut = useCallback(() => {
    clearAuthUser();
    setAuthUser(null);
    setSignOutConfirmOpen(false);
    setIsLocked(true);
  }, []);
  useEffect(() => {
    if (!notification) return;
    const id = window.setTimeout(() => setNotification(null), 5000);
    return () => window.clearTimeout(id);
  }, [notification]);
  // Read before anything else renders (a lazy useState initializer runs
  // synchronously during the very first render, ahead of the Loader) so the
  // saved theme is already in effect from the first paint — no flash of the
  // wrong theme while waiting for an effect to correct it after mount.
  const [isLight, setIsLightState] = useState(() => loadBool('theme', true));
  const setIsLight = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setIsLightState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      saveBool('theme', next);
      return next;
    });
  }, []);

  // Widget "jiggle mode": toggled from the menu bar's Settings button. While
  // active, the desktop (scene + dock) dims and freezes below, and the
  // widget stack shows remove badges — see the dimming wrapper on <main> and
  // MacDock further down, and DesktopWidgets/MenuBar for the rest.
  const [widgetEditMode, setWidgetEditMode] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(() =>
    loadStringArray('widgets', [...WIDGET_IDS]) as WidgetId[]
  );
  const removeWidget = useCallback((id: WidgetId) => {
    setVisibleWidgets((prev) => {
      const next = prev.filter((w) => w !== id);
      saveStringArray('widgets', next);
      return next;
    });
  }, []);
  const addWidget = useCallback((id: WidgetId) => {
    setVisibleWidgets((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveStringArray('widgets', next);
      return next;
    });
  }, []);

  // Shared audio state: lives here (not in MenuBar or ControlCenterPanel)
  // because two different UIs now control the same real playback — the
  // menu bar's Control Center "Now Playing" card and the desktop's Music
  // widget. Both need to see and drive the identical Howl instance, not
  // two independent players that could fall out of sync.
  const [volume, setVolumeState] = useState(() => loadNumber('volume', 70));
  const setVolume = useCallback((v: number) => { setVolumeState(v); saveNumber('volume', v); }, []);
  const howlRef = useRef<Howl | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const howl = new Howl({ src: [TRACK_SRC], loop: true, volume: volume / 100 });
    howlRef.current = howl;
    return () => { howl.unload(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { howlRef.current?.volume(volume / 100); }, [volume]);
  const togglePlay = useCallback(() => {
    const howl = howlRef.current;
    if (!howl) return;
    setPlaying((p) => {
      if (p) howl.pause();
      else howl.play();
      return !p;
    });
  }, []);
  const restartTrack = useCallback(() => { howlRef.current?.seek(0); }, []);
  // Keyed by appId — every app currently open OR minimized gets an entry here
  // for as long as it's running, regardless of what any other entry is doing.
  // That's what makes minimized previews persistent: opening/minimizing a
  // different app only ever flips *that* app's own `minimized` flag, never
  // removes another app's entry.
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [trayRects, setTrayRects] = useState<Record<string, DockRect>>({});
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const loadProgressRef = useRef({ value: 0 });
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Memoized — this array's identity, not just its contents, is a dependency
  // of useSharedSnapshots' capture effect below; a fresh array literal every
  // render would re-trigger the (expensive, one-time-only) capture pass on
  // every unrelated re-render of App.
  const dockApps: DockApp[] = useMemo(() => [
    { id: 'profile', label: 'Profile', icon: FinderIcon, kind: 'placeholder' },
    { id: 'experience', label: 'Experience', icon: ExperienceIcon, kind: 'placeholder' },
    { id: 'certifications', label: 'Certifications', icon: CertificateIcon, kind: 'placeholder' },
    { id: 'spotify', label: 'Spotify', icon: SpotifyIcon, kind: 'placeholder' },
    {
      id: 'email',
      label: 'Email',
      icon: MacMailIcon,
      kind: 'placeholder',
      handle: 'mrkrishanmurariji@gmail.com',
    },
  ], []);

  // Captured once, upfront, for every app — see useSharedSnapshots' own
  // comment for why this needs to happen here rather than per-session.
  const { snapshotsRef, host: snapshotHost } = useSharedSnapshots(dockApps);

  // Clicking a dock icon: open that app fresh (or restore it if it was
  // minimized), and minimize whatever other app was frontmost — never close
  // or discard it, just background it, exactly like real multi-tasking.
  const handleDockSelect = useCallback((id: string, rect: DockRect) => {
    setSessions((prev) => {
      const next: Record<string, Session> = {};
      for (const [key, s] of Object.entries(prev)) {
        next[key] = key === id || s.minimized ? s : { ...s, minimized: true };
      }
      next[id] = { originRect: rect, minimized: false };
      return next;
    });
  }, []);

  // The terminal's `open <app>` command reuses this same open path — it
  // just doesn't have a real dock icon's rect to animate the genie from
  // (the command was typed, not clicked), so it stands in a plausible one
  // at the dock's own on-screen band instead of skipping the animation.
  const openAppFromTerminal = useCallback((id: string) => {
    const rect: DockRect = { left: window.innerWidth / 2 - 20, top: window.innerHeight - 88, width: 40, height: 40 };
    handleDockSelect(id, rect);
  }, [handleDockSelect]);

  const handleMinimize = useCallback((id: string) => {
    setSessions((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], minimized: true } } : prev));
  }, []);

  const handleRestore = useCallback((id: string) => {
    setSessions((prev) => {
      const next: Record<string, Session> = {};
      for (const [key, s] of Object.entries(prev)) {
        next[key] = key === id || s.minimized ? s : { ...s, minimized: true };
      }
      if (next[id]) next[id] = { ...next[id], minimized: false };
      return next;
    });
  }, []);

  const handleCloseComplete = useCallback((id: string) => {
    setSessions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTrayRects((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleTrayRectChange = useCallback((id: string, rect: DockRect | null) => {
    setTrayRects((prev) => {
      if (!rect) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const handleAnimatingChange = useCallback((id: string, animating: boolean) => {
    setAnimatingIds((prev) => {
      const next = new Set(prev);
      if (animating) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsLight(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const runningAppIds = Object.keys(sessions);
  const minimizedAppIds = runningAppIds.filter((id) => sessions[id].minimized);

  return (
    // Wraps everything — both MacDock (the Spotify icon's hover popup) and
    // AppWindow (SpotifyApp.tsx's now-playing bar, once that window is
    // open) read this same app-wide YouTube playback state, so it needs to
    // be a shared ancestor of both rather than owned by either.
    <YouTubePlayerProvider>
    <SmoothScroll>
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="fixed inset-0 z-[9999] pointer-events-none"
          >
            <Loader progressRef={loadProgressRef} onComplete={() => setIsLoading(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <LockScreen
        visible={!isLoading && isLocked}
        isLight={isLight}
        onSetLight={setIsLight}
        onSkip={() => { setIsLocked(false); setHasUnlockedOnce(true); }}
        onSignedIn={(user) => {
          setIsLocked(false);
          setHasUnlockedOnce(true);
          saveAuthUser(user);
          setAuthUser(user);
          setNotification({ title: `Welcome, ${user.name}`, message: `Signed in with ${PROVIDER_LABELS[user.provider]}`, photoUrl: user.picture ?? undefined });
        }}
      />
      <NotificationBanner data={notification} onDismiss={() => setNotification(null)} />
      <SignOutConfirm
        open={signOutConfirmOpen}
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={confirmSignOut}
      />

      {/* Background — cloudy white */}
      <div
        className="fixed inset-0 w-full h-full -z-20 transition-colors duration-700"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse 80% 60% at 20% 10%, #ffffff 0%, #eef0f4 45%, #e4e6ec 100%)'
            : '#000000',
        }}
      />

      {/* Ambient glows */}
      <div className={`fixed top-[-200px] left-[-200px] w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none -z-10 transition-colors duration-700 ${isLight ? 'bg-white opacity-70' : 'bg-[#1a2e44] opacity-30'}`} />
      <div className={`fixed bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full blur-[150px] pointer-events-none -z-10 transition-colors duration-700 ${isLight ? 'bg-white opacity-60' : 'bg-[#2d1a44] opacity-20'}`} />

      {/* <SmoothCursor /> */}

      {/* Nothing of the desktop itself — menu bar, widgets, dock — is shown
          while the lock screen is up (opacity/pointer-events, not unmount,
          so each piece's own isLoading-driven entrance animation still runs
          on schedule underneath and simply reveals already-settled once
          this fades in, rather than replaying late). */}
      <div style={{ opacity: isLocked ? 0 : 1, pointerEvents: isLocked ? 'none' : 'auto', transition: 'opacity 0.5s ease' }}>
        <MenuBar
          isLight={isLight}
          onSetLight={setIsLight}
          isLoading={isLoading}
          sceneCanvasRef={sceneCanvasRef}
          widgetEditMode={widgetEditMode}
          onToggleWidgetEditMode={() => setWidgetEditMode((v) => !v)}
          visibleWidgets={visibleWidgets}
          onAddWidget={addWidget}
          onRemoveWidget={removeWidget}
          volume={volume}
          onVolumeChange={setVolume}
          music={{ playing, onTogglePlay: togglePlay, onSkip: restartTrack, trackTitle: TRACK_TITLE, trackArtist: TRACK_ARTIST }}
          dockApps={dockApps}
          onOpenApp={openAppFromTerminal}
          onLock={() => setIsLocked(true)}
          authUser={authUser}
          onRequestSignOut={() => setSignOutConfirmOpen(true)}
        />

        <DesktopWidgets
          isLoading={isLoading}
          editMode={widgetEditMode}
          visibleWidgets={visibleWidgets}
          onRemoveWidget={removeWidget}
          music={{ playing, onTogglePlay: togglePlay, onSkip: restartTrack, trackTitle: TRACK_TITLE, trackArtist: TRACK_ARTIST }}
          sceneCanvasRef={sceneCanvasRef}
          isLight={isLight}
        />

        {/* Dimmed + frozen while editing widgets — same "everything else
            fades into the background" behavior as real macOS/iOS widget
            editing. The menu bar itself stays untouched so Settings/Done
            stays usable. */}
        <div
          style={{
            filter: widgetEditMode ? 'grayscale(0.5) brightness(0.55) blur(1px)' : 'none',
            pointerEvents: widgetEditMode ? 'none' : 'auto',
            transition: 'filter 0.3s ease',
          }}
        >
          <MacDock
            apps={dockApps}
            onSelect={handleDockSelect}
            isLight={isLight}
            isLoading={isLoading}
            minimizedAppIds={minimizedAppIds}
            onTrayRectChange={handleTrayRectChange}
            disabled={animatingIds.size > 0}
            sceneCanvasRef={sceneCanvasRef}
          />
        </div>
      </div>

      {snapshotHost}

      {runningAppIds.map((id) => {
        const app = dockApps.find((a) => a.id === id);
        if (!app) return null;
        const session = sessions[id];
        return (
          <AppWindow
            key={id}
            app={app}
            originRect={session.originRect}
            trayRect={trayRects[id] ?? null}
            minimized={session.minimized}
            snapshotsRef={snapshotsRef}
            sceneCanvasRef={sceneCanvasRef}
            onMinimize={() => handleMinimize(id)}
            onRestore={() => handleRestore(id)}
            onCloseComplete={() => handleCloseComplete(id)}
            onAnimatingChange={(animating) => handleAnimatingChange(id, animating)}
          />
        );
      })}

      <main
        className={`relative w-full h-screen overflow-hidden font-sans ${isLight ? 'text-[#111111] selection:bg-black/20' : 'text-[#E0E0E0] selection:bg-white/30'}`}
        style={{
          filter: widgetEditMode ? 'grayscale(0.5) brightness(0.55) blur(1px)' : 'none',
          pointerEvents: widgetEditMode ? 'none' : 'auto',
          transition: 'filter 0.3s ease',
        }}
      >
        {/* 3D Canvas — fixed behind everything. The revealed name now renders
            as real 3D glass text inside this same scene (see Scene.tsx),
            not an HTML overlay, so it can actually refract/reflect. */}
        <Scene isLight={isLight} isLoading={isLoading} locked={sceneLocked} progressRef={loadProgressRef} canvasRef={sceneCanvasRef} />
      </main>
    </SmoothScroll>
    </YouTubePlayerProvider>
  );
}
