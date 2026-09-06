// macOS-style menu bar: a fixed glass strip along the top of the viewport —
// same blur-through-the-scene glass treatment as MacDock (see GlassBackdrop),
// so both pieces of chrome read as one consistent "OS" language. Site logo on
// the left (same spot as the real macOS Apple logo, recolored silver to match
// the cube's own glass material rather than its original brand color), an
// app-name label next to it, and a status cluster on the right (battery/
// wifi/sound/control-center/clock, same spot as the real macOS status
// icons).
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassBackdrop } from './GlassBackdrop';
import ControlCenterPanel from './ControlCenterPanel';
import TerminalWindow from './TerminalWindow';
import { WIDGET_IDS, WIDGET_LABELS, WIDGET_PREVIEWS, type WidgetId, type MusicPlaybackProps } from './DesktopWidgets';
import type { DockApp } from './MacDock';
import AccordionGallery from './AccordionGallery';
import { loadNumber, saveNumber, type AuthUser } from '../lib/storage';
import { useYouTubePlayer } from '../lib/youtube-player';

const SpeakerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3.5 9H6.6L11 5.6V18.4L6.6 15H3.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M14.3 8.6C15.85 10.1 15.85 13.9 14.3 15.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M16.8 6.3C19.55 9 19.55 15 16.8 17.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

// Speaker "cut off" — same speaker wedge, waves replaced with a slash.
const SpeakerMutedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3.5 9H6.6L11 5.6V18.4L6.6 15H3.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M15.3 9.3L20 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M20 9.3L15.3 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

// Two stacked toggle-sliders — the real macOS Control Center glyph.
const ActionDrawerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="3" y="6" width="18" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8.5" r="1.9" fill="currentColor" />
    <rect x="3" y="13.5" width="18" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="1.9" fill="currentColor" />
  </svg>
);

const ICON_BTN_CLASS = 'relative flex items-center justify-center shrink-0 transition-opacity hover:opacity-70 active:opacity-50';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function MenuBar({
  isLight,
  onSetLight,
  isLoading,
  sceneCanvasRef,
  widgetEditMode,
  onToggleWidgetEditMode,
  visibleWidgets,
  onAddWidget,
  onRemoveWidget,
  music,
  volume,
  onVolumeChange,
  dockApps,
  onOpenApp,
  onLock,
  authUser,
  onRequestSignOut,
}: {
  isLight?: boolean;
  onSetLight: (isLight: boolean) => void;
  isLoading?: boolean;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  widgetEditMode: boolean;
  onToggleWidgetEditMode: () => void;
  visibleWidgets: WidgetId[];
  onAddWidget: (id: WidgetId) => void;
  onRemoveWidget: (id: WidgetId) => void;
  music: MusicPlaybackProps;
  volume: number;
  onVolumeChange: (v: number) => void;
  dockApps: DockApp[];
  onOpenApp: (id: string) => void;
  onLock: () => void;
  authUser: AuthUser | null;
  onRequestSignOut: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const now = useClock();
  const dayStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const iconColor = isLight ? 'rgba(20,20,22,0.82)' : 'rgba(230,230,235,0.92)';

  const lastVolumeRef = useRef(volume);
  const muted = volume === 0;
  const toggleMute = () => {
    if (muted) {
      onVolumeChange(lastVolumeRef.current || 70);
    } else {
      lastVolumeRef.current = volume;
      onVolumeChange(0);
    }
  };

  // This toggle used to only touch the ambient Howler track's own volume
  // (see the `onVolumeChange` prop) — muting from here left a YouTube track
  // playing through Spotify (MacDock.tsx/SpotifyApp.tsx) fully audible,
  // ignoring the mute entirely. Syncing it here too makes "mute" mean every
  // audio source on the site, not just the ambient one.
  const ytPlayer = useYouTubePlayer();
  useEffect(() => {
    ytPlayer.setMuted(muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  const [brightness, setBrightnessState] = useState(() => loadNumber('brightness', 100));
  const setBrightness = (v: number) => { setBrightnessState(v); saveNumber('brightness', v); };
  // Applies real dimming to the whole page — a little easter egg so the
  // Display slider actually does something, not just decoration.
  useEffect(() => {
    document.documentElement.style.filter = brightness >= 100 ? '' : `brightness(${brightness}%)`;
  }, [brightness]);
  useEffect(() => () => { document.documentElement.style.filter = ''; }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerButtonRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (drawerButtonRef.current?.contains(target) || drawerPanelRef.current?.contains(target)) return;
      setDrawerOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [drawerOpen]);

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const terminalButtonRef = useRef<HTMLButtonElement>(null);
  const terminalPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!terminalOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (terminalButtonRef.current?.contains(target) || terminalPanelRef.current?.contains(target)) return;
      setTerminalOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [terminalOpen]);
  useEffect(() => {
    if (!terminalOpen) setTerminalMaximized(false);
  }, [terminalOpen]);

  // The Settings dropdown's own open/closed state doubles as widget edit
  // mode itself — no separate flag needed, since the gallery menu only
  // makes sense while editing is active anyway. Exiting takes a *double*
  // click on empty space rather than a single click, on purpose — a single
  // stray click is too easy to trigger while dragging a widget around (see
  // DesktopWidgets' drag-to-reorder), which would otherwise boot you out of
  // edit mode mid-drag. Clicks that land on a widget itself never reach this
  // listener — DesktopWidgets stops that propagation itself.
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!widgetEditMode) return;
    const handleDoubleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsButtonRef.current?.contains(target) || settingsPanelRef.current?.contains(target)) return;
      onToggleWidgetEditMode();
    };
    window.addEventListener('dblclick', handleDoubleClick);
    return () => window.removeEventListener('dblclick', handleDoubleClick);
  }, [widgetEditMode, onToggleWidgetEditMode]);

  return (
    <motion.div
      ref={containerRef}
      // Opacity only, same reasoning as MacDock's own entrance — an animated
      // `y` forces this element into its own stacking/backdrop-root context,
      // which would wall the glass panel off from ever sampling the WebGL
      // canvas behind it.
      initial={{ opacity: 0 }}
      animate={{ opacity: !isLoading ? 1 : 0 }}
      transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 h-8 flex items-center justify-between px-3 md:px-4 select-none"
    >
      {/* Glass panel — see MacDock's own copy of this comment for why the
          blur-through canvas + backdrop-filter split exists at all. */}
      <div
        className="absolute inset-0 overflow-hidden border-b"
        style={{
          borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
        }}
      >
        <GlassBackdrop sceneCanvasRef={sceneCanvasRef} containerRef={containerRef} pad={16} />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.14) 100%)'
              : 'linear-gradient(180deg, rgba(60,60,66,0.3) 0%, rgba(10,10,12,0.22) 100%)',
            backdropFilter: 'saturate(160%)',
            WebkitBackdropFilter: 'saturate(160%)',
          }}
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'radial-gradient(60% 200% at 15% 0%, rgba(255,255,255,0.8), transparent 70%)'
              : 'radial-gradient(60% 200% at 15% 0%, rgba(255,255,255,0.18), transparent 70%)',
            mixBlendMode: isLight ? 'overlay' : 'screen',
          }}
        />
      </div>

      {/* Left: site logo (silvered to match the cube's own glass material
          rather than its original purple brand color) plus an app-name
          label, same spot as the real macOS menu bar's frontmost-app label
          immediately right of the Apple logo. */}
      <div className="relative z-10 flex items-center gap-2 h-full">
        <div className="flex items-center h-full">
          {authUser?.picture ? (
            <img
              src={authUser.picture}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <img
              src="/android-chrome-512x512.png"
              alt=""
              className="h-5 w-5 object-contain"
              style={{ filter: 'grayscale(1) brightness(1.75) contrast(0.85)' }}
            />
          )}
        </div>
        {/* <button
          ref={terminalButtonRef}
          type="button"
          onClick={() => setTerminalOpen((o) => !o)}
          className="text-[13px] font-semibold hover:opacity-70 active:opacity-50"
          style={{ color: iconColor }}
        >
          Terminal
        </button> */}

        {/* Signed in: opens the same confirm dialog as the terminal's
            `signout` command. Signed out: there's no other entry point to
            sign-in from the desktop itself, so this just locks the
            screen — that's where sign-in actually lives. */}
        <button
          type="button"
          onClick={authUser ? onRequestSignOut : onLock}
          aria-label={authUser ? 'Sign out' : 'Sign in'}
          className="text-[13px] font-semibold hover:opacity-70 active:opacity-50"
          style={{ color: iconColor }}
        >
          {authUser ? 'Sign out' : 'Sign in'}
        </button>
         <button
          ref={settingsButtonRef}
          type="button"
          onClick={onToggleWidgetEditMode}
          aria-label={widgetEditMode ? 'Done editing widgets' : 'Settings'}
          className="text-[13px] font-semibold hover:opacity-70 active:opacity-50"
          style={{ color: iconColor }}
        >
          {widgetEditMode ? 'Done' : 'Settings'}
        </button>
        
        <button
          type="button"
          onClick={onLock}
          aria-label="Lock"
          className="text-[13px] font-semibold hover:opacity-70 active:opacity-50"
          style={{ color: iconColor }}
        >
          Lock
        </button>
        <button
          ref={terminalButtonRef}
          type="button"
          onClick={() => setTerminalOpen((o) => !o)}
          className="text-[13px] font-semibold hover:opacity-70 active:opacity-50"
          style={{ color: iconColor }}
        >
          Terminal
        </button>

       
      </div>

      {/* Centered widget gallery — a horizontal hover-accordion, each
          segment a live preview of that widget. Hovering expands a segment
          to preview it; clicking toggles it on/off (same effect as a
          widget's own "✕" badge, in reverse). The outer wrapper spans the
          full screen but is pointer-events:none itself, so double-clicks in
          the empty margin around the gallery still fall through to the
          dimmed desktop underneath and register as "empty space" for the
          menu bar's exit-on-double-click listener; only the inner box
          (the gallery itself) opts back into receiving pointer events. */}
      <AnimatePresence>
        {widgetEditMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-20 flex items-center justify-center px-6"
            style={{ pointerEvents: 'none' }}
          >
            <div ref={settingsPanelRef} className="w-full max-w-md" style={{ pointerEvents: 'auto' }}>
              <div className="text-center text-[13px] font-semibold mb-3" style={{ color: isLight ? '#1a1a1c' : '#f0f0f2' }}>
                Widgets
              </div>
              <AccordionGallery
                items={WIDGET_IDS.map((id) => ({
                  id,
                  preview: WIDGET_PREVIEWS[id](music),
                  label: WIDGET_LABELS[id],
                  selected: visibleWidgets.includes(id),
                }))}
                onToggle={(id) => (visibleWidgets.includes(id as WidgetId) ? onRemoveWidget(id as WidgetId) : onAddWidget(id as WidgetId))}
                defaultIndex={0}
                expandRatio={0.55}
                height={260}
                gap={6}
                radius={14}
                duration={0.6}
                ease="power3.out"
                accentColor="#ffffff"
                grayscale
                showLabels
                tilt={6}
                parallax={8}
                stagger={0.06}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {terminalOpen && (
          <motion.div
            ref={terminalPanelRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className={
              terminalMaximized
                ? 'fixed inset-4 z-50'
                : 'fixed top-12 left-1/2 -translate-x-1/2 z-50 w-[min(90vw,32rem)]'
            }
          >
            <TerminalWindow
              isLight={isLight}
              onSetLight={onSetLight}
              dockApps={dockApps}
              onOpenApp={onOpenApp}
              onLock={onLock}
              onRequestSignOut={onRequestSignOut}
              onClose={() => setTerminalOpen(false)}
              isMaximized={terminalMaximized}
              onToggleMaximize={() => setTerminalMaximized((m) => !m)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right: status cluster. */}
      <div className="relative z-10 flex items-center gap-3" style={{ color: iconColor }}>
        <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} className={ICON_BTN_CLASS} onClick={toggleMute}>
          {muted ? <SpeakerMutedIcon className="w-4 h-4" /> : <SpeakerIcon className="w-4 h-4" />}
        </button>

        <div className="relative">
          <button
            ref={drawerButtonRef}
            type="button"
            aria-label="Control Center"
            className={ICON_BTN_CLASS}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <ActionDrawerIcon className="w-3.5 h-3.5" />
          </button>
          <AnimatePresence>
            {drawerOpen && (
              <motion.div
                ref={drawerPanelRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute top-full right-0 mt-2 z-20"
              >
                <ControlCenterPanel
                  isLight={isLight}
                  onSetLight={onSetLight}
                  sceneCanvasRef={sceneCanvasRef}
                  containerRef={drawerPanelRef}
                  brightness={brightness}
                  onBrightnessChange={setBrightness}
                  volume={volume}
                  onVolumeChange={onVolumeChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="text-[11px] font-medium whitespace-nowrap tabular-nums">
          {dayStr}&nbsp;&nbsp;{timeStr}
        </span>
      </div>
    </motion.div>
  );
}
