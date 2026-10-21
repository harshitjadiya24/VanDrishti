// Kept apart from ForkScene so checking for WebGL does not load three.js.

/** True when this browser can create a WebGL context. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
