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
// Expressions: `expression` drives three states — 'normal' (default idle),
// 'thinking' (waiting on the API), and 'angry' (a validation/security
// rejection). Rather than swapping geometry, the same eyebrow/mouth/color
// values are just smoothly lerped every frame toward per-expression targets
// (see EXPRESSION_TARGETS), so switching states reads as an expression
// change rather than a jump-cut.
import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

export type BotExpression = 'normal' | 'thinking' | 'angry';

const HEAD_COLOR = '#ffffff';
const EAR_COLOR = '#4f9bff';
const SCREEN_COLOR = '#151a24';
const EYE_COLOR = '#eaf6ff';
const BLUSH_COLOR = '#ffb3c6';
const BROW_COLOR = '#2a3140';
const MOUTH_COLOR = '#ffffff';

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
  mouthFlip: number; // 0 = smile, 1 = frown
  mouthScaleX: number;
  mouthScaleY: number;
  mouthColor: string;
  browColor: string;
  blush: number;
}

const EXPRESSION_TARGETS: Record<BotExpression, ExpressionTarget> = {
  normal: {
    browLZ: 0,
    browRZ: 0,
    browLY: 0.145,
    browRY: 0.145,
    mouthFlip: 0,
    mouthScaleX: 1,
    mouthScaleY: 1,
    mouthColor: MOUTH_COLOR,
    browColor: BROW_COLOR,
    blush: 0.55,
  },
  // A quizzical, one-eyebrow-raised look with a small pursed mouth.
  thinking: {
    browLZ: -0.05,
    browRZ: 0.32,
    browLY: 0.145,
    browRY: 0.185,
    mouthFlip: 0,
    mouthScaleX: 0.55,
    mouthScaleY: 0.55,
    mouthColor: MOUTH_COLOR,
    browColor: BROW_COLOR,
    blush: 0.35,
  },
  // A sharp inward "V" brow and a flipped, reddened mouth.
  angry: {
    browLZ: 0.5,
    browRZ: -0.5,
    browLY: 0.115,
    browRY: 0.115,
    mouthFlip: 1,
    mouthScaleX: 1,
    mouthScaleY: 1,
    mouthColor: '#ff8a65',
    browColor: '#7a2e2e',
    blush: 0.8,
  },
};

// How quickly the smoothed values above chase their targets each frame —
// higher is snappier, lower is more of a slow morph. Tuned to settle in
// roughly a quarter second at 60fps.
const EXPRESSION_LERP = 0.14;

function Eye({ eyeRef, x, eyeMat, pupilMat, sparkleMat }: {
  eyeRef: RefObject<THREE.Group | null>;
  x: number;
  eyeMat: THREE.Material;
  pupilMat: THREE.Material;
  sparkleMat: THREE.Material;
}) {
  return (
    <group ref={eyeRef} position={[x, 0.03, 0.5]}>
      <mesh material={eyeMat}><sphereGeometry args={[0.09, 20, 20]} /></mesh>
      <mesh position={[0, -0.012, 0.07]} material={pupilMat}><sphereGeometry args={[0.05, 16, 16]} /></mesh>
      <mesh position={[0.02, 0.024, 0.105]} material={sparkleMat}><sphereGeometry args={[0.016, 8, 8]} /></mesh>
    </group>
  );
}

function Bot({ reducedMotion, expression }: { reducedMotion: boolean; expression: BotExpression }) {
  const group = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const rightEye = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const browLeft = useRef<THREE.Mesh>(null);
  const browRight = useRef<THREE.Mesh>(null);

  const headMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: HEAD_COLOR, roughness: 0.25, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }), []);
  const earMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: EAR_COLOR, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }), []);
  const screenMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: SCREEN_COLOR, roughness: 0.4, metalness: 0.15, clearcoat: 0.5 }), []);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 1.1, roughness: 0.2 }), []);
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c2733', roughness: 0.3 }), []);
  const sparkleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const blushMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BLUSH_COLOR, roughness: 0.6, transparent: true, opacity: 0.55 }), []);
  const mouthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: MOUTH_COLOR, roughness: 0.35 }), []);
  const browMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BROW_COLOR, roughness: 0.5 }), []);

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
    if (!group.current || !antenna.current || !leftEye.current || !rightEye.current || !mouth.current || !browLeft.current || !browRight.current) return;

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
    s.mouthFlip = lerp(s.mouthFlip, target.mouthFlip);
    s.mouthScaleX = lerp(s.mouthScaleX, target.mouthScaleX);
    s.mouthScaleY = lerp(s.mouthScaleY, target.mouthScaleY);
    s.blush = lerp(s.blush, target.blush);
    s.mouthColorObj.lerp(new THREE.Color(target.mouthColor), EXPRESSION_LERP);
    s.browColorObj.lerp(new THREE.Color(target.browColor), EXPRESSION_LERP);

    browLeft.current.rotation.z = s.browLZ;
    browRight.current.rotation.z = s.browRZ;
    browLeft.current.position.y = s.browLY;
    browRight.current.position.y = s.browRY;
    browMat.color.copy(s.browColorObj);
    mouthMat.color.copy(s.mouthColorObj);
    blushMat.opacity = s.blush;

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
      <RoundedBox args={[0.66, 0.46, 0.06]} radius={0.18} smoothness={5} position={[0, -0.02, 0.47]} material={screenMat} />
      <Eye eyeRef={leftEye} x={-0.16} eyeMat={eyeMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
      <Eye eyeRef={rightEye} x={0.16} eyeMat={eyeMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
      <mesh ref={browLeft} position={[-0.16, 0.145, 0.535]} material={browMat}><boxGeometry args={[0.15, 0.032, 0.03]} /></mesh>
      <mesh ref={browRight} position={[0.16, 0.145, 0.535]} material={browMat}><boxGeometry args={[0.15, 0.032, 0.03]} /></mesh>
      <mesh position={[-0.42, -0.14, 0.45]} rotation={[0, 0.5, 0]} material={blushMat}><circleGeometry args={[0.09, 16]} /></mesh>
      <mesh position={[0.42, -0.14, 0.45]} rotation={[0, -0.5, 0]} material={blushMat}><circleGeometry args={[0.09, 16]} /></mesh>
      <mesh ref={mouth} position={[0, -0.13, 0.53]} material={mouthMat}>
        <torusGeometry args={[0.075, 0.014, 8, 24, MOUTH_ARC]} />
      </mesh>
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
