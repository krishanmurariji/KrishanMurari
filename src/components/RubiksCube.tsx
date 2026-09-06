import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { easeOutBack, easeInOutCubic } from '../lib/easing';

const GRID: [number, number, number][] = (() => {
  const temp: [number, number, number][] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        temp.push([x, y, z]);
      }
    }
  }
  return temp;
})();

const SPACING = 1.05;

// Post-assembly reveal choreography: once assembled, the cube "solves"
// itself through a short scripted sequence of layer turns — the actual
// twisting-a-face motion of a real Rubik's cube, not a whole-object spin.
// There's no scramble/colors to genuinely solve here (every cubie is the
// same material), so this is purely the visual language of solving; once
// the sequence finishes, the 27 cubies fly outward to "open" the cube,
// revealing the glass logo that's been sitting behind it the whole time —
// like a diamond hidden in a puzzle cube, released once it's solved.
interface Move {
  axis: 'x' | 'y' | 'z';
  layer: -1 | 0 | 1;
  dir: 1 | -1;
}
const SOLVE_MOVES: Move[] = [
  { axis: 'y', layer: 1, dir: 1 },
  { axis: 'x', layer: -1, dir: -1 },
  { axis: 'z', layer: 1, dir: 1 },
  { axis: 'y', layer: -1, dir: -1 },
  { axis: 'x', layer: 1, dir: 1 },
  { axis: 'z', layer: -1, dir: -1 },
  { axis: 'y', layer: 0, dir: -1 },
];
const MOVE_DURATION = 0.38;
// Tolerance when detecting which cubies currently sit in a layer — moves
// re-detect membership from each cubie's live (post-previous-move) position
// rather than its original assembly slot, since earlier turns permute which
// physical cubie occupies which slot, same as a real cube.
const LAYER_EPSILON = 0.2;
const AXIS_VECTORS: Record<Move['axis'], THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const OPEN_DURATION = 1.2;
const EXPLODE_FACTOR = 2.4; // how far past the assembled grid each cubie flies
// A flat push added on top of the scaled explode, specifically on the
// vertical axis — without this, the middle grid layer (y ~= 0) wouldn't
// move vertically at all (0 * EXPLODE_FACTOR is still 0), leaving those
// cubies sitting right in the gap meant for the name.
const VERTICAL_SPLIT_BOOST = 3.2;

interface Piece {
  target: THREE.Vector3;
  start: THREE.Vector3;
  startRot: THREE.Euler;
  delayStart: number;
  delayEnd: number;
  // Where this cubie lands horizontally/in depth once the cube explodes open
  // — a wide, stable-per-piece random spot rather than a value merely scaled
  // from its tiny original grid offset (±1.05), which left every cubie
  // clustered within a couple units of center instead of covering the
  // screen. Computed once here (not inline during the explode animation) so
  // it doesn't reshuffle every frame.
  explodeX: number;
  explodeZ: number;
}

function usePieces(): Piece[] {
  return useMemo(() => {
    return GRID.map(([x, y, z]) => {
      const target = new THREE.Vector3(x * SPACING, y * SPACING, z * SPACING);

      // Scatter each piece to a random point on a wide shell around the origin
      const radius = 6 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const start = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );

      const startRot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Stagger so pieces don't move in lockstep — reads as an organic, magnetic assembly
      const delayStart = Math.random() * 0.45;
      const delayEnd = 0.55 + Math.random() * 0.45;

      const explodeX = (Math.random() - 0.5) * 20;
      const explodeZ = (Math.random() - 0.5) * 6;

      return { target, start, startRot, delayStart, delayEnd, explodeX, explodeZ };
    });
  }, []);
}

export default function RubiksCube({
  groupRef,
  progressRef,
  assembled,
}: {
  groupRef: React.RefObject<THREE.Group>;
  /** 0..1 assembly progress, driven externally by the loader. Omit to render fully assembled. */
  progressRef?: React.MutableRefObject<{ value: number }>;
  /** Once true, the per-piece assembly loop stops and the post-assembly reveal
   * sequence (solve, then explode open) begins. */
  assembled?: boolean;
}) {
  const meshesRef = useRef<(THREE.Mesh | null)[]>([]);
  const pieces = usePieces();
  const phaseRef = useRef<'assembling' | 'solving' | 'opening' | 'open'>('assembling');
  const phaseElapsedRef = useRef(0);
  const wasAssembled = useRef(assembled);
  // Solve-sequence bookkeeping — which cubies the current move affects, and
  // their position/orientation at the *start* of this specific move (every
  // frame computes from this fixed snapshot rather than accumulating small
  // per-frame rotations, which would drift).
  const moveIndexRef = useRef(0);
  const moveElapsedRef = useRef(0);
  const moveAffectedRef = useRef<number[] | null>(null);
  const moveStartPosRef = useRef<THREE.Vector3[] | null>(null);
  const moveStartQuatRef = useRef<THREE.Quaternion[] | null>(null);
  // Snapshot of every cubie's position the instant "opening" begins — since
  // the solve sequence permutes which physical cubie sits in which slot, the
  // explode direction has to come from where each cubie actually is *now*,
  // not its original assembly target.
  const openStartPosRef = useRef<THREE.Vector3[] | null>(null);

  // Kicks off the reveal sequence exactly once, on the false→true transition —
  // not on every render, and not re-triggered if `assembled` were ever to
  // flicker (it shouldn't, but this makes the sequence a one-shot regardless).
  useEffect(() => {
    if (assembled && !wasAssembled.current) {
      phaseRef.current = 'solving';
      phaseElapsedRef.current = 0;
    }
    wasAssembled.current = assembled;
  }, [assembled]);

  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0.9,
    roughness: 0.1,
    transmission: 0.8,
    ior: 1.5,
    thickness: 0.5,
    envMapIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  }), []);

  useFrame((_state, delta) => {
    if (!assembled) {
      if (!progressRef) return;
      const p = progressRef.current.value; // 0..1

      meshesRef.current.forEach((mesh, i) => {
        if (!mesh) return;
        const piece = pieces[i];
        const local = THREE.MathUtils.clamp(
          (p - piece.delayStart) / (piece.delayEnd - piece.delayStart),
          0,
          1
        );
        const eased = easeOutBack(local);

        mesh.position.lerpVectors(piece.start, piece.target, eased);

        // Unwind the tumbling rotation down to identity as the piece homes in
        const remaining = 1 - easeInOutCubic(local);
        mesh.rotation.set(
          piece.startRot.x * remaining,
          piece.startRot.y * remaining,
          piece.startRot.z * remaining
        );

        const scale = 0.55 + 0.45 * easeInOutCubic(local);
        mesh.scale.setScalar(scale);
      });
      return;
    }

    // Post-assembly reveal: "solve" the cube via a scripted sequence of real
    // layer turns, then explode the cubies outward to "open" it, then hand
    // off to the parent to reveal the name that was "inside."
    if (phaseRef.current === 'assembling') return; // effect hasn't flipped us over yet this frame

    if (phaseRef.current === 'solving') {
      const move = SOLVE_MOVES[moveIndexRef.current];
      const axisVec = AXIS_VECTORS[move.axis];

      // First frame of this move: snapshot which cubies currently sit in the
      // targeted layer, and their exact position/orientation right now, so
      // the whole move animates from one fixed reference instead of drifting
      // frame to frame.
      if (!moveAffectedRef.current) {
        const layerVal = move.layer * SPACING;
        const affected: number[] = [];
        const startPos: THREE.Vector3[] = [];
        const startQuat: THREE.Quaternion[] = [];
        meshesRef.current.forEach((mesh, i) => {
          if (!mesh) return;
          const coord = move.axis === 'x' ? mesh.position.x : move.axis === 'y' ? mesh.position.y : mesh.position.z;
          if (Math.abs(coord - layerVal) < LAYER_EPSILON) {
            affected.push(i);
            startPos.push(mesh.position.clone());
            startQuat.push(mesh.quaternion.clone());
          }
        });
        moveAffectedRef.current = affected;
        moveStartPosRef.current = startPos;
        moveStartQuatRef.current = startQuat;
      }

      moveElapsedRef.current += delta;
      const t = Math.min(moveElapsedRef.current / MOVE_DURATION, 1);
      const angle = easeInOutCubic(t) * move.dir * (Math.PI / 2);
      const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);

      moveAffectedRef.current.forEach((idx, k) => {
        const mesh = meshesRef.current[idx];
        if (!mesh) return;
        mesh.position.copy(moveStartPosRef.current![k]).applyAxisAngle(axisVec, angle);
        mesh.quaternion.copy(deltaQuat).multiply(moveStartQuatRef.current![k]);
      });

      if (t >= 1) {
        // Snap to exact grid values to clear any float drift before the next
        // move re-detects layer membership from these same positions.
        moveAffectedRef.current.forEach((idx) => {
          const mesh = meshesRef.current[idx];
          if (!mesh) return;
          mesh.position.set(
            Math.round(mesh.position.x / SPACING) * SPACING,
            Math.round(mesh.position.y / SPACING) * SPACING,
            Math.round(mesh.position.z / SPACING) * SPACING
          );
        });
        moveAffectedRef.current = null;
        moveElapsedRef.current = 0;
        moveIndexRef.current += 1;
        if (moveIndexRef.current >= SOLVE_MOVES.length) {
          phaseRef.current = 'opening';
          phaseElapsedRef.current = 0;
        }
      }
      return;
    }

    if (phaseRef.current === 'opening') {
      if (!openStartPosRef.current) {
        openStartPosRef.current = meshesRef.current.map((mesh) => (mesh ? mesh.position.clone() : new THREE.Vector3()));
      }
      phaseElapsedRef.current += delta;
      const t = Math.min(phaseElapsedRef.current / OPEN_DURATION, 1);
      const eased = easeOutBack(t);
      meshesRef.current.forEach((mesh, i) => {
        if (!mesh) return;
        const piece = pieces[i];
        const startPos = openStartPosRef.current![i];
        // A top/bottom split rather than a uniform radial scatter — half the
        // cubies fly up, half fly down, clearing a gap in the middle for
        // whatever's "inside" to be seen, like a chest opening rather than a
        // cube dissolving into an even cloud. The middle grid layer
        // (startPos.y ~= 0) has nothing to bias it vertically on its own, so
        // it's split by x sign instead, to still roughly halve it between
        // the two groups rather than leaving it stranded in the gap.
        const goesUp = startPos.y > LAYER_EPSILON || (Math.abs(startPos.y) <= LAYER_EPSILON && startPos.x >= 0);
        const verticalDir = goesUp ? 1 : -1;
        // Horizontal/depth spread comes from each piece's own wide, stable
        // explode target — not startPos.x/z scaled up, which only ever
        // ranged across the cube's own tiny ±1.05 footprint and left every
        // cubie clustered within a couple units of center instead of
        // covering the screen.
        const exploded = new THREE.Vector3(
          piece.explodeX,
          verticalDir * (Math.abs(startPos.y) * EXPLODE_FACTOR + VERTICAL_SPLIT_BOOST),
          startPos.z + piece.explodeZ
        );
        mesh.position.lerpVectors(startPos, exploded, eased);
        // A bit of tumble as each cubie flies outward, spinning around its
        // own flight direction — reads as debris, not a rigid, lifeless slide.
        if (startPos.lengthSq() > 0.0001) {
          mesh.rotateOnAxis(startPos.clone().normalize(), delta * 1.5);
        }
      });
      if (t >= 1) {
        phaseRef.current = 'open';
      }
    }
  });

  return (
    <group ref={groupRef} frustumCulled={false}>
      {pieces.map((piece, i) => (
        <RoundedBox
          key={i}
          ref={(el) => { meshesRef.current[i] = el; }}
          position={progressRef ? piece.start : piece.target}
          args={[1, 1, 1]}
          radius={0.1}
          smoothness={4}
          material={material}
          name={`cube-${i}`}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
