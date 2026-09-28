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
// Deliberately "cute" rather than "technical": a big, near-round head, big
// glossy eyes with a highlight sparkle, soft blush, and candy-glossy
// MeshPhysicalMaterial (clearcoat) — the same material family RubiksCube.tsx
// already uses for its own glossy cubies, for a consistent look language.
//
// Expressions: `expression` drives four states — 'normal' (default idle),
// 'happy' (the big welcoming grin shown right when the chat opens),
// 'thinking' (waiting on the API), and 'angry' (a validation/security
// rejection, paired with a little ring of "seeing stars" confusion sparkles
// orbiting the head). Rather than swapping geometry, the same
// eyebrow/mouth/color/star values are just smoothly lerped every frame
// toward per-expression targets (see EXPRESSION_TARGETS), so switching
// states reads as an expression change rather than a jump-cut.
//
// The face is a hollow frame, not a filled screen: a thin black RoundedBox
// border with a smaller white "window" RoundedBox (same material as the
// head) sitting just in front of its center, so only a slim black margin
// shows — eyes, brows and mouth then sit directly on that white window
// rather than on a solid black plate.
import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

export type BotExpression = 'normal' | 'happy' | 'thinking' | 'angry';

const HEAD_COLOR = '#ffffff';
const EAR_COLOR = '#4f9bff';
const SCREEN_COLOR = '#151a24';
const EYE_COLOR = '#eaf6ff';
const EYE_OUTLINE_COLOR = '#2a3140';
const BLUSH_COLOR = '#ffb3c6';
const BROW_COLOR = '#2a3140';
const MOUTH_COLOR = '#2a3140';
const STAR_COLOR = '#ffd54f';

// Outer border box: current face-plate footprint. Inner window box: smaller
// on every side by BORDER_THICKNESS, so the border box's own margin is all
// that remains visible — a thin frame rather than a filled screen.
const SCREEN_W = 0.8;
const SCREEN_H = 0.56;
const BORDER_THICKNESS = 0.055;
const WINDOW_W = SCREEN_W - BORDER_THICKNESS * 2;
const WINDOW_H = SCREEN_H - BORDER_THICKNESS * 2;

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

const EXPRESSION_TARGETS: Record<BotExpression, ExpressionTarget> = {
  normal: {
    browLZ: 0,
    browRZ: 0,
    browLY: 0.177,
    browRY: 0.177,
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
    browLY: 0.189,
    browRY: 0.189,
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
    browLY: 0.177,
    browRY: 0.226,
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
    browLY: 0.14,
    browRY: 0.14,
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

function Eye({ eyeRef, x, eyeMat, outlineMat, pupilMat, sparkleMat }: {
  eyeRef: RefObject<THREE.Group | null>;
  x: number;
  eyeMat: THREE.Material;
  outlineMat: THREE.Material;
  pupilMat: THREE.Material;
  sparkleMat: THREE.Material;
}) {
  return (
    <group ref={eyeRef} position={[x, 0.037, 0.515]}>
      {/* A dark rim just behind the eye-white sphere — without the old
          solid black screen behind it, the eye needs its own outline to
          read clearly against the new white window. */}
      <mesh position={[0, 0, -0.032]} material={outlineMat}><sphereGeometry args={[0.128, 20, 20]} /></mesh>
      <mesh material={eyeMat}><sphereGeometry args={[0.11, 20, 20]} /></mesh>
      <mesh position={[0, -0.015, 0.085]} material={pupilMat}><sphereGeometry args={[0.061, 16, 16]} /></mesh>
      <mesh position={[0.025, 0.03, 0.13]} material={sparkleMat}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
    </group>
  );
}

// Each eyebrow is two thin segments meeting at a shared center pivot rather
// than one solid bar: pivoting the segments apart draws a gentle arch, and
// bringing them back to 0 collapses them into one straight line — the same
// geometry morphs between "curved" (normal/happy/thinking) and "straight"
// (angry) rather than swapping shapes.
const BROW_SEG_LEN = 0.1;

function Eyebrow({ tiltRef, segARef, segBRef, x, mat }: {
  tiltRef: RefObject<THREE.Group | null>;
  segARef: RefObject<THREE.Group | null>;
  segBRef: RefObject<THREE.Group | null>;
  x: number;
  mat: THREE.Material;
}) {
  return (
    <group ref={tiltRef} position={[x, 0.177, 0.545]}>
      <group ref={segARef}>
        <mesh position={[BROW_SEG_LEN / 2, 0, 0]} material={mat}>
          <boxGeometry args={[BROW_SEG_LEN, 0.036, 0.034]} />
        </mesh>
      </group>
      <group ref={segBRef}>
        <mesh position={[-BROW_SEG_LEN / 2, 0, 0]} material={mat}>
          <boxGeometry args={[BROW_SEG_LEN, 0.036, 0.034]} />
        </mesh>
      </group>
    </group>
  );
}

function Bot({ reducedMotion, expression }: { reducedMotion: boolean; expression: BotExpression }) {
  const group = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
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
  const earMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: EAR_COLOR, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }), []);
  const screenMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: SCREEN_COLOR, roughness: 0.4, metalness: 0.15, clearcoat: 0.5 }), []);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 1.1, roughness: 0.2 }), []);
  const eyeOutlineMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_OUTLINE_COLOR, roughness: 0.4 }), []);
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c2733', roughness: 0.3 }), []);
  const sparkleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const blushMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BLUSH_COLOR, roughness: 0.6, transparent: true, opacity: 0.55 }), []);
  const mouthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: MOUTH_COLOR, roughness: 0.35 }), []);
  const browMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BROW_COLOR, roughness: 0.5 }), []);
  const starMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STAR_COLOR, emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 }), []);

  // Smoothed (lerped-toward-target) expression values, kept in a ref rather
  // than component state so a change doesn't trigger a React re-render on
  // every animation frame.
  const smoothed = useRef<ExpressionTarget & { mouthColorObj: THREE.Color; browColorObj: THREE.Color }>({
    ...EXPRESSION_TARGETS.normal,
    mouthColorObj: new THREE.Color(MOUTH_COLOR),
    browColorObj: new THREE.Color(BROW_COLOR),
  });

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (
      !group.current || !antenna.current || !leftEye.current || !rightEye.current || !mouth.current || !stars.current ||
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
      group.current.rotation.z = 0;
      group.current.position.y = 0;
      antenna.current.rotation.z = 0;
      leftEye.current.scale.y = 1;
      rightEye.current.scale.y = 1;
      mouth.current.rotation.z = mouthCenter - MOUTH_ARC / 2;
      mouth.current.scale.set(s.mouthScaleX, s.mouthScaleY, 1);
      return;
    }
    group.current.rotation.z = Math.sin(t * 0.6) * 0.05;
    group.current.position.y = Math.sin(t * 0.9) * 0.035;
    antenna.current.rotation.z = Math.sin(t * 1.3 + 1) * 0.18;
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
      <group ref={antenna} position={[0, 0.6, 0]}>
        <mesh position={[0, 0.07, 0]} material={earMat}><cylinderGeometry args={[0.025, 0.025, 0.14, 12]} /></mesh>
        <mesh position={[0, 0.17, 0]} material={earMat}><sphereGeometry args={[0.075, 16, 16]} /></mesh>
        <mesh position={[-0.02, 0.19, 0.04]} material={sparkleMat}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
      </group>
      <mesh position={[-0.66, -0.02, 0]} material={earMat}><sphereGeometry args={[0.16, 20, 20]} /></mesh>
      <mesh position={[0.66, -0.02, 0]} material={earMat}><sphereGeometry args={[0.16, 20, 20]} /></mesh>
      <RoundedBox args={[1.2, 1.15, 0.95]} radius={0.46} smoothness={5} material={headMat} />
      {/* The face frame — a thin black border with a white window sitting
          just in front of its center, so only the border's own margin
          stays visible (no solid black plate) and eyes/brows/mouth sit
          directly on the white window. */}
      <RoundedBox args={[SCREEN_W, SCREEN_H, 0.06]} radius={0.22} smoothness={5} position={[0, -0.02, 0.47]} material={screenMat} />
      <RoundedBox args={[WINDOW_W, WINDOW_H, 0.05]} radius={0.19} smoothness={5} position={[0, -0.02, 0.485]} material={headMat} />
      <Eye eyeRef={leftEye} x={-0.2} eyeMat={eyeMat} outlineMat={eyeOutlineMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
      <Eye eyeRef={rightEye} x={0.2} eyeMat={eyeMat} outlineMat={eyeOutlineMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
      <Eyebrow tiltRef={browLeftTilt} segARef={browLeftSegA} segBRef={browLeftSegB} x={-0.2} mat={browMat} />
      <Eyebrow tiltRef={browRightTilt} segARef={browRightSegA} segBRef={browRightSegB} x={0.2} mat={browMat} />
      <mesh position={[-0.51, -0.17, 0.46]} rotation={[0, 0.5, 0]} material={blushMat}><circleGeometry args={[0.11, 16]} /></mesh>
      <mesh position={[0.51, -0.17, 0.46]} rotation={[0, -0.5, 0]} material={blushMat}><circleGeometry args={[0.11, 16]} /></mesh>
      <mesh ref={mouth} position={[0, -0.159, 0.545]} material={mouthMat}>
        <torusGeometry args={[0.092, 0.017, 8, 24, MOUTH_ARC]} />
      </mesh>
      <group ref={stars} position={[0, 0.56, 0]} scale={0}>
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(angle) * 0.5, Math.sin(angle) * 0.1, Math.sin(angle) * 0.35]} material={starMat}>
              <octahedronGeometry args={[0.05, 0]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export default function RobotAvatar3D({ className, expression = 'normal' }: { className?: string; expression?: BotExpression }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, -0.03, 2.9], fov: 32 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} frameloop={reducedMotion ? 'demand' : 'always'}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.4} />
        <directionalLight position={[-2, -1, 1.5]} intensity={0.4} />
        <Bot reducedMotion={reducedMotion} expression={expression} />
      </Canvas>
    </div>
  );
}
