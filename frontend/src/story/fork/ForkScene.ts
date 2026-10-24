// The routing fork in three.js: frames come down one road and split into five lanes. Lanes
// that need a person end at a check-post boom that only the visitor can lift.
// Lane weights are the measured sample counts (results.ts); the motion is illustrative.

import * as THREE from "three";

export interface LaneSpec {
  id: string;
  weight: number;
  color: string;
  needsPerson: boolean;
}

interface Frame {
  t: number; // 0..1 along the lane
  passed: boolean; // a person let it through
}

const FOG = "#07090b";
const ROAD = "#1a1d22";
const MAX_PER_LANE = 36;
const BOOM_T = 0.74; // where on a lane the check-post stands
const GAP = 0.034; // spacing between queued frames, in lane fraction
const SPEED = 0.075; // lane fractions per second

/** A flat ribbon following a curve: a lane's road surface. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, segments = 80): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const p = curve.getPointAt(i / segments);
    const tan = curve.getTangentAt(i / segments);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, 0.01, p.z - side.z, p.x + side.x, 0.01, p.z + side.z);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Red-and-white bands for the boom, painted on a small canvas. */
function boomTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext("2d");
  if (ctx) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#edeef0" : "#ff5a68";
      ctx.fillRect(i * 32, 0, 32, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class ForkScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private lanes: { spec: LaneSpec; curve: THREE.CatmullRomCurve3; mesh: THREE.InstancedMesh; frames: Frame[] }[] = [];
  private boom: THREE.Group;
  private boomAngle = 0; // 0 = closed (across the lanes), up to ~1.35 when lifted
  private boomTarget = 0;
  private last = 0; // performance.now() of the previous frame
  private spawnAcc = 0;
  private progress = 0;
  private running = false;
  private raf = 0;
  private random = rng(17);
  private dummy = new THREE.Object3D();
  private disposables: { dispose: () => void }[] = [];
  onPassed?: (count: number) => void;
  private passedCount = 0;

  constructor(canvas: HTMLCanvasElement, specs: LaneSpec[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.Fog(FOG, 40, 140);

    this.scene.add(new THREE.HemisphereLight("#c9ced6", "#07090b", 1.0));
    const sun = new THREE.DirectionalLight("#e9edf2", 0.8);
    sun.position.set(-12, 20, 10);
    this.scene.add(sun);

    const groundGeo = new THREE.PlaneGeometry(220, 220);
    const groundMat = new THREE.MeshLambertMaterial({ color: "#0f1114" });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.disposables.push(groundGeo, groundMat);

    // The trunk road and the five lanes.
    const roadMat = new THREE.MeshLambertMaterial({ color: ROAD });
    this.disposables.push(roadMat);
    const n = specs.length;
    specs.forEach((spec, i) => {
      const lx = (i - (n - 1) / 2) * 6.2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, -70),
        new THREE.Vector3(0, 0, -30),
        new THREE.Vector3(lx * 0.35, 0, -14),
        new THREE.Vector3(lx, 0, -2),
        new THREE.Vector3(lx, 0, 12),
        new THREE.Vector3(lx, 0, 30),
      ]);
      const laneGeo = ribbon(curve, 2.6);
      const lane = new THREE.Mesh(laneGeo, roadMat);
      this.scene.add(lane);
      // A painted edge line in the lane's colour from the fork onward.
      const edgeGeo = ribbon(new THREE.CatmullRomCurve3(curve.points.slice(2)), 0.14);
      const edgeMat = new THREE.MeshBasicMaterial({ color: spec.color });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.y = 0.02;
      this.scene.add(edge);
      this.disposables.push(laneGeo, edgeGeo, edgeMat);

      const cardGeo = new THREE.BoxGeometry(2.0, 0.12, 1.35);
      const cardMat = new THREE.MeshLambertMaterial({ color: "#edeef0" });
      const mesh = new THREE.InstancedMesh(cardGeo, cardMat, MAX_PER_LANE);
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move along the whole lane; the bounds would go stale
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this.disposables.push(cardGeo, cardMat);
      this.lanes.push({ spec, curve, mesh, frames: [] });
    });

    // The check-post: two posts and one striped boom across the lanes that need a person.
    const personLanes = this.lanes.filter((l) => l.spec.needsPerson);
    const xs = personLanes.map((l) => l.curve.getPointAt(BOOM_T).x);
    const left = Math.min(...xs) - 2;
    const right = Math.max(...xs) + 2;
    const z = personLanes[0]?.curve.getPointAt(BOOM_T).z ?? 0;
    const postGeo = new THREE.BoxGeometry(0.35, 2.2, 0.35);
    const postMat = new THREE.MeshLambertMaterial({ color: "#121418" });
    [left, right].forEach((x) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.1, z);
      this.scene.add(post);
    });
    const tex = boomTexture();
    const boomLen = right - left;
    const boomGeo = new THREE.BoxGeometry(boomLen, 0.32, 0.32);
    const boomMat = new THREE.MeshLambertMaterial({ map: tex });
    const bar = new THREE.Mesh(boomGeo, boomMat);
    bar.position.x = boomLen / 2;
    this.boom = new THREE.Group();
    this.boom.add(bar);
    this.boom.position.set(left, 1.6, z);
    this.scene.add(this.boom);
    this.disposables.push(postGeo, postMat, tex, boomGeo, boomMat);

    // Forest on both sides of the trunk road.
    const treeGeo = new THREE.ConeGeometry(1.1, 4.2, 7);
    const treeMat = new THREE.MeshLambertMaterial({ color: "#16191d" });
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, 260);
    let placed = 0;
    while (placed < 260) {
      const x = (this.random() - 0.5) * 120;
      const zz = -90 + this.random() * 110;
      const nearRoad = Math.abs(x) < 4 + (zz > -30 ? (zz + 30) * 0.6 : 0) + 3;
      if (nearRoad) continue;
      const s = 0.7 + this.random() * 0.9;
      this.dummy.position.set(x, 2.1 * s, zz);
      this.dummy.scale.set(s, s, s);
      this.dummy.rotation.set(0, this.random() * Math.PI, 0);
      this.dummy.updateMatrix();
      trees.setMatrixAt(placed++, this.dummy.matrix);
    }
    this.scene.add(trees);
    this.disposables.push(treeGeo, treeMat);

    // Start with some frames already on the road, so the first view is not empty.
    // Warm up long enough that every lane is moving and queues already wait at the boom.
    for (let k = 0; k < 320; k++) this.step(0.1);
    this.setProgress(0);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.setProgress(this.progress);
  }

  /** Scroll position through the section, 0..1: the camera drops from overview to the gate. */
  setProgress(p: number): void {
    this.progress = Math.min(1, Math.max(0, p));
    const e = this.progress;
    // Narrow screens pull the camera back so all five lanes stay in frame.
    const fit = this.camera.aspect < 1.3 ? 1.3 / this.camera.aspect : 1;
    const target = new THREE.Vector3(0, 0, -10 + 6 * e);
    const offset = new THREE.Vector3(-6 + 4 * e, 30 - 18 * e, 50 - 6 * e).multiplyScalar(fit);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    // The fog moves back with the camera, or a pulled-back camera sees only fog.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 40 * fit;
    fog.far = 140 * fit;
    if (!this.running) this.render();
  }

  /** The visitor pressed Review: lift the boom, let queued frames through, close it again. */
  review(): void {
    this.boomTarget = 1.35;
    window.setTimeout(() => { this.boomTarget = 0; }, 2600);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.step(Math.min((now - this.last) / 1000, 0.05));
      this.last = now;
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** One frame of static state, for reduced motion (no movement at all). */
  renderStill(): void {
    this.render();
  }

  private pickLane(): number {
    const total = this.lanes.reduce((s, l) => s + l.spec.weight, 0);
    let r = this.random() * total;
    for (let i = 0; i < this.lanes.length; i++) {
      r -= this.lanes[i].spec.weight;
      if (r <= 0) return i;
    }
    return this.lanes.length - 1;
  }

  private step(dt: number): void {
    this.spawnAcc += dt * 3.2;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const lane = this.lanes[this.pickLane()];
      const last = lane.frames[lane.frames.length - 1];
      if (lane.frames.length < MAX_PER_LANE && (!last || last.t > GAP)) lane.frames.push({ t: 0, passed: false });
    }
    this.boomAngle += (this.boomTarget - this.boomAngle) * Math.min(1, dt * 7);
    const open = this.boomAngle > 1.0;
    this.boom.rotation.z = this.boomAngle;

    for (const lane of this.lanes) {
      const frames = lane.frames;
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        let next = f.t + SPEED * dt;
        const ahead = frames[i - 1];
        if (ahead && next > ahead.t - GAP) next = Math.max(f.t, ahead.t - GAP);
        if (lane.spec.needsPerson && !f.passed && f.t <= BOOM_T - 0.005) {
          if (next >= BOOM_T - 0.005) {
            if (open) {
              f.passed = true;
              this.passedCount++;
              this.onPassed?.(this.passedCount);
            } else next = BOOM_T - 0.005;
          }
        }
        f.t = next;
      }
      lane.frames = frames.filter((f) => f.t < 1);
      const color = new THREE.Color();
      lane.frames.forEach((f, i) => {
        const p = lane.curve.getPointAt(f.t);
        const tan = lane.curve.getTangentAt(f.t);
        this.dummy.position.set(p.x, 0.16, p.z);
        this.dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        lane.mesh.setMatrixAt(i, this.dummy.matrix);
        // Before the fork every frame is unsorted enamel; after it, it takes its lane's colour.
        // A frame a person let through turns white again: decided.
        const sorted = f.t > 0.3;
        color.set(f.passed ? "#ffffff" : sorted ? lane.spec.color : "#c9ced6");
        lane.mesh.setColorAt(i, color);
      });
      lane.mesh.count = lane.frames.length;
      lane.mesh.instanceMatrix.needsUpdate = true;
      if (lane.mesh.instanceColor) lane.mesh.instanceColor.needsUpdate = true;
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    for (const lane of this.lanes) lane.mesh.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // free the GPU context now, not at garbage collection
  }
}
