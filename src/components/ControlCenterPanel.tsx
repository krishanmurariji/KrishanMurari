// The dropdown that opens from the menu bar's Control Center button — a
// trimmed-down version of macOS's own Control Center: just the sections the
// user asked for (Display brightness, Sound, an appearance switch), not the
// full grid of Wi-Fi/Bluetooth/AirDrop/Do Not Disturb/AirPlay tiles the real
// one has. There was a "Now Playing" music card here too, but the desktop's
// Music widget got its own hover-to-expand vinyl-record redesign that
// doesn't fit a ~256px dropdown (it needs room to grow on hover) — rather
// than force a bad fit, it was dropped from here; the desktop widget is the
// one place to control playback now.
import { useRef } from 'react';
import type { SVGProps } from 'react';
import { GlassBackdrop } from './GlassBackdrop';
import { AnimatedThemeToggler } from './ui/animated-theme-toggler';

// Ray paths ordered so a 4-ray "half sun" subset (the first four: N/E/S/W)
// still reads as a clean, symmetric sun rather than a lopsided one.
const SUN_RAYS = [
  'M12 2v2.6',
  'M19.4 12H22',
  'M12 19.4V22',
  'M2 12h2.6',
  'M18 6l1.8-1.8',
  'M18 18l1.8 1.8',
  'M4.2 19.8l1.8-1.8',
  'M4.2 4.2l1.8 1.8',
];

// Full sun at high brightness, a 4-ray "half sun" at medium, and a bare dim
// disc at low — tied to the actual slider value instead of a fixed glyph.
function SunIcon({ level, ...props }: SVGProps<SVGSVGElement> & { level: number }) {
  const rayCount = level >= 66 ? 8 : level >= 30 ? 4 : 0;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" opacity={level >= 30 ? 1 : 0.55} />
      {SUN_RAYS.slice(0, rayCount).map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ))}
    </svg>
  );
}

// Two wave arcs at high volume, one at low, and a crossed-out speaker once
// muted — same tiering as the top-bar mute icon, driven by the slider value.
function SoundIcon({ level, ...props }: SVGProps<SVGSVGElement> & { level: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 9.3H6.8L11 6V18L6.8 14.7H4Z" fill="currentColor" />
      {level === 0 ? (
        <>
          <path d="M15.3 9.3L20 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M20 9.3L15.3 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M14.3 8.6C15.85 10.1 15.85 13.9 14.3 15.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          {level >= 50 && (
            <path d="M16.8 6.3C19.55 9 19.55 15 16.8 17.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  );
}

// The real Apple "Liquid Glass" trick: an empty layer whose own backdrop-filter
// grabs whatever's behind it, and whose regular `filter` then runs that grabbed
// image through an SVG displacement map — refracting it like actual glass,
// rather than just blurring + tinting it flat. Sourced from the well-known
// SVG-filter liquid-glass technique (feTurbulence → feGaussianBlur →
// feDisplacementMap). Only the panel body uses it — the slider fills and the
// theme-toggle badge used a gentler version of the same filter too, but
// combining it with their rounded-full clip left a faint square "light box"
// fringe at the curve's edge in Chromium, so those two now use a plain blur
// instead (see their own comments). Must sit behind the real content
// (sliders/text) as its own layer — running this filter on an element that
// also holds readable text would warp the text along with the background.
function LiquidGlassFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="cc-glass-distortion" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.006" numOctaves="2" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="0.025" result="blur" />
          <feDisplacementMap in="SourceGraphic" in2="blur" scale="95" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

// A thick, whole-bar-is-the-handle slider — the chunky filled-pill style used
// by MIUI/One UI quick-settings sliders, in place of a thin native <input
// type="range"> track with a small thumb. Drag anywhere across the bar (not
// just a thumb) to set the value. The fill itself is liquid glass — it warps
// whatever's rendered behind it (the panel's own refracted backdrop) through
// the gentler fill-scoped filter, tinted, rather than being a flat color —
// and the icon rides inside the bar, flipping to a contrasting color once
// the fill passes underneath it.
function ThickSlider({
  value,
  onChange,
  isLight,
  ariaLabel,
  icon,
}: {
  value: number;
  onChange: (v: number) => void;
  isLight?: boolean;
  ariaLabel: string;
  icon: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(pct * 100));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };
  const handlePointerUp = () => { draggingRef.current = false; };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(100, value + 5));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - 5));
  };

  const iconLit = value > 14; // fill has passed under the icon — flip its color for contrast

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="relative flex-1 h-10 rounded-full cursor-pointer touch-none select-none overflow-hidden outline-none"
      style={{ background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full overflow-hidden pointer-events-none"
        style={{ width: `${value}%`, transition: draggingRef.current ? 'none' : 'width 80ms ease-out' }}
      >
        {/* Liquid fill — a frosted-glass blur over the panel behind it,
            rather than sitting as a flat color block. Plain blur, not the
            distortion filter the panel background uses — combining that
            SVG filter with a rounded-full clip left a faint square "light
            box" fringe right at the curve's edge in Chromium, a known
            backdrop-filter + border-radius + custom-filter quirk. Its own
            rounded-full + overflow-hidden (not just the parent's) is what
            actually keeps this clipped cleanly. */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            isolation: 'isolate',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: isLight ? 'rgba(17,17,18,0.62)' : 'rgba(245,245,247,0.68)' }}
        />
      </div>
      <div
        className="absolute inset-0 flex items-center px-3 pointer-events-none"
        style={{ color: iconLit ? (isLight ? '#fff' : '#111') : isLight ? '#111' : '#fff' }}
      >
        {icon}
      </div>
    </div>
  );
}

export default function ControlCenterPanel({
  isLight,
  onSetLight,
  sceneCanvasRef,
  containerRef,
  brightness,
  onBrightnessChange,
  volume,
  onVolumeChange,
}: {
  isLight?: boolean;
  onSetLight: (isLight: boolean) => void;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  brightness: number;
  onBrightnessChange: (v: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}) {
  const textColor = isLight ? '#1a1a1c' : '#f0f0f2';

  return (
    <div
      className="relative w-64 rounded-[26px] overflow-hidden"
      style={{
        boxShadow: isLight
          ? '0 18px 44px rgba(0,0,0,0.22), 0 0 20px rgba(0,0,0,0.08)'
          : '0 18px 44px rgba(0,0,0,0.6), 0 0 20px rgba(0,0,0,0.3)',
        color: textColor,
      }}
    >
      <LiquidGlassFilterDefs />

      {/* Base: blurred snapshot of the scene behind the panel (see
          GlassBackdrop's own comment for why this is a manual canvas copy
          rather than backdrop-filter directly on the WebGL canvas). */}
      <div className="absolute inset-0 overflow-hidden rounded-[26px]">
        <GlassBackdrop sceneCanvasRef={sceneCanvasRef} containerRef={containerRef} pad={20} />
      </div>

      {/* Liquid-glass refraction — grabs that blurred snapshot as its own
          backdrop and warps it through the SVG displacement filter above,
          the same technique real macOS/iOS "Liquid Glass" chrome uses. */}
      <div
        className="absolute inset-0 rounded-[26px] pointer-events-none"
        style={{
          backdropFilter: 'blur(3px) url(#cc-glass-distortion)',
          WebkitBackdropFilter: 'blur(3px)',
          isolation: 'isolate',
          overflow: 'hidden',
        }}
      />

      {/* Frosted tint over the refracted backdrop. */}
      <div
        className="absolute inset-0 rounded-[26px] pointer-events-none"
        style={{
          background: isLight
            ? 'linear-gradient(165deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.24) 100%)'
            : 'linear-gradient(165deg, rgba(70,70,76,0.46) 0%, rgba(15,15,17,0.38) 100%)',
          backdropFilter: 'saturate(160%)',
          WebkitBackdropFilter: 'saturate(160%)',
        }}
      />

      {/* Shine — the thin inner highlight real glass edges catch. */}
      <div
        className="absolute inset-0 rounded-[26px] pointer-events-none"
        style={{
          boxShadow: isLight
            ? 'inset 1.5px 1.5px 1px 0 rgba(255,255,255,0.8), inset -1px -1px 1px 1px rgba(255,255,255,0.4)'
            : 'inset 1.5px 1.5px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 1px 1px rgba(255,255,255,0.08)',
        }}
      />

      <div className="relative z-10 p-3 flex flex-col gap-2.5">
        <div>
          <div className="text-[11px] font-semibold mb-1.5 opacity-80 px-1">Display</div>
          <div className="flex items-center gap-2">
            <ThickSlider
              value={brightness}
              onChange={onBrightnessChange}
              isLight={isLight}
              ariaLabel="Brightness"
              icon={<SunIcon level={brightness} className="w-4 h-4 shrink-0" />}
            />
            {/* Theme toggle lives here now — same circular badge slot/ratio
                the big Display icon used, and the same frosted-glass
                material as the slider fills (plain blur, not the distortion
                filter — see ThickSlider's own comment on why: that filter
                combined with a rounded-full clip left a faint square "light
                box" fringe at the edge in Chromium). */}
            <div className="relative w-10 h-10 rounded-full shrink-0 overflow-hidden">
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                  isolation: 'isolate',
                }}
              />
              <div
                className="absolute inset-0"
                style={{ background: isLight ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)' }}
              />
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: isLight
                    ? 'inset 1px 1px 1px 0 rgba(255,255,255,0.85), inset -1px -1px 1px 1px rgba(255,255,255,0.4)'
                    : 'inset 1px 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 1px 1px rgba(255,255,255,0.08)',
                }}
              />
              <div
                className="relative z-10 flex items-center justify-center w-full h-full"
                style={{ color: isLight ? '#4a4a4e' : '#e8e8ec' }}
              >
                <AnimatedThemeToggler
                  theme={isLight ? 'light' : 'dark'}
                  onThemeChange={(t) => onSetLight(t === 'light')}
                  iconSize={20}
                  className="flex items-center justify-center hover:opacity-70 active:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold mb-1.5 opacity-80 px-1">Sound</div>
          <ThickSlider
            value={volume}
            onChange={onVolumeChange}
            isLight={isLight}
            ariaLabel="Volume"
            icon={<SoundIcon level={volume} className="w-4 h-4 shrink-0" />}
          />
        </div>
      </div>
    </div>
  );
}
