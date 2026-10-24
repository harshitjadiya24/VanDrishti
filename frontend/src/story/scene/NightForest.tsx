// The story's first viewport: a reserve at night, seen by a camera trap. Trunks in ground fog,
// drifting fireflies, and eyeshine low in the trees. Firing the camera flashes the scene, turns
// it to infrared greyscale and freezes it: the striped body (synthetic stripe geometry, not a
// drawing of a tiger) is revealed and the detector's box is drawn over it by the page.
// Own lazy chunk; imported only by the story. Each mount creates its own canvas.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, HueSaturation, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type HueSaturationEffect } from "postprocessing";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { stripeField } from "../stripes";

export interface NightForestProps {
  /** performance.now() when the camera fired, or null while it waits. */
  shotAt: number | null;
  /** The page's detector-box element: the scene positions it over the body every frame. */
  boxRef: RefObject<HTMLDivElement | null>;
  /** Reduced motion: render the captured frame once, with nothing moving. */
  still: boolean;
}

const TIGER = { x: 2.35, y: 1.0, z: -5.6, w: 1.7, h: 0.64 } as const;
const CAMERA: [number, number, number] = [0, 1.25, 6.5];

/** Seeded random numbers: the forest is the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How bright the flash is, t seconds after the shutter: a sharp peak, then the IR level. */
function flashCurve(t: number): { light: number; ir: number } {
  if (t < 0) return { light: 0, ir: 0 };
  const peak = t < 0.07 ? t / 0.07 : Math.exp(-(t - 0.07) * 7);
  return { light: peak, ir: Math.min(1, t / 0.35) };
}

function Trunks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 170;
  const matrices = useMemo(() => {
    const r = seeded(7);
    const out: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    while (out.length < count) {
      const x = (r() - 0.5) * 34;
      const z = -1.5 - r() * 40;
      // Keep a clearing around the animal and a lane down the middle of the view.
      if (Math.abs(x - TIGER.x) < 1.6 && z < -3.6 && z > -7.8) continue;
      if (Math.abs(x) < 0.7 && z > -9) continue;
      const s = 0.7 + r() * 0.9;
      m.compose(new THREE.Vector3(x, 5.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.06, r() * 6.28, (r() - 0.5) * 0.06)), new THREE.Vector3(s, 1, s));
      out.push(m.clone());
    }
    return out;
  }, []);
  return (
    <instancedMesh
      ref={(mesh) => {
        ref.current = mesh;
        if (mesh) { matrices.forEach((mx, i) => mesh.setMatrixAt(i, mx)); mesh.instanceMatrix.needsUpdate = true; }
      }}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <cylinderGeometry args={[0.09, 0.2, 13, 7]} />
      <meshStandardMaterial color="#2a2e33" roughness={1} />
    </instancedMesh>
  );
}

/** The striped flank as a texture: the same stripe field the frames use. */
function useStripeTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(4, 4);
      ctx.beginPath();
      ctx.roundRect(0, 0, 160, 60, 30);
      ctx.clip();
      const g = ctx.createLinearGradient(0, 0, 0, 60);
      g.addColorStop(0, "#d58a2c");
      g.addColorStop(0.7, "#c27620");
      g.addColorStop(1, "#ecdcbc");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 60);
      ctx.translate(-8, -6);
      ctx.scale(0.52, 0.44);
      ctx.fillStyle = "#121212";
      for (const s of stripeField(23, 340, 170)) ctx.fill(new Path2D(s.d));
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
}

function Fireflies({ still }: { still: boolean }) {
  const count = 70;
  const geometry = useMemo(() => {
    const r = seeded(31);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * 16;
      pos[i * 3 + 1] = 0.2 + r() * 3.2;
      pos[i * 3 + 2] = -1 - r() * 16;
      seed[i] = r() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const params = useMemo<THREE.ShaderMaterialParameters>(() => ({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIr: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vGlow;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.35 + aSeed) * 0.45;
        p.y += sin(uTime * 0.5 + aSeed * 1.7) * 0.25;
        p.z += cos(uTime * 0.3 + aSeed) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vGlow = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.6 + aSeed * 3.0), 3.0);
        gl_PointSize = (18.0 + 10.0 * vGlow) * (1.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIr;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vGlow;
        vec3 warm = vec3(1.0, 0.78, 0.36);
        vec3 col = mix(warm, vec3(0.92), uIr) * (1.4 + vGlow);
        gl_FragColor = vec4(col, a);
      }`,
  }), []);
  useFrame(() => {
    if (!still && mat.current) mat.current.uniforms.uTime.value = performance.now() / 1000;
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={mat} args={[params]} />
    </points>
  );
}

function Scene({ shotAt, boxRef, still }: NightForestProps) {
  const stripes = useStripeTexture();
  const flash = useRef<THREE.PointLight>(null);
  const moon = useRef<THREE.HemisphereLight>(null);
  const eyes = useRef<THREE.Group>(null);
  const hue = useRef<HueSaturationEffect>(null);
  const tigerMat = useRef<THREE.MeshStandardMaterial>(null);
  const { camera, size, invalidate } = useThree();
  const corners = useMemo(() => {
    // The detector's box: the body plus the margin a real detection has (as in IRFrame).
    const w = TIGER.w * 1.2;
    const h = TIGER.h * 1.57;
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(
      ([dx, dy]) => new THREE.Vector3(TIGER.x + dx, TIGER.y + dy + 0.04, TIGER.z));
  }, []);
  const v = useMemo(() => new THREE.Vector3(), []);

  // Portrait screens: walk the camera toward the animal and tilt down, so the frame sits in the
  // upper half, above the headline.
  useEffect(() => {
    const portrait = size.width / size.height < 0.85;
    if (portrait) camera.position.set(1.7, 1.35, 6.5);
    else camera.position.set(...CAMERA);
    if (portrait) camera.lookAt(2.2, 0.15, -6);
    else camera.lookAt(0.6, 1.1, -6);
    camera.updateMatrixWorld();
    // A still (reduced-motion) scene renders on demand: draw again with the camera in place, so
    // the detector box is measured from the final view.
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useFrame(() => {
    const t = shotAt === null ? -1 : still ? 10 : (performance.now() - shotAt) / 1000;
    const { light, ir } = flashCurve(t);
    // A light at the camera that falls off with distance: near trunks go silver, the far forest stays dark.
    if (flash.current) flash.current.intensity = light * 90 + ir * 22;
    if (moon.current) moon.current.intensity = 0.32 - ir * 0.18;
    if (hue.current) hue.current.saturation = -ir * 0.97;
    if (tigerMat.current) {
      // Unlit, the body is only a darker shape behind its eyes; the flash shows it.
      tigerMat.current.color.setScalar(0.12 + ir * 0.88);
      tigerMat.current.emissiveIntensity = 0.01 + ir * 0.06;
    }
    // Eyeshine blinks now and then while the night runs; it stays lit in the frozen frame.
    if (eyes.current) {
      const now = performance.now() / 1000;
      const blink = shotAt === null && !still && now % 5.2 < 0.14;
      eyes.current.scale.y = blink ? 0.08 : 1;
    }
    // Position the page's detector box over the body.
    const el = boxRef.current;
    if (el) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of corners) {
        v.copy(c).project(camera);
        const x = (v.x * 0.5 + 0.5) * size.width;
        const y = (-v.y * 0.5 + 0.5) * size.height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
      el.style.width = `${(x1 - x0).toFixed(1)}px`;
      el.style.height = `${(y1 - y0).toFixed(1)}px`;
    }
  });

  return (
    <>
      <color attach="background" args={["#05070a"]} />
      <fogExp2 attach="fog" args={["#080b10", 0.085]} />
      <hemisphereLight ref={moon} args={["#7f95c4", "#05070a", 0.32]} />
      <pointLight ref={flash} position={[CAMERA[0], CAMERA[1] + 0.3, CAMERA[2] - 0.5]} intensity={0} decay={1} distance={0} color="#ffffff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -15]}>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#14171b" roughness={1} />
      </mesh>
      <Trunks />
      <mesh position={[TIGER.x, TIGER.y, TIGER.z]}>
        <planeGeometry args={[TIGER.w, TIGER.h]} />
        <meshStandardMaterial ref={tigerMat} map={stripes} transparent alphaTest={0.5} roughness={0.9}
          emissive="#ffffff" emissiveMap={stripes} emissiveIntensity={0.02} />
      </mesh>
      <group ref={eyes} position={[TIGER.x - TIGER.w / 2 + 0.17, TIGER.y + 0.12, TIGER.z + 0.02]}>
        {[0, 0.1].map((dx) => (
          <mesh key={dx} position={[dx, 0, 0]}>
            <sphereGeometry args={[0.026, 12, 12]} />
            <meshBasicMaterial color={[2.4, 3.2, 1.9]} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Fireflies still={still} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.2} />
        <HueSaturation ref={hue} saturation={0} />
        <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.32} />
        <Vignette offset={0.28} darkness={0.82} />
      </EffectComposer>
    </>
  );
}

export default function NightForest(props: NightForestProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: CAMERA, fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      frameloop={props.still ? "demand" : "always"}
      aria-hidden
    >
      <Scene {...props} />
    </Canvas>
  );
}
