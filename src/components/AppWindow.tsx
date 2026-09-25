import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { flushSync } from 'react-dom';
import { toCanvas } from 'html-to-image';
import type { DockApp, DockRect } from './MacDock';

// Each app body is its own chunk, fetched only once its window is actually
// opened (or, in practice, a beat later — see useSharedSnapshots below,
// which mounts every one of these off-screen right after load to prewarm
// dock-genie snapshots). Splitting these out keeps the app's *first* paint
// (the loader + 3D scene + desktop chrome) from having to download and
// parse every app's own dependencies up front — CertificationsApp alone
// pulls in a second full WebGL stack (`ogl`, for Ferrofluid +
// CircularGallery) that nothing else on the page needs.
const ProfileApp = lazy(() => import('./apps/ProfileApp'));
const ExperienceApp = lazy(() => import('./apps/ExperienceApp'));
const EmailApp = lazy(() => import('./apps/EmailApp'));
const SpotifyApp = lazy(() => import('./apps/SpotifyApp'));
const CertificationsApp = lazy(() => import('./apps/CertificationsApp'));
const ProjectsApp = lazy(() => import('./apps/ProjectsApp'));

// One instance per running app (open or minimized) — tied to a fixed `app`
// for its whole mounted lifetime, so switching apps never means one instance
// juggling different content; it just means other instances exist alongside
// it. That's what makes minimized previews persistent: minimizing app A while
// opening app B only ever touches A's own `minimized` prop, never A's mount
// state, so its instance (and tray tile) survives untouched.
type Phase = 'opening' | 'open' | 'closing' | 'min';
type Dir = 'open' | 'minimize';
interface Pt {
  x: number;
  y: number;
}
interface Size {
  w: number;
  h: number;
}

// Reference size — what every app's hidden snapshot is captured at (see
// useSharedSnapshots below) and the ceiling a window is allowed to grow to
// on a large screen. The window actually *opens* at getOpenSize()'s result,
// which clamps this down to fit small viewports; the snapshot itself is just
// a warp texture (renderGenie stretches it into whatever rect it's given
// below), so it stays fixed at this resolution regardless of that.
export const WIN_W = 760;
export const WIN_H = 580;
const DUR = 480;
// Fraction of the viewport an open window may occupy before WIN_W/WIN_H get
// clamped down — keeps the window from ever exceeding a small phone screen.
const VIEWPORT_W_RATIO = 0.94;
const VIEWPORT_H_RATIO = 0.88;

function getOpenSize(): Size {
  if (typeof window === 'undefined') return { w: WIN_W, h: WIN_H };
  return {
    w: Math.min(WIN_W, Math.round(window.innerWidth * VIEWPORT_W_RATIO)),
    h: Math.min(WIN_H, Math.round(window.innerHeight * VIEWPORT_H_RATIO)),
  };
}

// Re-renders the open window at its correctly clamped size on resize/rotate
// — getOpenSize() alone only reflects the viewport at the instant it's
// called, which without this would mean a phone rotated while a window is
// already open keeps the old orientation's size until something else
// happens to re-render.
function useOpenSize(): Size {
  const [size, setSize] = useState<Size>(getOpenSize);
  useEffect(() => {
    const onResize = () => setSize(getOpenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eioC = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eIn2 = (t: number) => t * t;

function renderGenie(
  ctx: CanvasRenderingContext2D,
  off: HTMLCanvasElement,
  rawT: number,
  dir: Dir,
  dock: Pt,
  win: Pt,
  size: Size,
) {
  // The row loop walks the fixed WIN_H reference resolution — that's the
  // snapshot's own real pixel height (see useSharedSnapshots) — but each
  // row's destination Y is placed proportionally within the *actual* open
  // size, so a window clamped smaller than the reference still gets warped
  // into exactly its own real footprint rather than overflowing past it.
  for (let y = 0; y < WIN_H; y++) {
    const r = y / WIN_H;
    const rowXStart = dir === 'minimize' ? (1 - r) * 0.65 : r * 0.65;
    const xP = clamp((rawT - rowXStart) / (1 - rowXStart), 0, 1);
    const xE = eioC(xP);
    const rowYStart = dir === 'minimize' ? (1 - r) * 0.2 : r * 0.2;
    const yP = clamp((rawT - rowYStart) / (1 - rowYStart), 0, 1);
    const yE = eIn2(yP);
    const rowY = r * size.h;
    let left: number, right: number, destY: number;
    if (dir === 'minimize') {
      left = lerp(win.x, dock.x, xE);
      right = lerp(win.x + size.w, dock.x, xE);
      destY = lerp(win.y + rowY, dock.y, yE);
    } else {
      left = lerp(dock.x, win.x, xE);
      right = lerp(dock.x, win.x + size.w, xE);
      destY = lerp(dock.y, win.y + rowY, yE);
    }
    const rowW = right - left;
    if (rowW < 0.8) continue;
    ctx.drawImage(off, 0, y, WIN_W, 1, left, destY, rowW, 1);
  }
}

// Per-app custom window content — an app listed here renders its own body
// instead of WindowChrome's generic "icon + label + coming soon" placeholder.
// Keyed by DockApp id (see the `dockApps` array in App.tsx) rather than
// added to the DockApp interface itself, since DockApp is plain dock/taskbar
// data and has no reason to know about window content.
const APP_BODIES: Record<
  string,
  ComponentType<{ interactive?: boolean; sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null> }>
> = {
  profile: ProfileApp,
  experience: ExperienceApp,
  email: EmailApp,
  spotify: SpotifyApp,
  certifications: CertificationsApp,
  projects: ProjectsApp,
};

export function WindowChrome({
  app,
  windowed,
  interactive,
  sceneCanvasRef,
  onClose,
  onMinimize,
  onToggleWindowed,
}: {
  app: DockApp;
  windowed?: boolean;
  interactive?: boolean;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onClose?: () => void;
  onMinimize?: () => void;
  onToggleWindowed?: () => void;
}) {
  const Icon = app.icon;
  const CustomBody = APP_BODIES[app.id];
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center px-4 shrink-0 relative overflow-hidden"
        style={{
          height: 42,
          background: 'linear-gradient(180deg, rgba(58,58,61,0.55), rgba(35,35,37,0.55))',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}
      >
        {/* Specular sheen — a soft highlight along the top edge, the same
            "liquid glass" cue used by MenuBar/MacDock/ControlCenterPanel's
            own glass panels, so this title bar reads as the same material
            rather than a plain blurred rectangle. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.14), transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
        <div className="flex items-center gap-2 z-10">
          <button
            type="button"
            aria-label="Close"
            disabled={!interactive}
            onClick={onClose}
            className="w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition"
            style={{ background: '#ff5f57', cursor: interactive ? 'pointer' : 'default' }}
          />
          <button
            type="button"
            aria-label="Minimize"
            disabled={!interactive}
            onClick={onMinimize}
            className="w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition"
            style={{ background: '#febc2e', cursor: interactive ? 'pointer' : 'default' }}
          />
          <button
            type="button"
            aria-label={windowed ? 'Fill screen' : 'Windowed'}
            disabled={!interactive}
            onClick={onToggleWindowed}
            className="w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition"
            style={{ background: '#28c840', cursor: interactive ? 'pointer' : 'default' }}
          />
        </div>
        <span
          className="absolute inset-x-0 text-center text-xs font-medium pointer-events-none"
          style={{ color: 'rgba(255,255,255,.55)' }}
        >
          {app.label}
        </span>
        {interactive && app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] text-white/40 hover:text-white/80 font-mono underline underline-offset-2"
          >
            open in new tab
          </a>
        )}
      </div>
      {CustomBody ? (
        <div className="flex-1 min-h-0 bg-white">
          <Suspense fallback={null}>
            <CustomBody interactive={interactive} sceneCanvasRef={sceneCanvasRef} />
          </Suspense>
        </div>
      ) : (
        <div className="flex-1 bg-white flex flex-col items-center justify-center gap-4 text-center px-6">
          <Icon className="w-16 h-16" />
          <div className="text-xl font-semibold text-[#1c1c1e]">{app.label}</div>
          {app.handle && <div className="text-black/50 font-mono text-xs">{app.handle}</div>}
          {app.url ? (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 rounded-full bg-[#1c1c1e] text-white text-sm font-medium hover:brightness-110 transition"
            >
              Open {app.label}
            </a>
          ) : (
            <div className="text-black/40 text-sm">Content coming soon</div>
          )}
        </div>
      )}
    </div>
  );
}

// toCanvas can resolve successfully with a canvas that has nothing actually
// painted on it. Drawing a blank canvas isn't an error anywhere downstream —
// the genie just warps invisible pixels and the tray tile looks fully
// transparent — so verify there really is opaque content before trusting it,
// by sampling a pixel inside the title bar, which is always a solid dark fill.
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext('2d');
    const x = Math.floor(canvas.width * 0.5);
    const y = Math.floor(canvas.height * 0.08);
    const alpha = ctx?.getImageData(x, y, 1, 1).data[3] ?? 0;
    return alpha <= 200;
  } catch {
    return true;
  }
}

/**
 * Captures every app's window-body snapshot exactly once, upfront — call
 * this once near the top of the app (not per session). Every AppWindow
 * instance then just reads from the shared result instead of capturing its
 * own: capturing per-session, right as each session opens, means the very
 * capture a fresh session's own opening genie needs is racing that same
 * genie, which starts in the same instant — there's a real chance the genie
 * runs its whole animation before the snapshot exists. Capturing all of them
 * once, early (while the loading screen is still up, well before anything
 * can be clicked), removes that race entirely.
 */
export function useSharedSnapshots(apps: DockApp[]) {
  const snapshotsRef = useRef<Record<string, HTMLCanvasElement>>({});
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const host = hostRef.current;
      if (!host) return;
      const nodes = Array.from(host.children) as HTMLDivElement[];
      // In parallel, not one-at-a-time — a sequential `for` + `await` here
      // meant an app with a lot of its own external images to embed (tech
      // icons, mostly) could hold up every app queued behind it, since the
      // next one's capture didn't even start until the previous one
      // finished (or hit its own 4s timeout). A visitor clicking a later
      // app soon after the page loads could easily open it before its
      // snapshot had its turn yet, landing on the genie's plain-rectangle
      // fallback instead of a real preview — intermittent, and worse the
      // more apps (and the more image-heavy ones) sit ahead of it in the
      // dock. Racing them all at once means one slow capture no longer
      // delays anything but itself.
      await Promise.allSettled(
        nodes.map(async (node, i) => {
          if (cancelled) return;
          try {
            const canvas = await Promise.race([
              toCanvas(node, { pixelRatio: 1, cacheBust: false, skipFonts: true }),
              // 4s was tuned for simple apps — logging confirmed Profile and
              // Experience (each embedding a couple dozen external
              // tech-stack icons) routinely blew past it and got no
              // snapshot at all, not because anything was broken but
              // because that's genuinely how long toCanvas needs to fetch
              // and embed that many images (confirmed they do finish,
              // sometime between 12s and 30s, once given the room). This is
              // a one-time background capture during the loading screen,
              // not something a user waits on, so there's little cost to
              // giving it real headroom.
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('snapshot timed out')), 20000)),
            ]);
            if (cancelled) return;
            if (!isCanvasBlank(canvas)) snapshotsRef.current[apps[i].id] = canvas;
          } catch {
            // that app just won't have a snapshot — its genie/tray tile fall
            // back to a plain icon block
          }
        })
      );
    };
    // A plain timeout, not requestAnimationFrame — rAF never fires at all in
    // a tab that isn't actively compositing (loaded in the background, or
    // deferred by the OS/browser's own power-saving heuristics), and this is
    // a one-time "capture this soon" operation, not a visual animation frame,
    // so it has no reason to depend on that in the first place.
    const handle = window.setTimeout(run, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [apps]);

  const host = (
    <div ref={hostRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
      {apps.map((a) => (
        <div key={a.id} style={{ width: WIN_W, height: WIN_H, borderRadius: 12, overflow: 'hidden' }}>
          <WindowChrome app={a} />
        </div>
      ))}
    </div>
  );

  return { snapshotsRef, host };
}

export default function AppWindow({
  app,
  originRect,
  trayRect,
  minimized,
  snapshotsRef,
  sceneCanvasRef,
  onMinimize,
  onRestore,
  onCloseComplete,
  onAnimatingChange,
}: {
  app: DockApp;
  originRect: DockRect;
  trayRect: DockRect | null;
  minimized: boolean;
  /** From useSharedSnapshots(), captured once upfront for every app — see
   * that hook's comment for why this isn't captured per-instance. */
  snapshotsRef: React.RefObject<Record<string, HTMLCanvasElement>>;
  /** The main 3D scene's own canvas — passed through to whichever app body
   * needs the same "glass over the scene" trick MenuBar/MacDock/
   * ControlCenterPanel already use (currently just SpotifyApp). */
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onMinimize: () => void;
  onRestore: () => void;
  /** Called once the close genie has fully played — the parent unmounts this
   * instance in response. Minimizing/restoring never call this; only an
   * explicit close does, which is what makes minimized sessions persistent. */
  onCloseComplete: () => void;
  onAnimatingChange?: (animating: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('opening');
  const [windowed, setWindowed] = useState(false);
  const [trayHovered, setTrayHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const genieTokenRef = useRef(0);
  const prevMinimized = useRef(minimized);
  const lastOriginRect = useRef(originRect);

  useEffect(() => {
    lastOriginRect.current = originRect;
  }, [originRect]);

  const getWinPos = useCallback((): Pt => {
    const { w, h } = getOpenSize();
    return { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2 };
  }, []);

  const setupCanvas = useCallback((dock: Pt, win: Pt, size: Size) => {
    const c = canvasRef.current;
    if (!c) return;
    const pad = 4;
    const left = Math.min(dock.x, win.x) - pad;
    const top = Math.min(dock.y, win.y) - pad;
    const w = Math.max(1, Math.max(dock.x, win.x + size.w) + pad - left);
    const h = Math.max(1, Math.max(dock.y, win.y + size.h) + pad - top);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.style.left = `${left}px`;
    c.style.top = `${top}px`;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.width = w * dpr;
    c.height = h * dpr;
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
  }, []);

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
  }, []);

  const runGenie = useCallback(
    (dock: Pt, dir: Dir, onSettle: () => void) => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(settleTimerRef.current);
      const token = ++genieTokenRef.current;
      const win = getWinPos();
      const size = getOpenSize();
      setupCanvas(dock, win, size);
      const off = snapshotsRef.current[app.id];
      onAnimatingChange?.(true);

      let settled = false;
      const settle = () => {
        if (settled || genieTokenRef.current !== token) return;
        settled = true;
        cancelAnimationFrame(rafRef.current);
        window.clearTimeout(settleTimerRef.current);
        onSettle();
        onAnimatingChange?.(false);
      };
      settleTimerRef.current = window.setTimeout(settle, DUR + 200);

      let start: number | null = null;
      const frame = (ts: number) => {
        if (start === null) start = ts;
        const rawT = clamp((ts - start) / DUR, 0, 1);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          clearCanvas();
          if (off) {
            renderGenie(ctx, off, rawT, dir, dock, win, size);
          } else {
            const t = dir === 'minimize' ? rawT : 1 - rawT;
            ctx.fillStyle = '#1c1c1e';
            ctx.fillRect(lerp(win.x, dock.x, t), lerp(win.y, dock.y, t), lerp(size.w, 4, t), lerp(size.h, 4, t));
          }
        }
        if (rawT < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          settle();
        }
      };
      rafRef.current = requestAnimationFrame(frame);
    },
    [getWinPos, setupCanvas, clearCanvas, onAnimatingChange],
  );

  const centerOf = (r: DockRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // Mount: genie open from the dock icon that launched this session. Runs
  // exactly once in production — this instance's `app` never changes for its
  // lifetime. (Not guarded with a "ran once" ref: React 18 StrictMode's dev-only
  // double-invoke simulates a full unmount+remount of this effect — a ref-based
  // guard survives that fake unmount [refs aren't reset by it] while a cleanup
  // that unconditionally cancels the in-flight rAF/timer does run during it,
  // which cancelled the pending settle with nothing left to reschedule it,
  // leaving the genie stuck mid-animation forever. Giving this effect its own
  // matching cleanup instead means the fake unmount simply cancels and the
  // following remount cleanly restarts — correct either way, and StrictMode's
  // double-invoke doesn't happen at all in production.)
  useEffect(() => {
    setPhase('opening');
    runGenie(centerOf(lastOriginRect.current), 'open', () => {
      flushSync(() => setPhase('open'));
      clearCanvas();
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(settleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to minimize/restore requested from outside (minimize button, dock
  // re-click, tray tile click). Set when minimize is requested but this
  // render's `trayRect` prop is still null — the tray slot only mounts once
  // `minimized` flips true, so on the very first minimize of a session
  // there's necessarily a render where the slot hasn't measured itself yet.
  // Rather than fall back to genie-ing at the origin icon in that case (which
  // is what was happening — the genie always missed the tray and landed on
  // the icon instead), wait for it: the dedicated effect below fires the
  // instant trayRect actually arrives.
  const pendingMinimizeRef = useRef(false);

  useEffect(() => {
    if (minimized === prevMinimized.current) return;
    prevMinimized.current = minimized;
    if (minimized) {
      setWindowed(false);
      if (trayRect) {
        setPhase('closing');
        runGenie(centerOf(trayRect), 'minimize', () => {
          setPhase('min');
          clearCanvas();
        });
      } else {
        pendingMinimizeRef.current = true;
      }
    } else {
      pendingMinimizeRef.current = false;
      setPhase('opening');
      const from = trayRect ?? lastOriginRect.current;
      runGenie(centerOf(from), 'open', () => {
        flushSync(() => setPhase('open'));
        clearCanvas();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized]);

  useEffect(() => {
    if (!pendingMinimizeRef.current || !trayRect) return;
    pendingMinimizeRef.current = false;
    setPhase('closing');
    runGenie(centerOf(trayRect), 'minimize', () => {
      setPhase('min');
      clearCanvas();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayRect]);

  const handleCloseClick = () => {
    setPhase('closing');
    runGenie(centerOf(lastOriginRect.current), 'minimize', () => {
      onCloseComplete();
    });
  };

  // Reactive to viewport resize/rotation (unlike getWinPos, which is only
  // read imperatively at the moment a genie animation starts) — this is what
  // keeps an already-open window's own size responsive.
  const openSize = useOpenSize();
  const winPos = { x: (window.innerWidth - openSize.w) / 2, y: (window.innerHeight - openSize.h) / 2 };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed pointer-events-none z-[100000]"
        style={{ display: phase === 'opening' || phase === 'closing' ? 'block' : 'none' }}
      />

      {phase === 'open' && (
        <div
          className="fixed shadow-2xl overflow-hidden pointer-events-auto z-[100000]"
          style={{
            transition: 'left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease, border-radius 0.3s ease',
            ...(windowed
              ? { left: 0, top: 0, width: '100vw', height: '100vh', borderRadius: 0 }
              : { left: winPos.x, top: winPos.y, width: openSize.w, height: openSize.h, borderRadius: 12 }),
          }}
        >
          <WindowChrome
            app={app}
            interactive
            windowed={windowed}
            sceneCanvasRef={sceneCanvasRef}
            onClose={handleCloseClick}
            onMinimize={onMinimize}
            onToggleWindowed={() => setWindowed((w) => !w)}
          />
        </div>
      )}

      {phase === 'min' && trayRect && (
        <button
          type="button"
          onClick={onRestore}
          onMouseEnter={() => setTrayHovered(true)}
          onMouseLeave={() => setTrayHovered(false)}
          // This tile sits directly on top of its own (invisible) dock-item
          // placeholder with a higher z-index, so it intercepts the real
          // mousemove entirely — the underlying dock-item never sees it, and
          // dockbar's own magnify engine only reacts to events that actually
          // reach its DOM subtree. Forwarding a synthetic mousemove to
          // whatever dock-item/dock-wrapper is sitting underneath (found via
          // elementsFromPoint, since elementFromPoint alone would just find
          // this very button again) is what lets hovering the tile itself
          // register at all — without this, only the gaps between tiles
          // (nothing covering the placeholder there) ever reached it.
          onMouseMove={(e) => {
            const under = document
              .elementsFromPoint(e.clientX, e.clientY)
              .find((el) => el.tagName === 'DOCK-ITEM' || el.tagName === 'DOCK-WRAPPER');
            under?.dispatchEvent(
              new MouseEvent('mousemove', { bubbles: true, composed: true, clientX: e.clientX, clientY: e.clientY }),
            );
          }}
          aria-label={`Restore ${app.label}`}
          className="fixed rounded-2xl overflow-hidden cursor-pointer pointer-events-auto border-0 p-0"
          style={{
            // Mirrors MacDock's own dock-item placeholder directly — that
            // element now lives inside the tray's own dock-wrapper, so its
            // real (possibly magnified) box IS this tile's box; no separate
            // scale/spring/lift math needed here at all, and the "lift as it
            // grows" look falls out for free from the library's own
            // real-height-growth + bottom-flex-alignment, the same way it
            // does for the regular icons.
            left: trayRect.left,
            top: trayRect.top,
            width: trayRect.width,
            height: trayRect.height,
            zIndex: trayHovered ? 100001 : 100000,
            // A guaranteed solid base layer — if the snapshot capture ever
            // produces something less than fully opaque despite the blank-
            // canvas check above (e.g. partial content), this still keeps the
            // tile from reading as "transparent" rather than a real preview.
            background: '#1c1c1e',
            boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
          }}
        >
          {snapshotsRef.current[app.id] ? (
            <img src={snapshotsRef.current[app.id].toDataURL()} alt="" className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <app.icon className="w-1/2 h-1/2" />
            </div>
          )}
        </button>
      )}
    </>
  );
}
