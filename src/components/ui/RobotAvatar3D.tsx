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
// A full chibi character (round head + torso + arms + legs), not just a
// head: big round teal eyes with a dark outline ring, orange ears and
// antenna tips, and a white glossy body with orange joints/feet accents.
// Head details (eyes, brows, mouth, blush, antenna, stars) live in their
// own local coordinate space inside a head group offset up by
// HEAD_Y_OFFSET; the body is built as siblings below it in the same
// animated outer group, so the existing idle bob/tilt sways the whole
// character together for free.
//
// Expressions: `expression` drives four states — 'normal' (default idle),
// 'happy' (the big welcoming grin shown right when the chat opens),
// 'thinking' (waiting on the API), and 'angry' (a validation/security
// rejection, paired with a little ring of "seeing stars" confusion sparkles
// orbiting the head). Rather than swapping geometry, the same
// eyebrow/mouth/color/star values are just smoothly lerped every frame
// toward per-expression targets (see EXPRESSION_TARGETS), so switching
// states reads as an expression change rather than a jump-cut.
import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

export type BotExpression = 'normal' | 'happy' | 'thinking' | 'angry';

const HEAD_COLOR = '#f4f7fa';
const ACCENT_COLOR = '#f28c28';
const JOINT_COLOR = '#2a3140';
const SILVER_COLOR = '#c7ccd3';
const EYE_RING_COLOR = '#26323f';
const EYE_IRIS_COLOR = '#4bb8d1';
const EYE_IRIS_DARK_COLOR = '#1f5c6b';
const BLUSH_COLOR = '#ffb3c6';
const BROW_COLOR = '#2a3140';
const MOUTH_COLOR = '#2a3140';
const STAR_COLOR = '#ffd54f';

// The head group's vertical offset in the outer (whole-character) space —
// everything inside it (eyes, brows, mouth, ears, antenna, blush, stars)
// keeps the same head-local coordinates a plain head used, just carried up
// to sit above the new body.
const HEAD_Y_OFFSET = 0.72;

// The reference character's body is quite small under a huge head — rather
// than hand-recompute every body coordinate, the whole body block is
// wrapped in one scaled group (see the JSX below). Scaling happens around
// the neck join (BODY_ANCHOR_Y, the body's own top) rather than the world
// origin, so the neck stays put and everything below it shrinks toward it;
// BODY_GROUP_Y is the resulting group offset for that anchor math.
const BODY_SCALE = 0.68;
const BODY_ANCHOR_Y = 0.08;
const BODY_GROUP_Y = BODY_ANCHOR_Y * (1 - BODY_SCALE);

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
const MOUTH_ARC = Math.PI * 0.85;
// A torus arc segment centered at local angle 3π/2 (the bottom of the ring)
// draws a downward-curving "cup" — a smile. Centering it at π/2 (the top)
// instead draws an upward-curving "cap" — a frown. Lerping the center
// between these two is a cheap, continuous smile↔frown morph with no need
// for separate geometry per expression.
const MOUTH_CENTER_SMILE = (3 * Math.PI) / 2;
const MOUTH_CENTER_FROWN = Math.PI / 2;

interface ExpressionTarget {
  browLZ: number;
  browRZ: number;
  browLY: number;
  browRY: number;
  browCurve: number; // 0 = straight bar, 1 = gently arched
  mouthFlip: number; // 0 = smile, 1 = frown
  mouthScaleX: number;
  mouthScaleY: number;
  mouthColor: string;
  browColor: string;
  blush: number;
  stars: number; // 0 = hidden, 1 = fully visible orbiting the head
}

// How far each eyebrow's two segments pivot apart to form an arch — 0 curve
// leaves them collinear (a straight bar), matching the "straight" angry
// brow the curve target drops to.
const BROW_BEND = 0.26;

// The reference's antennae arc outward rather than standing straight up —
// this is each stalk's rest tilt, with the idle sway added on top of it.
const ANTENNA_BASE_TILT = 0.3;

const EXPRESSION_TARGETS: Record<BotExpression, ExpressionTarget> = {
  normal: {
    browLZ: 0,
    browRZ: 0,
    browLY: 0.29,
    browRY: 0.29,
    browCurve: 1,
    mouthFlip: 0,
    mouthScaleX: 1,
    mouthScaleY: 1,
    mouthColor: MOUTH_COLOR,
    browColor: BROW_COLOR,
    blush: 0.55,
    stars: 0,
  },
  // The big welcome grin — a bigger, rounder smile and gently arched brows,
  // shown right when the chat panel opens.
  happy: {
    browLZ: -0.08,
    browRZ: 0.08,
    browLY: 0.305,
    browRY: 0.305,
    browCurve: 1,
    mouthFlip: 0,
    mouthScaleX: 1.25,
    mouthScaleY: 1.15,
    mouthColor: MOUTH_COLOR,
    browColor: BROW_COLOR,
    blush: 0.75,
    stars: 0,
  },
  // A quizzical, one-eyebrow-raised look with a small pursed mouth.
  thinking: {
    browLZ: -0.05,
    browRZ: 0.32,
    browLY: 0.29,
    browRY: 0.34,
    browCurve: 1,
    mouthFlip: 0,
    mouthScaleX: 0.55,
    mouthScaleY: 0.55,
    mouthColor: MOUTH_COLOR,
    browColor: BROW_COLOR,
    blush: 0.35,
    stars: 0,
  },
  // A sharp inward "V" brow, a flipped/reddened mouth, and a little ring of
  // confusion stars circling the head — a bad/rejected input reads as "Om
  // is confused and a bit annoyed", not just a flat error color.
  angry: {
    browLZ: 0.5,
    browRZ: -0.5,
    browLY: 0.25,
    browRY: 0.25,
    browCurve: 0,
    mouthFlip: 1,
    mouthScaleX: 1,
    mouthScaleY: 1,
    mouthColor: '#ff8a65',
    browColor: '#7a2e2e',
    blush: 0.8,
    stars: 1,
  },
};

// How quickly the smoothed values above chase their targets each frame —
// higher is snappier, lower is more of a slow morph. Tuned to settle in
// roughly a quarter second at 60fps.
const EXPRESSION_LERP = 0.14;

function Eye({ eyeRef, x, ringMat, irisMat, irisDarkMat, pupilMat, sparkleMat }: {
  eyeRef: RefObject<THREE.Group | null>;
  x: number;
  ringMat: THREE.Material;
  irisMat: THREE.Material;
  irisDarkMat: THREE.Material;
  pupilMat: THREE.Material;
  sparkleMat: THREE.Material;
}) {
  return (
    <group ref={eyeRef} position={[x, 0.05, 0.52]}>
      <mesh material={ringMat}><sphereGeometry args={[0.2, 24, 24]} /></mesh>
      <mesh position={[0, 0, 0.05]} material={irisMat}><sphereGeometry args={[0.17, 20, 20]} /></mesh>
      {/* A darker inner ring between the iris and pupil approximates the
          reference's gradient glassy iris (light teal fading to navy near
          the pupil) with two flat tones instead of a real shader. */}
      <mesh position={[0.006, -0.01, 0.09]} material={irisDarkMat}><sphereGeometry args={[0.125, 18, 18]} /></mesh>
      <mesh position={[0.012, -0.02, 0.135]} material={pupilMat}><sphereGeometry args={[0.085, 16, 16]} /></mesh>
      <mesh position={[0.05, 0.05, 0.175]} material={sparkleMat}><sphereGeometry args={[0.034, 8, 8]} /></mesh>
    </group>
  );
}

// Each eyebrow is two thin segments meeting at a shared center pivot rather
// than one solid bar: pivoting the segments apart draws a gentle arch, and
// bringing them back to 0 collapses them into one straight line — the same
// geometry morphs between "curved" (normal/happy/thinking) and "straight"
// (angry) rather than swapping shapes.
const BROW_SEG_LEN = 0.11;

function Eyebrow({ tiltRef, segARef, segBRef, x, mat }: {
  tiltRef: RefObject<THREE.Group | null>;
  segARef: RefObject<THREE.Group | null>;
  segBRef: RefObject<THREE.Group | null>;
  x: number;
  mat: THREE.Material;
}) {
  return (
    <group ref={tiltRef} position={[x, 0.29, 0.5]}>
      <group ref={segARef}>
        <mesh position={[BROW_SEG_LEN / 2, 0, 0]} material={mat}>
          <boxGeometry args={[BROW_SEG_LEN, 0.038, 0.036]} />
        </mesh>
      </group>
      <group ref={segBRef}>
        <mesh position={[-BROW_SEG_LEN / 2, 0, 0]} material={mat}>
          <boxGeometry args={[BROW_SEG_LEN, 0.038, 0.036]} />
        </mesh>
      </group>
    </group>
  );
}

// A limb segment: a cylinder capped with a sphere at each end so
// consecutive segments (upper arm → forearm, thigh → shin) read as one
// continuous rounded limb rather than showing flat cylinder caps at the
// joints.
function Segment({ position, rotation, length, radius, mat }: {
  position: [number, number, number];
  rotation?: [number, number, number];
  length: number;
  radius: number;
  mat: THREE.Material;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh material={mat}><cylinderGeometry args={[radius, radius, length, 20]} /></mesh>
      <mesh position={[0, length / 2, 0]} material={mat}><sphereGeometry args={[radius, 14, 14]} /></mesh>
      <mesh position={[0, -length / 2, 0]} material={mat}><sphereGeometry args={[radius, 14, 14]} /></mesh>
    </group>
  );
}

// A small palm with three short fanned-out finger segments, in the same
// silver tone as the antenna/ear-rim accents — the reference's hands are
// visibly articulated rather than a plain rounded cap.
function Hand({ position, mat }: { position: [number, number, number]; mat: THREE.Material }) {
  return (
    <group position={position}>
      <mesh material={mat}><sphereGeometry args={[0.075, 14, 14]} /></mesh>
      {[-0.32, 0, 0.32].map((tilt, i) => (
        <group key={i} rotation={[0, 0, tilt]}>
          <mesh position={[0, -0.065, 0.02]} material={mat}>
            <cylinderGeometry args={[0.016, 0.013, 0.09, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bot({ reducedMotion, expression, trackMouse }: { reducedMotion: boolean; expression: BotExpression; trackMouse?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const antennaL = useRef<THREE.Group>(null);
  const antennaR = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const rightEye = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const browLeftTilt = useRef<THREE.Group>(null);
  const browLeftSegA = useRef<THREE.Group>(null);
  const browLeftSegB = useRef<THREE.Group>(null);
  const browRightTilt = useRef<THREE.Group>(null);
  const browRightSegA = useRef<THREE.Group>(null);
  const browRightSegB = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Group>(null);

  const headMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: HEAD_COLOR, roughness: 0.25, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }), []);
  const accentMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: ACCENT_COLOR, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }), []);
  const jointMat = useMemo(() => new THREE.MeshStandardMaterial({ color: JOINT_COLOR, roughness: 0.4, metalness: 0.2 }), []);
  const eyeRingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_RING_COLOR, roughness: 0.35 }), []);
  const eyeIrisMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_IRIS_COLOR, emissive: EYE_IRIS_COLOR, emissiveIntensity: 0.35, roughness: 0.25 }), []);
  const eyeIrisDarkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_IRIS_DARK_COLOR, roughness: 0.3 }), []);
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#12181f', roughness: 0.25 }), []);
  const sparkleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const blushMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BLUSH_COLOR, roughness: 0.6, transparent: true, opacity: 0.55 }), []);
  const mouthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: MOUTH_COLOR, roughness: 0.35 }), []);
  const browMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BROW_COLOR, roughness: 0.5 }), []);
  const starMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STAR_COLOR, emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 }), []);
  const silverMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SILVER_COLOR, roughness: 0.35, metalness: 0.6 }), []);

  // Smoothed (lerped-toward-target) expression values, kept in a ref rather
  // than component state so a change doesn't trigger a React re-render on
  // every animation frame.
  const smoothed = useRef<ExpressionTarget & { mouthColorObj: THREE.Color; browColorObj: THREE.Color }>({
    ...EXPRESSION_TARGETS.normal,
    mouthColorObj: new THREE.Color(MOUTH_COLOR),
    browColorObj: new THREE.Color(BROW_COLOR),
  });

  // Normalized (-1..1) window-relative mouse position, updated by a plain
  // listener rather than per-frame polling — the head only needs to react
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

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (
      !group.current || !antennaL.current || !antennaR.current || !leftEye.current || !rightEye.current || !mouth.current || !stars.current ||
      !browLeftTilt.current || !browLeftSegA.current || !browLeftSegB.current ||
      !browRightTilt.current || !browRightSegA.current || !browRightSegB.current
    ) return;

    // Chase this frame's expression target regardless of reduced-motion —
    // this is a state change the visitor needs to see, not ambient idle
    // motion, so it isn't gated behind that preference the way the bob/tilt
    // below are.
    const target = EXPRESSION_TARGETS[expression];
    const s = smoothed.current;
    const lerp = (a: number, b: number) => a + (b - a) * EXPRESSION_LERP;
    s.browLZ = lerp(s.browLZ, target.browLZ);
    s.browRZ = lerp(s.browRZ, target.browRZ);
    s.browLY = lerp(s.browLY, target.browLY);
    s.browRY = lerp(s.browRY, target.browRY);
    s.browCurve = lerp(s.browCurve, target.browCurve);
    s.mouthFlip = lerp(s.mouthFlip, target.mouthFlip);
    s.mouthScaleX = lerp(s.mouthScaleX, target.mouthScaleX);
    s.mouthScaleY = lerp(s.mouthScaleY, target.mouthScaleY);
    s.blush = lerp(s.blush, target.blush);
    s.stars = lerp(s.stars, target.stars);
    s.mouthColorObj.lerp(new THREE.Color(target.mouthColor), EXPRESSION_LERP);
    s.browColorObj.lerp(new THREE.Color(target.browColor), EXPRESSION_LERP);

    browLeftTilt.current.rotation.z = s.browLZ;
    browRightTilt.current.rotation.z = s.browRZ;
    browLeftTilt.current.position.y = s.browLY;
    browRightTilt.current.position.y = s.browRY;
    const browBend = s.browCurve * BROW_BEND;
    browLeftSegA.current.rotation.z = browBend;
    browLeftSegB.current.rotation.z = -browBend;
    browRightSegA.current.rotation.z = browBend;
    browRightSegB.current.rotation.z = -browBend;
    browMat.color.copy(s.browColorObj);
    mouthMat.color.copy(s.mouthColorObj);
    blushMat.opacity = s.blush;

    // A little ring of "seeing stars" sparkles that spin around the head —
    // faded in/out via uniform scale rather than mounting/unmounting, so it
    // never pops. Orbit angle is a function of elapsed time rather than an
    // incremental step, so it stays correct even across sparse frames (the
    // reduced-motion / frameloop="demand" case).
    stars.current.scale.setScalar(s.stars);
    stars.current.rotation.y = t * 1.6;

    const mouthCenter = MOUTH_CENTER_SMILE + (MOUTH_CENTER_FROWN - MOUTH_CENTER_SMILE) * s.mouthFlip;

    if (reducedMotion) {
      group.current.rotation.set(0, 0, 0);
      group.current.position.y = 0;
      leftEye.current.rotation.set(0, 0, 0);
      rightEye.current.rotation.set(0, 0, 0);
      antennaL.current.rotation.z = -ANTENNA_BASE_TILT;
      antennaR.current.rotation.z = ANTENNA_BASE_TILT;
      leftEye.current.scale.y = 1;
      rightEye.current.scale.y = 1;
      mouth.current.rotation.z = mouthCenter - MOUTH_ARC / 2;
      mouth.current.scale.set(s.mouthScaleX, s.mouthScaleY, 1);
      return;
    }
    group.current.rotation.z = Math.sin(t * 0.55) * 0.035;
    group.current.position.y = Math.sin(t * 0.85) * 0.03;

    // Damped-spring "descend and settle" entrance, layered on top of the
    // idle bob above — decays to a negligible fraction of INTRO_DROP_HEIGHT
    // within ~1.5s of mount and is never explicitly turned off.
    group.current.position.y += INTRO_DROP_HEIGHT * Math.exp(-INTRO_DECAY * t) * Math.cos(INTRO_FREQ * t);

    // "Look at the cursor" — the whole character leans/turns toward
    // wherever the mouse is on the page (not just the head), with the eyes
    // swiveling a little further within that for a layered, more alive
    // parallax look, opt-in via `trackMouse` (the docked/panel bot
    // instances don't want the visitor's cursor stealing focus from the
    // conversation itself). Eased toward the raw target rather than
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
    leftEye.current.rotation.set(my * 0.2, mx / 3, 0);
    rightEye.current.rotation.set(my * 0.2, mx / 3, 0);

    antennaL.current.rotation.z = -ANTENNA_BASE_TILT + Math.sin(t * 1.3 + 1) * 0.12;
    antennaR.current.rotation.z = ANTENNA_BASE_TILT + Math.sin(t * 1.3 + 1.6) * -0.12;
    const cyclePos = t % BLINK_INTERVAL;
    const blinkStart = BLINK_INTERVAL - BLINK_DURATION;
    let blink = 0;
    if (cyclePos > blinkStart) { blink = Math.sin(((cyclePos - blinkStart) / BLINK_DURATION) * Math.PI); }
    const eyeScale = 1 - blink * 0.85;
    leftEye.current.scale.y = eyeScale;
    rightEye.current.scale.y = eyeScale;
    mouth.current.rotation.z = mouthCenter - MOUTH_ARC / 2;
    mouth.current.scale.set(s.mouthScaleX * (1 + blink * 0.12), s.mouthScaleY, 1);
  });

  return (
    <group ref={group}>
      {/* Head — eyes, brows, mouth, ears, antennae, blush and the
          confusion-star ring all live in this head-local space. */}
      <group position={[0, HEAD_Y_OFFSET, 0]}>
        <group ref={antennaL} position={[-0.2, 0.56, 0]} rotation={[0, 0, -ANTENNA_BASE_TILT]}>
          <mesh position={[0, 0.09, 0]} material={silverMat}><cylinderGeometry args={[0.014, 0.014, 0.18, 10]} /></mesh>
          <mesh position={[0, 0.19, 0]} material={accentMat}><sphereGeometry args={[0.062, 16, 16]} /></mesh>
        </group>
        <group ref={antennaR} position={[0.2, 0.56, 0]} rotation={[0, 0, ANTENNA_BASE_TILT]}>
          <mesh position={[0, 0.09, 0]} material={silverMat}><cylinderGeometry args={[0.014, 0.014, 0.18, 10]} /></mesh>
          <mesh position={[0, 0.19, 0]} material={accentMat}><sphereGeometry args={[0.062, 16, 16]} /></mesh>
        </group>
        {/* Ears: a silver rim sphere sitting just behind/outside the orange
            cup so a thin metallic bezel peeks out around its edge. */}
        <mesh position={[-0.615, -0.02, 0]} material={silverMat}><sphereGeometry args={[0.165, 20, 20]} /></mesh>
        <mesh position={[0.615, -0.02, 0]} material={silverMat}><sphereGeometry args={[0.165, 20, 20]} /></mesh>
        <mesh position={[-0.6, -0.02, 0]} material={accentMat}><sphereGeometry args={[0.155, 20, 20]} /></mesh>
        <mesh position={[0.6, -0.02, 0]} material={accentMat}><sphereGeometry args={[0.155, 20, 20]} /></mesh>
        <mesh material={headMat}><sphereGeometry args={[0.6, 28, 28]} /></mesh>
        {/* Small forehead sensor dots, above the eyes and below the
            antennae. */}
        <mesh position={[-0.11, 0.33, 0.555]} material={jointMat}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
        <mesh position={[0.11, 0.33, 0.555]} material={jointMat}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
        <Eye eyeRef={leftEye} x={-0.205} ringMat={eyeRingMat} irisMat={eyeIrisMat} irisDarkMat={eyeIrisDarkMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
        <Eye eyeRef={rightEye} x={0.205} ringMat={eyeRingMat} irisMat={eyeIrisMat} irisDarkMat={eyeIrisDarkMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
        <Eyebrow tiltRef={browLeftTilt} segARef={browLeftSegA} segBRef={browLeftSegB} x={-0.24} mat={browMat} />
        <Eyebrow tiltRef={browRightTilt} segARef={browRightSegA} segBRef={browRightSegB} x={0.24} mat={browMat} />
        <mesh position={[-0.42, -0.08, 0.42]} rotation={[0, 0.5, 0]} material={blushMat}><circleGeometry args={[0.1, 16]} /></mesh>
        <mesh position={[0.42, -0.08, 0.42]} rotation={[0, -0.5, 0]} material={blushMat}><circleGeometry args={[0.1, 16]} /></mesh>
        <mesh ref={mouth} position={[0, -0.16, 0.56]} material={mouthMat}>
          <torusGeometry args={[0.1, 0.018, 8, 24, MOUTH_ARC]} />
        </mesh>
        <group ref={stars} position={[0, 0.75, 0]} scale={0}>
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

      {/* Body — neck, torso with a chest badge, arms, and legs ending in
          rounded orange feet. Wrapped in a scaled group anchored at the
          neck join (BODY_SCALE/BODY_GROUP_Y) so it shrinks toward that
          fixed point rather than the world origin, matching the
          reference's small-body-under-a-huge-head chibi proportions
          without recomputing every coordinate below by hand. Static (no
          independent limb animation) aside from the whole-character
          bob/tilt above; each limb is built from Segment (a capped
          cylinder) so joints read as one continuous rounded shape rather
          than showing flat cylinder ends. */}
      <group scale={BODY_SCALE} position={[0, BODY_GROUP_Y, 0]}>
        <mesh position={[0, 0.08, 0]} material={jointMat}><cylinderGeometry args={[0.12, 0.12, 0.07, 28]} /></mesh>
        <RoundedBox args={[0.58, 0.56, 0.42]} radius={0.22} smoothness={5} position={[0, -0.18, 0]} material={headMat} />
        <mesh position={[0, -0.14, 0.225]} rotation={[0, 0, 0]} material={accentMat}><circleGeometry args={[0.06, 16]} /></mesh>

        {([-1, 1] as const).map((side) => (
          <group key={side}>
            <mesh position={[side * 0.32, 0.05, 0]} material={jointMat}><sphereGeometry args={[0.085, 16, 16]} /></mesh>
            <Segment position={[side * 0.34, -0.12, 0]} rotation={[0, 0, side * 0.14]} length={0.3} radius={0.088} mat={headMat} />
            <mesh position={[side * 0.37, -0.29, 0]} material={jointMat}><sphereGeometry args={[0.075, 14, 14]} /></mesh>
            <Segment position={[side * 0.38, -0.44, 0]} rotation={[0, 0, side * 0.06]} length={0.26} radius={0.075} mat={headMat} />
            <Hand position={[side * 0.39, -0.59, 0.01]} mat={silverMat} />

            <mesh position={[side * 0.16, -0.46, 0]} material={jointMat}><sphereGeometry args={[0.09, 16, 16]} /></mesh>
            <Segment position={[side * 0.16, -0.63, 0]} length={0.3} radius={0.105} mat={headMat} />
            <mesh position={[side * 0.16, -0.8, 0]} material={accentMat}><cylinderGeometry args={[0.095, 0.095, 0.045, 24]} /></mesh>
            <Segment position={[side * 0.16, -0.95, 0]} length={0.26} radius={0.09} mat={headMat} />
            <mesh position={[side * 0.16, -1.12, 0.07]} scale={[1, 0.5, 1.22]} material={accentMat}><sphereGeometry args={[0.21, 18, 18]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export default function RobotAvatar3D({ className, expression = 'normal', trackMouse = false }: { className?: string; expression?: BotExpression; trackMouse?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0.02, 5.4], fov: 32 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} frameloop={reducedMotion ? 'demand' : 'always'}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.4} />
        <directionalLight position={[-2, -1, 1.5]} intensity={0.4} />
        <Bot reducedMotion={reducedMotion} expression={expression} trackMouse={trackMouse} />
      </Canvas>
    </div>
  );
}
