// A WhatsApp/iMessage-style "hold to record" voice button — tap toggles
// recording on/off, holding past `holdAfter` opens the pill into a wider
// waveform+timer view and arms slide-to-cancel, matching real messaging
// apps' voice-message gesture rather than a plain click toggle.
//
// `reactive="simulated"` (the only mode implemented here) means the
// waveform is a smoothed random walk rather than real microphone level
// metering (which would need getUserMedia + an AnalyserNode) — `attack`/
// `release` still do real work as the walk's rise/fall time constants,
// `sensitivity`/`floor` still scale and clamp it, just against a synthetic
// signal instead of live audio.
import { useEffect, useRef, useState } from 'react';

type StopReason = 'released' | 'cancelled' | 'toggle';

interface VoicePillProps {
  accentColor?: string;
  iconColor?: string;
  background?: string;
  size?: number;
  shape?: 'pill' | 'circle';
  reach?: number;
  showTime?: boolean;
  waveform?: boolean;
  slideToCancel?: boolean;
  cancelDistance?: number;
  attack?: number;
  release?: number;
  sensitivity?: number;
  floor?: number;
  openDuration?: number;
  pressScale?: number;
  mode?: 'auto' | 'hold' | 'tap';
  holdAfter?: number;
  reactive?: 'simulated' | 'live';
  disabled?: boolean;
  onStart?: (info: { source: 'tap' | 'hold' }) => void;
  onStop?: (info: { reason: StopReason; duration: number }) => void;
  className?: string;
}

const WAVE_BARS = 5;
const WAVE_TICK_MS = 120;

function MicGlyph({ color, size }: { color: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function VoicePill({
  accentColor = '#f5f5f5',
  iconColor = '#a1a1aa',
  background = '#27272a',
  size = 28,
  shape = 'pill',
  reach = 8,
  showTime = true,
  waveform = true,
  slideToCancel = true,
  cancelDistance = 64,
  attack = 40,
  release = 240,
  sensitivity = 1,
  floor = 0.1,
  openDuration = 200,
  pressScale = 0.95,
  mode = 'auto',
  holdAfter = 300,
  reactive = 'simulated',
  disabled = false,
  onStart,
  onStop,
  className,
}: VoicePillProps) {
  const [pressed, setPressed] = useState(false);
  const [active, setActive] = useState(false); // actually recording (post tap-toggle or post hold threshold)
  const [expanded, setExpanded] = useState(false); // the "opened" wide pill view (hold mode only)
  const [dragX, setDragX] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(WAVE_BARS).fill(floor));

  const holdTimerRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const sourceRef = useRef<'tap' | 'hold'>('tap');
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const waveTargetsRef = useRef<number[]>(Array(WAVE_BARS).fill(floor));
  const lastTickRef = useRef(0);
  const lastFrameRef = useRef(0);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const beginRecording = (source: 'tap' | 'hold') => {
    sourceRef.current = source;
    startedAtRef.current = performance.now();
    setActive(true);
    setElapsedMs(0);
    onStart?.({ source });
  };

  const endRecording = (reason: StopReason) => {
    if (!active) return;
    const duration = performance.now() - startedAtRef.current;
    setActive(false);
    setExpanded(false);
    setCancelling(false);
    setDragX(0);
    onStop?.({ reason, duration: Math.round(duration) });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    // currentTarget (the outer <button> the handler is attached to), never
    // target: target for this initial press is whatever's rendered inside
    // right now (the mic icon), and that swaps out for the waveform/timer
    // view once the pill opens. Capturing on an element that then
    // unmounts silently drops the capture — and once dropped, a pointerup
    // delivered while the cursor has slid outside the button's bounds
    // (exactly what slide-to-cancel does) never reaches this handler at
    // all, leaving the pill stuck "recording" forever with no way to stop
    // it. The button itself is stable across that swap, so capturing
    // there survives it.
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    startXRef.current = e.clientX;
    setDragX(0);
    setCancelling(false);

    if (active) {
      // Already recording from a prior tap-toggle — a fresh press just
      // stops it (tap-to-stop), no new hold timer needed.
      return;
    }

    if (mode === 'tap') {
      beginRecording('tap');
      return;
    }
    if (mode === 'hold') {
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        setExpanded(true);
        beginRecording('hold');
      }, holdAfter);
      return;
    }
    // 'auto' — disambiguated on release: a quick tap toggles, a press held
    // past holdAfter opens into the recording view on its own.
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      setExpanded(true);
      beginRecording('hold');
    }, holdAfter);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressed) return;
    const dx = e.clientX - startXRef.current;
    if (active && slideToCancel) {
      setDragX(dx);
      setCancelling(Math.abs(dx) >= cancelDistance);
    }
  };

  const handlePointerUp = () => {
    if (!pressed) return;
    setPressed(false);
    clearHoldTimer();

    if (active) {
      endRecording(cancelling ? 'cancelled' : sourceRef.current === 'hold' ? 'released' : 'toggle');
      return;
    }
    // Timer never fired (released before holdAfter) — in 'auto'/'tap'
    // mode this is a simple tap-to-start; the *next* press will stop it.
    if (mode !== 'hold') {
      beginRecording('tap');
    }
  };

  // Simulated waveform: a smoothed random walk, new random targets every
  // WAVE_TICK_MS, eased toward each frame with attack/release as the
  // rise/fall time constants (attack when climbing toward a higher target,
  // release when falling back), clamped to [floor, 1] and scaled by
  // sensitivity.
  useEffect(() => {
    if (!active || !waveform || reactive !== 'simulated') {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTickRef.current = 0;
    lastFrameRef.current = performance.now();
    const frame = (t: number) => {
      const dt = t - lastFrameRef.current;
      lastFrameRef.current = t;
      if (t - lastTickRef.current > WAVE_TICK_MS) {
        lastTickRef.current = t;
        waveTargetsRef.current = waveTargetsRef.current.map(() => floor + Math.random() * (1 - floor) * sensitivity);
      }
      setLevels((prev) =>
        prev.map((v, i) => {
          const target = waveTargetsRef.current[i];
          const tau = target > v ? attack : release;
          const k = 1 - Math.exp(-dt / Math.max(tau, 1));
          return Math.min(1, Math.max(floor, v + (target - v) * k));
        })
      );
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, waveform, reactive, attack, release, sensitivity, floor]);

  // Elapsed-time ticker for showTime.
  useEffect(() => {
    if (!active || !showTime) return;
    const id = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 200);
    return () => window.clearInterval(id);
  }, [active, showTime]);

  useEffect(() => clearHoldTimer, []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const isOpen = expanded && active;
  const dragRatio = slideToCancel ? Math.min(1, Math.abs(dragX) / cancelDistance) : 0;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={active ? 'Stop recording' : 'Record voice message'}
      aria-pressed={active}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isOpen ? 'flex-start' : 'center',
        gap: 8,
        height: size,
        width: isOpen ? size + reach * 8 : size,
        padding: isOpen ? '0 10px' : 0,
        borderRadius: shape === 'pill' ? size : '9999px',
        background: active ? accentColor : background,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transform: `scale(${pressed && !isOpen ? pressScale : 1}) translateX(${isOpen ? dragX * 0.3 : 0}px)`,
        opacity: cancelling ? 0.5 : 1,
        transition: `width ${openDuration}ms ease, opacity 150ms ease, transform 120ms ease, background 150ms ease`,
        touchAction: 'none',
      }}
    >
      {!isOpen && <MicGlyph color={active ? background : iconColor} size={size * 0.55} />}

      {isOpen && (
        <>
          <span style={{ width: 8, height: 8, borderRadius: '9999px', background: '#ff5f57', flexShrink: 0 }} />
          {showTime && (
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: background, flexShrink: 0 }}>
              {formatTime(elapsedMs)}
            </span>
          )}
          {waveform && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, height: '100%' }}>
              {levels.map((v, i) => (
                <span
                  key={i}
                  style={{
                    width: 2.5,
                    borderRadius: 2,
                    background: background,
                    height: `${Math.max(15, v * 100)}%`,
                    transition: 'height 60ms linear',
                  }}
                />
              ))}
            </span>
          )}
          {slideToCancel && (
            <span style={{ fontSize: 11, color: background, opacity: 0.8 - dragRatio * 0.4, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {cancelling ? 'Release to cancel' : '← Slide to cancel'}
            </span>
          )}
        </>
      )}
    </button>
  );
}
