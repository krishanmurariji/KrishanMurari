import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Environment, PresentationControls, ContactShadows, RoundedBox } from '@react-three/drei';
import { Suspense, useRef, useLayoutEffect, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import RubiksCube from './RubiksCube';
import GlassLogo3D from './GlassLogo3D';
import gsap from 'gsap';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';

interface ScatterPiece {
  baseX: number;
  baseY: number;
  baseZ: number;
  size: number;
  speed: number;
  floatAmp: number;
  phase: number;
  axis: THREE.Vector3;
  spin: number;
  /** Orbiting pieces revolve around their own base position instead of just bobbing. */
  orbit: boolean;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
}

// Small decorative cubes floating around the hero cube — same metallic-silver family
// as the main Rubik's cube, just to give the empty space around it some life. Weighted
// toward the bottom of the frame (near the dock, where the glass backdrop shows them
// through the blur) and a portion of them orbit their base position instead of just
// bobbing, for a livelier "revolving" feel alongside the plain floaters.
function ScatteredCubes({ reducedMotion }: { reducedMotion: boolean }) {
  const meshesRef = useRef<(THREE.Mesh | null)[]>([]);

  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0.85,
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  }), []);

  const pieces = useMemo<ScatterPiece[]>(() => Array.from({ length: 36 }).map(() => {
    const bottomWeighted = Math.random() < 0.62;
    const orbit = Math.random() < 0.35;
    return {
      baseX: (Math.random() - 0.5) * 27,
      baseY: bottomWeighted ? -7.5 + Math.random() * 4.5 : (Math.random() - 0.5) * 15,
      baseZ: -1 - Math.random() * 8,
      size: 0.12 + Math.random() * 0.5,
      speed: 0.15 + Math.random() * 0.3,
      floatAmp: 0.2 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      axis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      spin: 0.003 + Math.random() * 0.01,
      orbit,
      orbitRadius: 0.8 + Math.random() * 2.6,
      orbitSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.2),
      orbitPhase: Math.random() * Math.PI * 2,
    };
  }), []);

  useFrame((state) => {
    // `prefers-reduced-motion`: leave every decorative cube exactly at its
    // initial (already-set-via-props) position instead of continuously
    // bobbing/orbiting/spinning it — this is 36 meshes' worth of trig +
    // quaternion math per frame purely for ambient flavor, with nothing
    // else depending on it running.
    if (reducedMotion) return;
    const t = state.clock.getElapsedTime();
    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return;
      const p = pieces[i];
      if (p.orbit) {
        const angle = t * p.orbitSpeed + p.orbitPhase;
        mesh.position.x = p.baseX + Math.cos(angle) * p.orbitRadius;
        mesh.position.z = p.baseZ + Math.sin(angle) * p.orbitRadius * 0.5;
        mesh.position.y = p.baseY + Math.sin(t * p.speed + p.phase) * p.floatAmp * 0.6;
      } else {
        mesh.position.y = p.baseY + Math.sin(t * p.speed + p.phase) * p.floatAmp;
      }
      mesh.rotateOnAxis(p.axis, p.spin);
      mesh.scale.setScalar(p.size);
    });
  });

  return (
    <group frustumCulled={false}>
      {pieces.map((piece, i) => (
        <RoundedBox
          key={i}
          ref={(el) => { meshesRef.current[i] = el; }}
          position={[piece.baseX, piece.baseY, piece.baseZ]}
          args={[1, 1, 1]}
          radius={0.12}
          smoothness={2}
          material={material}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

const REST_POLAR: [number, number] = [-Math.PI / 8, Math.PI / 8];
const REST_AZIMUTH: [number, number] = [-Math.PI / 4, Math.PI / 4];
const FREE_POLAR: [number, number] = [-Math.PI, Math.PI];
const FREE_AZIMUTH: [number, number] = [-Math.PI, Math.PI];
const DOUBLE_CLICK_WINDOW = 350; // ms

function SceneContents({
  isLight,
  isLoading,
  locked,
  progressRef,
}: {
  isLight?: boolean;
  isLoading?: boolean;
  /** Lock screen still up — the cube stays assembled-but-closed until this
   * clears, so the solve-and-open reveal reads as "the desktop unlocking"
   * rather than something that just runs on the loader's own timer. */
  locked?: boolean;
  progressRef: React.MutableRefObject<{ value: number }>;
}) {
  const cubeRef = useRef<THREE.Group>(null);
  const cameraTarget = useRef(new THREE.Vector3());
  const cameraBaseZ = useRef({ value: 13 }); // matches the loader's camera z so the cube doesn't jump size on handoff
  const introPlayed = useRef(false);
  // Double-click-and-hold: the second click of a double-click starts a pointer
  // press that's still down (unlike a plain dblclick, which fires after the
  // button is already back up) — tracking pointerdown timestamps ourselves
  // catches that "still holding" moment, which is what lets the same press
  // continue on into a drag-to-spin.
  const [freeSpin, setFreeSpin] = useState(false);
  const lastPointerDownAt = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  // The cube itself never pops in or swaps — RubiksCube assembles its own pieces in
  // place from progressRef. Once assembly hands off, just settle the camera in from
  // the loader's distance to the resting distance.
  useLayoutEffect(() => {
    if (isLoading || introPlayed.current) return;
    introPlayed.current = true;

    gsap.fromTo(cameraBaseZ.current,
      { value: 13 },
      { value: 12, duration: 2.2, ease: 'power4.out', delay: 0.1 }
    );
  }, [isLoading]);

  useFrame(state => {
    // Skip the pointer-chase parallax under reduced motion — it's a
    // continuous, mouse-driven camera drift, exactly the category of motion
    // that preference exists to suppress. The camera still needs `lookAt`
    // held every frame here (PresentationControls doesn't own the camera
    // itself), just without chasing the pointer first.
    if (!reducedMotion) {
      cameraTarget.current.x = THREE.MathUtils.lerp(cameraTarget.current.x, state.pointer.x * 2, 0.05);
      cameraTarget.current.y = THREE.MathUtils.lerp(cameraTarget.current.y, state.pointer.y * 2, 0.05);
    }
    state.camera.position.set(cameraTarget.current.x, cameraTarget.current.y, cameraBaseZ.current.value);
    state.camera.lookAt(0, 0, 0);
  });

  // A window-level release, not just onPointerUp on the cube — if the drag
  // carries the pointer off the cube (or off the canvas entirely) before it's
  // released, the mesh's own onPointerUp never fires and free-spin would
  // otherwise stay stuck on.
  useEffect(() => {
    if (!freeSpin) return;
    const stop = () => setFreeSpin(false);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [freeSpin]);

  const handleCubePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const now = performance.now();
    if (now - lastPointerDownAt.current < DOUBLE_CLICK_WINDOW) {
      setFreeSpin(true);
    }
    lastPointerDownAt.current = now;
  };

  return (
    <>
      <fog attach="fog" color={isLight ? '#f3f4f6' : '#050510'} near={14} far={32} />
      <Environment preset={isLight ? 'warehouse' : 'city'} />
      <ambientLight intensity={isLight ? 1.5 : 0.5} />
      <directionalLight position={[10, 10, 10]} intensity={isLight ? 2 : 1} castShadow />
      <ScatteredCubes reducedMotion={reducedMotion} />
      <PresentationControls
        snap={!freeSpin}
        rotation={[0, 0, 0]}
        polar={freeSpin ? FREE_POLAR : REST_POLAR}
        azimuth={freeSpin ? FREE_AZIMUTH : REST_AZIMUTH}
      >
        <group
          frustumCulled={false}
          onPointerDown={handleCubePointerDown}
          onPointerUp={() => setFreeSpin(false)}
        >
          <RubiksCube groupRef={cubeRef} progressRef={progressRef} assembled={!isLoading && !locked} />
        </group>
      </PresentationControls>
      {/* Sits behind the cube from the moment it starts solving, fully
          occluded by the still-closed cube — the explode phase (inside
          RubiksCube) then flies the cubies away from around it, so the logo
          reads as something that was inside the cube all along rather than
          a separate thing popping in afterward. Mounted as soon as loading
          ends (even while still locked) since it stays fully hidden behind
          the still-closed cube either way. */}
      {!isLoading && <GlassLogo3D position={[0, 0, -0.3]} />}
      <ContactShadows position={[0, -3.5, 0]} opacity={isLight ? 0.15 : 0.4}
        scale={30} blur={2.5} far={5} color={isLight ? '#000' : '#fff'} />
    </>
  );
}

export default function Scene({
  isLight,
  isLoading,
  locked,
  progressRef,
  canvasRef,
}: {
  isLight?: boolean;
  isLoading?: boolean;
  locked?: boolean;
  progressRef: React.MutableRefObject<{ value: number }>;
  /** Filled in with the underlying WebGL <canvas> once created — used to fake a
   * "glass" blur-through over the dock, since CSS backdrop-filter can't reliably
   * sample WebGL canvas content (see MacDock's GlassBackdrop). */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 12], fov: 45 }}
        // preserveDrawingBuffer: without it, the browser is free to clear the
        // WebGL drawing buffer immediately after each frame is presented —
        // reading from this canvas asynchronously (GlassBackdrop's snapshot
        // loop runs on its own timer, outside R3F's render loop) would then
        // often capture a blank frame instead of the actual scene.
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        // Capped at 1.5 rather than 2 — this scene's per-pixel cost is real
        // (MeshPhysicalMaterial transmission/clearcoat on ~63 meshes total
        // between the cube and the scattered decoration), and on a 2x-DPI
        // display the jump from 1.5 to 2 is another 78% more pixels for a
        // difference that's hard to see, while directly costing frame rate
        // during both the loader (heaviest: cubies still animating every
        // frame) and the theme-toggle wipe (the View Transition has to
        // capture this canvas at its rendered resolution).
        dpr={[1, 1.5]}
        onCreated={(state) => {
          if (canvasRef) canvasRef.current = state.gl.domElement;
        }}
        className="pointer-events-auto">
        <Suspense fallback={null}>
          <SceneContents isLight={isLight} isLoading={isLoading} locked={locked} progressRef={progressRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
