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
import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

const HEAD_COLOR = '#ffffff';
const EAR_COLOR = '#4f9bff';
const SCREEN_COLOR = '#151a24';
const EYE_COLOR = '#eaf6ff';
const BLUSH_COLOR = '#ffb3c6';

// How often (seconds) the bot blinks, and how long the blink itself takes —
// a fast, natural-feeling close-open rather than a slow fade.
const BLINK_INTERVAL = 3.4;
const BLINK_DURATION = 0.22;
const MOUTH_ARC = Math.PI * 0.85;

// A round eye: a glowing white "sclera" sphere, a dark pupil sitting just in
// front of it, and a tiny always-bright highlight dot offset toward the key
// light — the actual detail that reads as "cute" rather than "sensor."
// Grouped so the blink scale can apply to the whole eye at once. A top-level
// component (not nested inside Bot) so its identity stays stable across
// Bot's own re-renders — a component defined inside another component's
// render body gets a fresh function identity every render, which makes
// React treat it as a brand-new type and remount it (losing these refs)
// instead of reusing the existing instance.
function Eye({
  eyeRef,
  x,
  eyeMat,
  pupilMat,
  sparkleMat,
}: {
  eyeRef: RefObject<THREE.Group | null>;
  x: number;
  eyeMat: THREE.Material;
  pupilMat: THREE.Material;
  sparkleMat: THREE.Material;
}) {
  return (
    <group ref={eyeRef} position={[x, 0.03, 0.5]}>
      <mesh material={eyeMat}>
        <sphereGeometry args={[0.09, 20, 20]} />
      </mesh>
      <mesh position={[0, -0.012, 0.07]} material={pupilMat}>
        <sphereGeometry args={[0.05, 16, 16]} />
      </mesh>
      <mesh position={[0.02, 0.024, 0.105]} material={sparkleMat}>
        <sphereGeometry args={[0.016, 8, 8]} />
      </mesh>
    </group>
  );
}

function Bot({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const rightEye = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);

  const headMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: HEAD_COLOR, roughness: 0.25, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    []
  );
  const earMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: EAR_COLOR, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    []
  );
  const screenMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: SCREEN_COLOR, roughness: 0.4, metalness: 0.15, clearcoat: 0.5 }), []);
  const eyeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 1.1, roughness: 0.2 }),
    []
  );
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c2733', roughness: 0.3 }), []);
  const sparkleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const blushMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BLUSH_COLOR, roughness: 0.6, transparent: true, opacity: 0.55 }),
    []
  );
  // Plain white rather than the eyes' emissive glow — a bright but
  // non-glowing smile line reads cleanly against the dark screen without
  // the "open toothy grin" look a big glowing arc gave the first pass.
  const mouthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (!group.current || !antenna.current || !leftEye.current || !rightEye.current || !mouth.current) return;

    if (reducedMotion) {
      // Held in a plain, settled pose — no bob/tilt/blink — rather than
      // frozen mid-motion at whatever the clock happened to read.
      group.current.rotation.z = 0;
      group.current.position.y = 0;
      antenna.current.rotation.z = 0;
      leftEye.current.scale.y = 1;
      rightEye.current.scale.y = 1;
      mouth.current.scale.x = 1;
      return;
    }

    // Gentle idle bob/tilt — small enough to read as "alive," not a
    // distracting wobble.
    group.current.rotation.z = Math.sin(t * 0.6) * 0.05;
    group.current.position.y = Math.sin(t * 0.9) * 0.035;
    antenna.current.rotation.z = Math.sin(t * 1.3 + 1) * 0.18;

    // A short, natural blink near the end of each cycle rather than a
    // constant sinusoidal flutter — eyes stay open almost all the time.
    const cyclePos = t % BLINK_INTERVAL;
    const blinkStart = BLINK_INTERVAL - BLINK_DURATION;
    let blink = 0;
    if (cyclePos > blinkStart) {
      blink = Math.sin(((cyclePos - blinkStart) / BLINK_DURATION) * Math.PI);
    }
    const eyeScale = 1 - blink * 0.85;
    leftEye.current.scale.y = eyeScale;
    rightEye.current.scale.y = eyeScale;
    // A little "happy" mouth-widen right on the blink, like a cheerful
    // eye-smile rather than two independent tics.
    mouth.current.scale.x = 1 + blink * 0.12;
  });

  return (
    <group ref={group}>
      {/* Antenna — its own sub-group so it can sway independently of the
          head's own bob/tilt. */}
      <group ref={antenna} position={[0, 0.6, 0]}>
        <mesh position={[0, 0.07, 0]} material={earMat}>
          <cylinderGeometry args={[0.025, 0.025, 0.14, 12]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} material={earMat}>
          <sphereGeometry args={[0.075, 16, 16]} />
        </mesh>
        <mesh position={[-0.02, 0.19, 0.04]} material={sparkleMat}>
          <sphereGeometry args={[0.02, 8, 8]} />
        </mesh>
      </group>

      {/* Ears — soft round blobs rather than elongated capsules, closer in
          spirit to the reference's chunky rounded shapes. */}
      <mesh position={[-0.66, -0.02, 0]} material={earMat}>
        <sphereGeometry args={[0.16, 20, 20]} />
      </mesh>
      <mesh position={[0.66, -0.02, 0]} material={earMat}>
        <sphereGeometry args={[0.16, 20, 20]} />
      </mesh>

      {/* Head — near-square proportions with a big rounding radius reads
          much closer to "round friendly toy" than the previous flatter,
          more angular box. */}
      <RoundedBox args={[1.2, 1.15, 0.95]} radius={0.46} smoothness={5} material={headMat} />

      {/* Face screen — sized well inside the head so a good amount of white
          head shows all the way around it as a thin border, rather than the
          screen nearly matching the head's own silhouette (which read as a
          thick black ring wrapping the whole face instead of a face
          screen). */}
      <RoundedBox args={[0.66, 0.46, 0.06]} radius={0.18} smoothness={5} position={[0, -0.02, 0.47]} material={screenMat} />

      <Eye eyeRef={leftEye} x={-0.16} eyeMat={eyeMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />
      <Eye eyeRef={rightEye} x={0.16} eyeMat={eyeMat} pupilMat={pupilMat} sparkleMat={sparkleMat} />

      {/* Blush — two soft pink discs just below/outside the eyes. */}
      <mesh position={[-0.42, -0.14, 0.45]} rotation={[0, 0.5, 0]} material={blushMat}>
        <circleGeometry args={[0.09, 16]} />
      </mesh>
      <mesh position={[0.42, -0.14, 0.45]} rotation={[0, -0.5, 0]} material={blushMat}>
        <circleGeometry args={[0.09, 16]} />
      </mesh>

      {/* Smile — an arc of a thin torus ring. A torus's own local ring lies
          flat in the XY plane (already facing the camera) and always draws
          its `arc` slice starting at local angle 0 (its own +X axis)
          sweeping counterclockwise — so to land a symmetric downward curve
          centered on local "straight down" (270°/-90°), the mesh needs
          rotating by (270° − arc/2), which puts the arc's own midpoint
          exactly there regardless of how wide `arc` is (a fixed π rotation
          only happens to center a full half-circle; any narrower arc needs
          this general form or it comes out lopsided). */}
      <mesh ref={mouth} position={[0, -0.13, 0.53]} rotation={[0, 0, (3 * Math.PI) / 2 - MOUTH_ARC / 2]} material={mouthMat}>
        <torusGeometry args={[0.075, 0.014, 8, 24, MOUTH_ARC]} />
      </mesh>
    </group>
  );
}

export default function RobotAvatar3D({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, -0.03, 2.9], fov: 32 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.4} />
        <directionalLight position={[-2, -1, 1.5]} intensity={0.4} />
        <Bot reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
