// src/utils.js
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap01 = (x) => ((x % 1) + 1) % 1;
export const smoothstep = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export function gaussWrapped(phase, mu, sigma) {
  let d = phase - mu;
  if (d > 0.5) d -= 1;
  else if (d < -0.5) d += 1;
  return Math.exp(-0.5 * (d / sigma) * (d / sigma));
}

export function inArc(a, b, x) {
  a = wrap01(a);
  b = wrap01(b);
  x = wrap01(x);
  return a <= b ? x >= a && x < b : x >= a || x < b;
}

export function midArc(a, b) {
  a = wrap01(a);
  b = wrap01(b);
  if (a <= b) return (a + b) / 2;
  let m = (a + (b + 1)) / 2;
  return m >= 1 ? m - 1 : m;
}
