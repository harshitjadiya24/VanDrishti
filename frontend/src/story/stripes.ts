// Stripe-signature geometry: a deterministic field of tapered stripes, the pattern re-ID
// compares between sightings. Exact shapes from a seed, not a drawing of a tiger.

export interface Stripe { d: string }

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a tapered stroke along a cubic curve: widest in the middle, pointed at both ends. */
function blade(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
  width: number, steps = 18,
): string {
  const at = (t: number): [number, number] => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = at(t);
    const [nx, ny] = at(Math.min(1, t + 0.01));
    const [px, py] = at(Math.max(0, t - 0.01));
    const dx = nx - px;
    const dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    // Asymmetric swell: stripes are heavier near their upper third.
    const w = width * Math.sin(Math.PI * t) ** 0.8 * (1.15 - 0.4 * t);
    left.push(`${(x - (dy / len) * w).toFixed(1)},${(y + (dx / len) * w).toFixed(1)}`);
    right.push(`${(x + (dy / len) * w).toFixed(1)},${(y - (dx / len) * w).toFixed(1)}`);
  }
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

/** A cropped flank: leaning, curved, tapered stripes of mixed length, some in close pairs,
 * some branching. Deterministic for a seed. */
export function stripeField(seed: number, w: number, h: number, count = 15): Stripe[] {
  const r = rng(seed);
  const out: Stripe[] = [];
  const gap = w / count;
  for (let i = 0; i < count; i++) {
    const x = gap * (i + 0.5) + (r() - 0.5) * gap * 0.7;
    const y0 = -h * 0.1 + r() * h * 0.35;
    const length = h * (0.45 + r() * 0.6);
    const lean = (r() - 0.35) * gap * 2.2;
    const sway = (r() - 0.5) * gap * 1.4;
    const width = 2.5 + r() * 6;
    const p0: [number, number] = [x, y0];
    const p3: [number, number] = [x + lean, y0 + length];
    const p1: [number, number] = [x + sway, y0 + length * 0.33];
    const p2: [number, number] = [x + lean - sway * 0.8, y0 + length * 0.66];
    out.push({ d: blade(p0, p1, p2, p3, width) });
    if (r() > 0.55) {
      // A close twin running beside it, shorter.
      const off = width * 2.6 + r() * 4;
      out.push({ d: blade([p0[0] + off, p0[1] + length * 0.15], [p1[0] + off, p1[1]], [p2[0] + off, p2[1]],
        [p3[0] + off * 0.7, p3[1] - length * 0.2], width * 0.6) });
    }
    if (r() > 0.6) {
      // A branch peeling off sideways.
      const t = 0.3 + r() * 0.3;
      const bx = x + lean * t + sway * 0.3;
      const by = y0 + length * t;
      const dir = r() > 0.5 ? 1 : -1;
      out.push({ d: blade([bx, by], [bx + dir * gap * 0.5, by - 4], [bx + dir * gap * 0.9, by + 6],
        [bx + dir * gap * 1.2, by + 18 + r() * 14], width * 0.55, 10) });
    }
  }
  return out;
}
