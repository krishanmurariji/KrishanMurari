import { useState, useEffect } from 'react';
import * as THREE from 'three';

const LOGO_URL = '/android-chrome-512x512.png';
const PLANE_HEIGHT = 2.6; // world units

// Rebuilds the source PNG as a clean grayscale mask driven directly by its
// own alpha channel (white = opaque logo, black = transparent background),
// rather than handing the raw PNG straight to `alphaMap`. alphaMap only
// reads a texture's RGB luminance — it ignores a real alpha channel
// entirely — so relying on the PNG's own transparency there would only
// work by coincidence of how its "background" pixels happen to be
// colored. Regenerating the mask from the actual alpha values guarantees
// the cutout is correct regardless of that.
function useLogoMaskTexture(url: string) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        data[i] = a;
        data[i + 1] = a;
        data[i + 2] = a;
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      setAspect(img.width / img.height);
      setTexture(tex);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { texture, aspect };
}

export default function GlassLogo3D({ position }: { position: [number, number, number] }) {
  const { texture, aspect } = useLogoMaskTexture(LOGO_URL);

  if (!texture) return null;

  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[PLANE_HEIGHT * aspect, PLANE_HEIGHT]} />
        {/* Same glass material as RubiksCube's own cubies and the name text
            before it, for visual consistency across everything that emerges
            from the cube. */}
        <meshPhysicalMaterial
          color="#ffffff"
          alphaMap={texture}
          transparent
          side={THREE.DoubleSide}
          metalness={0.9}
          roughness={0.1}
          transmission={0.8}
          ior={1.5}
          thickness={0.5}
          envMapIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[100, 400]}
        />
      </mesh>
    </group>
  );
}
