// A tiny real-3D robot mascot for the chat header — same stack (three.js /
// @react-three/fiber / drei) as the hero Rubik's cube scene, built from
// plain primitives rather than an imported model file (no external asset,
// no licensing question). Deliberately mounted just once, in the chat
// header only — the per-message avatars stay the flat SVG version
// (RobotAvatar.tsx) rather than each spinning up their own WebGL context,
// since browsers cap how many of those a page can hold at once and a
// message-per-context 3D scene would be real, unbounded GPU cost for a
// decorative detail.
//
// A single hovering metal ball with one big mechanical camera-eye — no
// separate head/body/limbs — modeled after a CodePen reference
// (codepen.io/verlangieri/pen/xEyprg) whose actual source (recovered from
// its GitHub repo, since the pen's own asset CDN is long dead) turned out
// to be exactly this: a "boule" (ball) mesh with an eye assembly built
// from a ringed lens housing, small rivet tabs, and two eyelid shutters —
// no arms, legs, mouth, or eyebrows at all. The lens's radiating aperture-
// blade iris is drawn at runtime onto a canvas and used as a texture
// (createIrisTexture below) rather than shipping the reference's actual
// image, so there's still no external asset. Expression is carried
// entirely by the eye: eyelid aperture (how far the shutters retract) and
// iris tint, rather than a mouth/eyebrows this character doesn't have.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

export type BotExpression = 'normal' | 'happy' | 'thinking' | 'angry';

const SHELL_COLOR = '#f4f7fa';
const RING_COLOR = '#1f4b57';
const SOCKET_COLOR = '#12181f';
const TAB_COLOR = '#c7ccd3';
const GLOW_COLOR = '#eaffff';
const IRIS_TINT_NORMAL = '#4bb8d1';
const IRIS_TINT_HAPPY = '#5fd6c8';
const IRIS_TINT_THINKING = '#3f92a8';
const IRIS_TINT_ANGRY = '#e8623f';
const STAR_COLOR = '#ffd54f';

// The whole character is one sphere — no separate head/body groups.
const BALL_RADIUS = 0.64;

// The eye assembly (socket ring, tabs, iris, glow rim, eyelids) is a flat
// disc stack mounted right at the ball's own front pole (EYE_Z ==
// BALL_RADIUS, the tangent point) rather than sunk into the curve at some
// shallower depth — the sphere's own surface reaches z=BALL_RADIUS only at
// that single center point, so a flat disc mounted there stays in front of
// the ball's surface everywhere else across its whole radius instead of
// the ball's own bulge occluding it. The reference's eye opening is
// roughly two-thirds of the ball's own diameter, a huge dominant "cyclops
// lens" rather than a modest feature.
const EYE_Z = BALL_RADIUS;
const SOCKET_R = BALL_RADIUS * 0.58;
const RING_R = SOCKET_R * 0.86;
const RING_TUBE = SOCKET_R * 0.1;
const IRIS_R = SOCKET_R * 0.74;
const TAB_COUNT = 7;
const TAB_R = SOCKET_R * 0.09;

// Eyelid shutters: flattened dome caps in the same shell color as the
// ball, sliding along Y to retract near the socket rim (open) or meet at
// the center (closed) — a simplified stand-in for the reference's actual
// hinged Eyelid-top/Eyelid-bottom parts, animated the same way (covering
// the lens rather than the iris itself scaling down). Both offsets stay
// within SOCKET_R so the lids read as sliding across the eye opening
// rather than floating off the ball entirely.
const LID_R = SOCKET_R * 1.02;
const LID_CLOSED_Y = SOCKET_R * 0.18;
const LID_OPEN_Y = SOCKET_R * 0.92;

// A "flying robot descends and settles" entrance, played once from each
// mount (t=0 on the character's own Canvas clock): a damped spring pulls
// the character down from above rest height, overshoots past it, and
// bounces to a stop — rather than a plain fade/pop into the idle pose.
// INTRO_LOOK_FADE staggers the mouse-look in behind it, so the character
// visibly "wakes up" before it starts tracking the cursor.
const INTRO_DROP_HEIGHT = 1.6;
const INTRO_DECAY = 3.2;
const INTRO_FREQ = 7.5;
const INTRO_LOOK_FADE = 1.3;

const BLINK_INTERVAL = 3.4;
const BLINK_DURATION = 0.22;

interface ExpressionTarget {
  lidOpen: number; // 0 = shut, 1 = fully retracted/open
  lidTilt: number; // z-rotation applied to both lids together, for a glare
  irisColor: string;
  stars: number; // 0 = hidden, 1 = fully visible orbiting the ball
}

const EXPRESSION_TARGETS: Record<BotExpression, ExpressionTarget> = {
  normal: { lidOpen: 1, lidTilt: 0, irisColor: IRIS_TINT_NORMAL, stars: 0 },
  // A gentle happy "squint" — the eye doesn't fully open, reading as a
  // relaxed/smiling look the way a single camera-eye can smile.
  happy: { lidOpen: 0.82, lidTilt: 0, irisColor: IRIS_TINT_HAPPY, stars: 0 },
  // A slow half-lidded, faintly dimmed eye — a considering, waiting look.
  thinking: { lidOpen: 0.55, lidTilt: 0.08, irisColor: IRIS_TINT_THINKING, stars: 0 },
  // A narrowed, tilted glare plus a warm-red iris and a little ring of
  // confusion stars — a bad/rejected input reads as "Om is annoyed",
  // conveyed entirely through the eye since this character has no mouth.
  angry: { lidOpen: 0.42, lidTilt: 0.22, irisColor: IRIS_TINT_ANGRY, stars: 1 },
};

// How quickly the smoothed values above chase their targets each frame —
// higher is snappier, lower is more of a slow morph. Tuned to settle in
// roughly a quarter second at 60fps.
const EXPRESSION_LERP = 0.14;

// The reference's lens is a radiating camera-aperture pattern (bright
// blades fanning out from a dark pupil) rather than a flat iris — drawn
// here at runtime onto a canvas rather than shipping that image as an
// asset, then mapped onto the iris disc and tinted per expression via the
// material's own color.
function createIrisTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  ctx.fillStyle = '#0d2e38';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const blades = 28;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < blades; i++) {
    const a0 = (i / blades) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / blades) * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.96, a0, a1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#05070a';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function Bot({ reducedMotion, expression, trackMouse }: { reducedMotion: boolean; expression: BotExpression; trackMouse?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const topLid = useRef<THREE.Group>(null);
  const bottomLid = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Group>(null);

  const shellMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: SHELL_COLOR, roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3 }), []);
  const socketMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SOCKET_COLOR, roughness: 0.4, metalness: 0.2 }), []);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ color: RING_COLOR, roughness: 0.35, metalness: 0.5 }), []);
  const tabMat = useMemo(() => new THREE.MeshStandardMaterial({ color: TAB_COLOR, roughness: 0.3, metalness: 0.6 }), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: GLOW_COLOR }), []);
  const irisTexture = useMemo(() => createIrisTexture(), []);
  const irisMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: irisTexture, color: IRIS_TINT_NORMAL, emissive: IRIS_TINT_NORMAL, emissiveIntensity: 0.4, roughness: 0.2 }),
    [irisTexture],
  );
  const starMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STAR_COLOR, emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 }), []);

  const smoothed = useRef<{ lidOpen: number; lidTilt: number; stars: number; irisColorObj: THREE.Color }>({
    lidOpen: EXPRESSION_TARGETS.normal.lidOpen,
    lidTilt: EXPRESSION_TARGETS.normal.lidTilt,
    stars: EXPRESSION_TARGETS.normal.stars,
    irisColorObj: new THREE.Color(IRIS_TINT_NORMAL),
  });

  // Normalized (-1..1) window-relative mouse position, updated by a plain
  // listener rather than per-frame polling — the ball only needs to react
  // when the mouse actually moves, and reading window.event state inside
  // useFrame would mean tracking it globally some other way anyway.
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseSmoothed = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!trackMouse) return;
    const handleMove = (e: MouseEvent) => {
      mouseTarget.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [trackMouse]);

  const tabAngles = useMemo(() => Array.from({ length: TAB_COUNT }, (_, i) => (i / TAB_COUNT) * Math.PI * 2), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (!group.current || !topLid.current || !bottomLid.current || !stars.current) return;

    // Chase this frame's expression target regardless of reduced-motion —
    // this is a state change the visitor needs to see, not ambient idle
    // motion, so it isn't gated behind that preference the way the bob/tilt
    // below are.
    const target = EXPRESSION_TARGETS[expression];
    const s = smoothed.current;
    const lerp = (a: number, b: number) => a + (b - a) * EXPRESSION_LERP;
    s.lidOpen = lerp(s.lidOpen, target.lidOpen);
    s.lidTilt = lerp(s.lidTilt, target.lidTilt);
    s.stars = lerp(s.stars, target.stars);
    s.irisColorObj.lerp(new THREE.Color(target.irisColor), EXPRESSION_LERP);
    irisMat.color.copy(s.irisColorObj);
    irisMat.emissive.copy(s.irisColorObj);

    stars.current.scale.setScalar(s.stars);
    stars.current.rotation.y = t * 1.6;

    // A blink briefly overrides the expression's own lid aperture — a
    // quick full close-then-open pulse on top of whatever the current
    // expression's resting aperture is.
    const cyclePos = t % BLINK_INTERVAL;
    const blinkStart = BLINK_INTERVAL - BLINK_DURATION;
    let blink = 0;
    if (cyclePos > blinkStart) { blink = Math.sin(((cyclePos - blinkStart) / BLINK_DURATION) * Math.PI); }
    const lidOpenNow = reducedMotion ? target.lidOpen : s.lidOpen * (1 - blink);

    const lidY = LID_CLOSED_Y + lidOpenNow * (LID_OPEN_Y - LID_CLOSED_Y);
    topLid.current.position.y = lidY;
    bottomLid.current.position.y = -lidY;
    topLid.current.rotation.z = s.lidTilt;
    bottomLid.current.rotation.z = -s.lidTilt;

    if (reducedMotion) {
      group.current.rotation.set(0, 0, 0);
      group.current.position.y = 0;
      return;
    }

    group.current.rotation.z = Math.sin(t * 0.55) * 0.035;
    group.current.position.y = Math.sin(t * 0.85) * 0.03;

    // Damped-spring "descend and settle" entrance, layered on top of the
    // idle bob above — decays to a negligible fraction of INTRO_DROP_HEIGHT
    // within ~1.5s of mount and is never explicitly turned off.
    group.current.position.y += INTRO_DROP_HEIGHT * Math.exp(-INTRO_DECAY * t) * Math.cos(INTRO_FREQ * t);

    // "Look at the cursor" — the whole ball leans/turns toward wherever
    // the mouse is on the page, opt-in via `trackMouse` (the docked/panel
    // bot instances don't want the visitor's cursor stealing focus from
    // the conversation itself). Eased toward the raw target rather than
    // snapped straight to it, and faded in over INTRO_LOOK_FADE so the
    // character visibly wakes up before it starts tracking the cursor.
    const mouseTargetX = trackMouse ? mouseTarget.current.x : 0;
    const mouseTargetY = trackMouse ? mouseTarget.current.y : 0;
    mouseSmoothed.current.x += (mouseTargetX - mouseSmoothed.current.x) * 0.06;
    mouseSmoothed.current.y += (mouseTargetY - mouseSmoothed.current.y) * 0.06;
    const lookFade = Math.min(1, t / INTRO_LOOK_FADE);
    const mx = mouseSmoothed.current.x * lookFade;
    const my = mouseSmoothed.current.y * lookFade;
    group.current.rotation.y = mx * 0.5;
    group.current.rotation.x = -my * 0.2;
  });

  return (
    <group ref={group}>
      <mesh material={shellMat}><sphereGeometry args={[BALL_RADIUS, 32, 32]} /></mesh>

      {/* Eye assembly — socket recess, ribbed contour ring with rivet
          tabs, the iris lens, a bright outer glow rim, and two eyelid
          shutters, all mounted on the ball's front face. */}
      <group position={[0, 0, EYE_Z]}>
        <mesh material={socketMat}><circleGeometry args={[SOCKET_R, 32]} /></mesh>
        <mesh material={ringMat} position={[0, 0, 0.01]}><torusGeometry args={[RING_R, RING_TUBE, 12, 32]} /></mesh>
        {tabAngles.map((a) => (
          <mesh
            key={a}
            material={tabMat}
            position={[Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0.015]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[TAB_R, TAB_R, RING_TUBE * 1.4, 8]} />
          </mesh>
        ))}
        <mesh material={irisMat} position={[0, 0, 0.025]}><circleGeometry args={[IRIS_R, 32]} /></mesh>
        <mesh material={glowMat} position={[0, 0, 0.03]}>
          <ringGeometry args={[IRIS_R * 1.04, IRIS_R * 1.16, 32]} />
        </mesh>

        <group ref={topLid} position={[0, LID_OPEN_Y, 0.05]}>
          <mesh material={shellMat} scale={[1, 0.55, 0.6]}><sphereGeometry args={[LID_R, 24, 16]} /></mesh>
        </group>
        <group ref={bottomLid} position={[0, -LID_OPEN_Y, 0.05]}>
          <mesh material={shellMat} scale={[1, 0.55, 0.6]}><sphereGeometry args={[LID_R, 24, 16]} /></mesh>
        </group>
      </group>

      <group ref={stars} position={[0, BALL_RADIUS * 1.15, 0]} scale={0}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(angle) * 0.55, Math.sin(angle) * 0.1, Math.sin(angle) * 0.4]} material={starMat}>
              <octahedronGeometry args={[0.05, 0]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export default function RobotAvatar3D({ className, expression = 'normal', trackMouse = false }: { className?: string; expression?: BotExpression; trackMouse?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0.02, 4.6], fov: 32 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} frameloop={reducedMotion ? 'demand' : 'always'}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.4} />
        <directionalLight position={[-2, -1, 1.5]} intensity={0.4} />
        <Bot reducedMotion={reducedMotion} expression={expression} trackMouse={trackMouse} />
      </Canvas>
    </div>
  );
}
