// A tiny real-3D robot mascot for the chat header — same stack (three.js /
// @react-three/fiber / drei) as the hero Rubik's cube scene, built from
// plain primitives rather than an imported model file (no external asset,
// no licensing question). Deliberately mounted just once, in the chat
// header only — the per-message avatars stay the flat SVG version
// (RobotAvatar.tsx) rather than each spinning up their own WebGL context,
// since browsers cap how many of those a page can hold at once and a
// message-per-context 3D scene would be real, unbounded GPU cost for a
// decorative detail.
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

const HEAD_COLOR = '#f2f5fa';
const EAR_COLOR = '#3d8bff';
const SCREEN_COLOR = '#12161f';
const EYE_COLOR = '#bfe6ff';

// How often (seconds) the bot blinks, and how long the blink itself takes —
// a fast, natural-feeling close-open rather than a slow fade.
const BLINK_INTERVAL = 3.4;
const BLINK_DURATION = 0.22;

function Bot({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);

  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: HEAD_COLOR, roughness: 0.35, metalness: 0.08 }), []);
  const earMat = useMemo(() => new THREE.MeshStandardMaterial({ color: EAR_COLOR, roughness: 0.4, metalness: 0.15 }), []);
  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SCREEN_COLOR, roughness: 0.5, metalness: 0.1 }), []);
  const eyeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 0.9, roughness: 0.3 }),
    []
  );

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
          head's own bob/tilt. Positioned to sit right on the head's own top
          surface (half-height 0.575), not floating above the camera's
          visible frustum. */}
      <group ref={antenna} position={[0, 0.56, 0]}>
        <mesh position={[0, 0.08, 0]} material={earMat}>
          <cylinderGeometry args={[0.03, 0.03, 0.16, 12]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={earMat}>
          <sphereGeometry args={[0.065, 16, 16]} />
        </mesh>
      </group>

      {/* Ears */}
      <mesh position={[-0.62, -0.05, 0]} material={earMat}>
        <capsuleGeometry args={[0.09, 0.22, 6, 12]} />
      </mesh>
      <mesh position={[0.62, -0.05, 0]} material={earMat}>
        <capsuleGeometry args={[0.09, 0.22, 6, 12]} />
      </mesh>

      {/* Head */}
      <RoundedBox args={[1.3, 1.15, 0.75]} radius={0.38} smoothness={4} material={headMat} />

      {/* Face screen */}
      <RoundedBox args={[0.92, 0.62, 0.1]} radius={0.2} smoothness={4} position={[0, -0.03, 0.38]} material={screenMat} />

      {/* Eyes */}
      <mesh ref={leftEye} position={[-0.19, -0.03, 0.44]} material={eyeMat}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>
      <mesh ref={rightEye} position={[0.19, -0.03, 0.44]} material={eyeMat}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>

      {/* Smile — half of a thin torus ring. A torus's own local ring lies
          flat in the XY plane, already facing the camera, and its default
          half-arc (0 to π) draws the TOP half of the circle — rotating the
          whole mesh exactly π around Z point-reflects every vertex through
          the center, which maps that top half onto the bottom half, i.e.
          the actual downward smile curve, with no fractional-angle
          guessing needed. */}
      <mesh ref={mouth} position={[0, -0.2, 0.44]} rotation={[0, 0, Math.PI]} material={eyeMat}>
        <torusGeometry args={[0.13, 0.02, 8, 24, Math.PI]} />
      </mesh>
    </group>
  );
}

export default function RobotAvatar3D({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, -0.05, 2.7], fov: 34 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.3} />
        <directionalLight position={[-2, -1, 1]} intensity={0.35} />
        <Bot reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
