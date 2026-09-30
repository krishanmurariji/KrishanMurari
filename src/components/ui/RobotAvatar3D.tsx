// A tiny real-3D robot mascot for the chat header — same stack (three.js /
// @react-three/fiber / drei) as the hero Rubik's cube scene. Unlike the
// rest of this app's 3D work, this one *is* an imported model: it's the
// author's own asset (Verlangieri's "boule" robot, codepen.io/verlangieri/
// pen/xEyprg / github.com/Verlangieri/robot-animation — the pen's own CDN
// is long dead, but the source repo isn't), so the licensing question that
// rules out reusing someone else's model doesn't apply here. Deliberately
// mounted just once, in the chat header only — the per-message avatars
// stay the flat SVG version (RobotAvatar.tsx) rather than each spinning up
// their own WebGL context, since browsers cap how many of those a page can
// hold at once and a message-per-context 3D scene would be real,
// unbounded GPU cost for a decorative detail.
//
// A single hovering metal ball with one big mechanical camera-eye — no
// head/body/limbs. The model's own node names (Body, Eye, Lens,
// Contour-Lens, Eyelid-top/-bottom, seven Tube ribs) and its two textures
// (face.jpg — the lens's radiating aperture-blade iris; texture.jpg — the
// weathered body shell) are loaded as-is via ColladaLoader, the same way
// the original CodePen's Robot class does. What's different from that
// original vanilla-Three.js class is the surrounding plumbing: it drives
// its own full-page renderer/scene/camera/ground/dat.GUI, none of which
// fits an embedded React widget, so that part is rebuilt on
// @react-three/fiber's Canvas instead — the model, its textures, its named
// node references, and its actual animation values (eyelid angles, flying
// bob amplitude, mouse-look formulas, the drop-and-bounce intro) are the
// same, just orchestrated with gsap.to/gsap.timeline (already a dependency
// elsewhere in this app) inside React's lifecycle rather than a
// requestAnimationFrame loop appending to document.body.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import * as THREE from 'three';
import gsap from 'gsap';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

export type BotExpression = 'normal' | 'happy' | 'thinking' | 'angry';

const MODEL_URL = '/robot/boule.dae';
const FACE_TEXTURE_URL = '/robot/face.jpg';
const BODY_TEXTURE_URL = '/robot/texture.jpg';

// The model's own "Body" mesh is ~142 units across (its native, unscaled
// COLLADA units) — rather than replicate the original's camera-distance-27
// framing for that raw size, the loaded clone is uniformly scaled so its
// bounding sphere matches TARGET_RADIUS, fitting this app's existing small
// embedded Canvas/camera setup. Every animation amplitude below that's
// applied to a node *inside* that scaled group (the eye, the eyelids)
// reuses the original's exact numbers unchanged, since the ancestor scale
// already converts them; only the outer pivot's own intro-drop distance
// needs manual conversion, since a group's own position isn't affected by
// its own scale.
const TARGET_RADIUS = 0.62;

// The original's exact animation constants (Robot.prototype.animation),
// kept as-is rather than re-tuned — except FLYING_HEIGHT, which doesn't
// have a meaningful analog here: it was how far above the original scene's
// own ground plane (at y=-7 in that scene's units) the character rested,
// not a small idle-bob amplitude. This component has no ground and its
// camera is centered on world origin, so the correct rest height is just
// 0 (see the turnOn tween below) — scaling the original's absolute height
// by TARGET_RADIUS's normalizing factor doesn't translate; it landed the
// ball comfortably above center, clipped against the top of tight
// containers (the "head cuts off" bug).
const FLYING_FREQ = 0.015;
const EYE_AMPLITUDE = 2;
const EYELID_AMPLITUDE = 1;
const MODELS_AMPLITUDE = 0.3;
const REACTION_TIME = 0.1;
const MOUSE_SPEED = 0.5;

// The original's exact resting eyelid angles (degrees): -75/-100 open,
// -88/-85 closed. `eyelidsOpening` was a dat.GUI debug slider (0–10) in
// the original; there's no debug panel on a live site, so it's repurposed
// here as the expression lever instead — the same parameter, driving the
// same math, just set by `expression` rather than a slider.
const EYELID_TOP_OPEN_DEG = -75;
const EYELID_TOP_CLOSED_DEG = -88;
const EYELID_BOTTOM_OPEN_DEG = -100;
const EYELID_BOTTOM_CLOSED_DEG = -85;

const STAR_COLOR = '#ffd54f';

interface ExpressionTarget {
  eyelidsOpening: number;
  stars: number; // 0 = hidden, 1 = fully visible orbiting the ball — not part of the original model, a small addition for the angry state since this character has no mouth/eyebrows to carry it.
}

const EXPRESSION_TARGETS: Record<BotExpression, ExpressionTarget> = {
  normal: { eyelidsOpening: 0, stars: 0 },
  happy: { eyelidsOpening: 4, stars: 0 },
  thinking: { eyelidsOpening: -6, stars: 0 },
  angry: { eyelidsOpening: -8, stars: 1 },
};

const EXPRESSION_LERP = 0.14;

interface ModelNodes {
  root: THREE.Object3D;
  eye: THREE.Object3D;
  eyelidTop: THREE.Object3D;
  eyelidBottom: THREE.Object3D;
  scale: number;
}

function useRobotModel(): ModelNodes {
  const collada = useLoader(ColladaLoader, MODEL_URL);
  const [faceTexture, bodyTexture] = useLoader(THREE.TextureLoader, [FACE_TEXTURE_URL, BODY_TEXTURE_URL]);

  // Texture assignment mirrors the original's newRobot(): the Lens gets
  // face.jpg (the iris), the Body's own shell gets texture.jpg (the
  // weathered metal). Mutating the shared, cached materials is safe and
  // idempotent across the multiple instances this component mounts (chat
  // header, photo widget, expression previews).
  useMemo(() => {
    faceTexture.minFilter = THREE.LinearFilter;
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    bodyTexture.minFilter = THREE.LinearFilter;
    bodyTexture.colorSpace = THREE.SRGBColorSpace;
    const lens = collada.scene.getObjectByName('Lens') as THREE.Mesh | undefined;
    if (lens && lens.material) {
      (lens.material as THREE.MeshStandardMaterial).map = faceTexture;
      (lens.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
    const body = collada.scene.getObjectByName('Body') as THREE.Mesh | undefined;
    const bodyChild = body?.children[0] as THREE.Mesh | undefined;
    if (bodyChild && bodyChild.material) {
      (bodyChild.material as THREE.MeshStandardMaterial).map = bodyTexture;
      (bodyChild.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
    return null;
  }, [collada, faceTexture, bodyTexture]);

  // Each mounted instance gets its own clone of the node hierarchy (so the
  // chat header, the photo widget, and the four expression previews all
  // animate independently) while sharing the same geometries/materials/
  // textures underneath — same pattern as the original's single instance,
  // just repeated safely.
  return useMemo(() => {
    const root = collada.scene.clone(true);
    root.rotation.y = THREE.MathUtils.degToRad(-90); // "Rotate robot in front direction" — the original's own comment.

    const eye = root.getObjectByName('Eye')!;
    const eyelidTop = root.getObjectByName('Eyelid-top')!;
    const eyelidBottom = root.getObjectByName('Eyelid-bottom')!;
    eyelidTop.rotation.x = THREE.MathUtils.degToRad(EYELID_TOP_CLOSED_DEG);
    eyelidBottom.rotation.x = THREE.MathUtils.degToRad(EYELID_BOTTOM_CLOSED_DEG);

    // Centered and scaled off the "Body" shell specifically, not the whole
    // assembly's bounding box — the eyelids/eye are mid-animation targets
    // whose position varies by pose, so bounding the whole root would make
    // the recenter (and therefore how high the ball sits on screen) depend
    // on whatever pose happened to be set at the moment this ran. The Body
    // is the one part that's always the same sphere, so it's the stable
    // thing to center on. (Also has to run after the eyelid rotations
    // above are set, not before — Box3.setFromObject reads current world
    // matrices, and computing this from the model's raw, un-set default
    // pose was the actual cause of the "ball rests too high, head crops"
    // bug: the recenter offset didn't match what was actually on screen.)
    const bodyNode = root.getObjectByName('Body')!;
    // Box3.setFromObject doesn't reliably pick up the rotation/eyelid
    // changes just made above on this freshly-cloned tree without an
    // explicit matrix update first — without this, it was measuring off
    // stale (pre-mutation, and critically pre-ColladaLoader's own implicit
    // unit-scale) matrices, throwing naturalRadius off by ~40x and making
    // the whole character render as a barely-visible speck.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bodyNode);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const naturalRadius = Math.max(size.x, size.y, size.z) / 2;
    const scale = naturalRadius > 0 ? TARGET_RADIUS / naturalRadius : 1;

    return { root, eye, eyelidTop, eyelidBottom, scale };
  }, [collada]);
}

function Bot({ reducedMotion, expression, trackMouse, onIntroComplete }: { reducedMotion: boolean; expression: BotExpression; trackMouse?: boolean; onIntroComplete?: () => void }) {
  const { root, eye, eyelidTop, eyelidBottom, scale } = useRobotModel();

  const pivot = useRef<THREE.Group>(null); // "this.mesh" in the original — the outer pivot the intro drop/bounce/spin animates.
  const modelGroup = useRef<THREE.Group>(null); // "this.models" — the scaled model root the idle flying bob is applied to.
  const stars = useRef<THREE.Group>(null);
  const starMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STAR_COLOR, emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 }), []);

  const smoothed = useRef({ eyelidsOpening: 0, stars: 0 });
  const flyCoef = useRef(0);
  const introComplete = useRef(false);
  // Starts hidden and only ever flips true, once, from the layout effect
  // below — never recomputed from other props — so an unrelated re-render
  // (an expression change, say) can't stomp it back to false the way a
  // plain JSX `visible={someExpressionEveryRenderRecomputes}` would.
  // Without this, the very first frame rendered whatever pose the model's
  // default transform happened to be in (T-pose/rest, fully visible)
  // before the effect below had a chance to jump it up to its off-screen
  // drop-start position — a real one-frame "flash of the bot, then it
  // vanishes" bug. useLayoutEffect (not useEffect) so this — and the
  // gsap.set() below that establishes the drop-start position — both run
  // before the browser ever gets to paint, not after.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!pivot.current || !modelGroup.current) return;
    introComplete.current = false;
    if (reducedMotion) {
      eyelidTop.rotation.x = THREE.MathUtils.degToRad(EYELID_TOP_OPEN_DEG);
      eyelidBottom.rotation.x = THREE.MathUtils.degToRad(EYELID_BOTTOM_OPEN_DEG);
      introComplete.current = true;
      setReady(true);
      onIntroComplete?.();
      return;
    }

    // Captured once, up front, rather than re-read as `pivot.current`
    // later: React clears ref values during unmount before running effect
    // cleanups, so a cleanup that reads `pivot.current` itself can already
    // see null and crash — this closure keeps a stable, always-valid
    // reference for both the delayed callbacks and the cleanup below.
    const pivotNode = pivot.current;

    const dropHeight = 15 * scale;
    gsap.set(pivotNode.position, { y: dropHeight });
    gsap.set(pivotNode.rotation, { y: THREE.MathUtils.degToRad(720), z: THREE.MathUtils.degToRad(720) });
    setReady(true);

    const turnOff = gsap.delayedCall(1, () => {
      gsap.to(pivotNode.position, { duration: 1.5, y: 0, ease: 'bounce.out' });
      gsap.to(pivotNode.rotation, {
        duration: 2,
        x: THREE.MathUtils.degToRad(Math.random() * -20),
        y: THREE.MathUtils.degToRad(Math.random() * 60 - 30),
        z: THREE.MathUtils.degToRad(Math.random() * 40 - 20),
        ease: 'power2.out',
      });
    });
    const turnOn = gsap.delayedCall(3, () => {
      gsap.to(pivotNode.position, { duration: 1.5, y: 0, ease: 'power2.out' });
      gsap.to(pivotNode.rotation, { duration: 1, x: 0, y: 0, z: 0, ease: 'power2.out' });
      gsap.to(eyelidTop.rotation, { duration: 0.5, delay: 1.5, x: THREE.MathUtils.degToRad(EYELID_TOP_OPEN_DEG), ease: 'power2.out' });
      gsap.to(eyelidBottom.rotation, {
        duration: 0.5,
        delay: 1.5,
        x: THREE.MathUtils.degToRad(EYELID_BOTTOM_OPEN_DEG),
        ease: 'power2.out',
        onStart: () => { introComplete.current = true; onIntroComplete?.(); },
      });
    });

    return () => {
      turnOff.kill();
      turnOn.kill();
      gsap.killTweensOf(pivotNode.position);
      gsap.killTweensOf(pivotNode.rotation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, scale]);

  // Mouse interaction — the original's mouseAnimation(), event-driven via
  // gsap.to rather than continuous per-frame lerping, opt-in via
  // `trackMouse` (the docked/panel bot instances don't want the visitor's
  // cursor stealing focus from the conversation itself).
  useEffect(() => {
    if (!trackMouse || reducedMotion) return;
    const eyelidsOpeningDeg = () => smoothed.current.eyelidsOpening;
    const handleMove = (e: MouseEvent) => {
      if (!introComplete.current || !pivot.current) return;
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = -(e.clientY / window.innerHeight) * 2 + 1;
      gsap.to(eye.rotation, { duration: MOUSE_SPEED, x: my / 5, y: mx / 3, delay: REACTION_TIME });
      gsap.to(pivot.current.rotation, { duration: MOUSE_SPEED, y: mx / 2, x: -(my / 5), delay: REACTION_TIME });
      gsap.to(eyelidTop.rotation, {
        duration: MOUSE_SPEED,
        y: mx / 4,
        x: THREE.MathUtils.degToRad(EYELID_TOP_OPEN_DEG + eyelidsOpeningDeg()) + (my - Math.abs(mx)) / 10,
        delay: REACTION_TIME,
      });
      gsap.to(eyelidBottom.rotation, {
        duration: MOUSE_SPEED,
        y: mx / 4,
        x: THREE.MathUtils.degToRad(EYELID_BOTTOM_OPEN_DEG - eyelidsOpeningDeg()) + (my + Math.abs(mx)) / 10,
        delay: REACTION_TIME,
      });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [trackMouse, reducedMotion, eye, eyelidTop, eyelidBottom]);

  useFrame(() => {
    if (!modelGroup.current || !stars.current) return;

    const target = EXPRESSION_TARGETS[expression];
    const s = smoothed.current;
    s.eyelidsOpening = s.eyelidsOpening + (target.eyelidsOpening - s.eyelidsOpening) * EXPRESSION_LERP;
    s.stars = s.stars + (target.stars - s.stars) * EXPRESSION_LERP;
    stars.current.scale.setScalar(s.stars);
    stars.current.rotation.y += 0.025;

    if (reducedMotion || !introComplete.current) return;

    // The original's flyingAnimation(): a shared sine coefficient drives
    // the eye, both eyelids, and the whole model in and out of a gentle
    // hover — same formula, same amplitudes (auto-scaled since these
    // nodes are descendants of the scaled modelGroup, except modelGroup's
    // own position, which needs the manual `* scale`).
    flyCoef.current += FLYING_FREQ;
    const c = Math.sin(Math.PI * flyCoef.current);
    eye.position.y = EYE_AMPLITUDE * c;
    eyelidTop.position.y = EYELID_AMPLITUDE * c;
    eyelidBottom.position.y = EYELID_AMPLITUDE * c;
    modelGroup.current.position.y = c * MODELS_AMPLITUDE * scale;
  });

  return (
    <group ref={pivot} visible={ready}>
      <group ref={modelGroup} scale={scale}>
        <primitive object={root} />
      </group>
      <group ref={stars} position={[0, TARGET_RADIUS * 1.15, 0]} scale={0}>
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

export default function RobotAvatar3D({ className, expression = 'normal', trackMouse = false, onIntroComplete }: { className?: string; expression?: BotExpression; trackMouse?: boolean; onIntroComplete?: () => void }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0.02, 4.6], fov: 32 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} frameloop={reducedMotion ? 'demand' : 'always'}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.5, 2, 3]} intensity={1.4} />
        <directionalLight position={[-2, -1, 1.5]} intensity={0.4} />
        <Suspense fallback={null}>
          <Bot reducedMotion={reducedMotion} expression={expression} trackMouse={trackMouse} onIntroComplete={onIntroComplete} />
        </Suspense>
      </Canvas>
    </div>
  );
}
